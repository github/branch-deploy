import * as core from '../actions-core.ts'
import {actionStatus} from './action-status.ts'
import {dedent} from './dedent.ts'
import {LOCK_METADATA} from './lock-metadata.ts'
import {constructValidBranchName} from './valid-branch-name.ts'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {getActionInput, setActionOutput} from '../action-io.ts'
import {
  issueCommentContext,
  legacyApiError,
  legacyArrayElement
} from '../trust-boundaries.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

// Constants for the lock file
const LOCK_BRANCH_SUFFIX = LOCK_METADATA.lockBranchSuffix
const GLOBAL_LOCK_BRANCH = LOCK_METADATA.globalLockBranch

type DeleteRefMethod = BranchDeployOctokit['rest']['git']['deleteRef']
type DeleteRefParameters = Parameters<DeleteRefMethod>[0]
type CreateCommentMethod =
  BranchDeployOctokit['rest']['issues']['createComment']
type CreateCommentParameters = Parameters<CreateCommentMethod>[0]
type CreateReactionMethod =
  BranchDeployOctokit['rest']['reactions']['createForIssueComment']
type CreateReactionParameters = Parameters<CreateReactionMethod>[0]
type DeleteReactionMethod =
  BranchDeployOctokit['rest']['reactions']['deleteForIssueComment']
type DeleteReactionParameters = Parameters<DeleteReactionMethod>[0]

export interface UnlockOctokit {
  readonly rest: {
    readonly git: {
      readonly deleteRef: (
        parameters?: DeleteRefParameters
      ) => Promise<{readonly status: number}>
    }
    readonly issues: {
      readonly createComment: (
        parameters?: CreateCommentParameters
      ) => Promise<unknown>
    }
    readonly reactions: {
      readonly createForIssueComment: (
        parameters?: CreateReactionParameters
      ) => Promise<unknown>
      readonly deleteForIssueComment: (
        parameters?: DeleteReactionParameters
      ) => Promise<unknown>
    }
  }
}

// Helper function to find the environment to be unlocked (if any - otherwise, the default)
// This function will also check if the global lock flag was provided
// If the global lock flag was provided, the environment will be set to null
// :param context: The GitHub Actions event context
// :returns: An object - EX: {environment: 'staging', global: false}
function findEnvironment(
  context: BranchDeployContext
):
  | {readonly environment: null; readonly global: true}
  | {readonly environment: string; readonly global: false} {
  // Get the body of the comment
  let body = issueCommentContext(context).payload.comment.body.trim()

  // remove the --reason <text> from the body if it exists
  if (body.includes('--reason')) {
    core.debug(
      `'--reason' found in unlock comment body: ${body} - attempting to remove for environment checks`
    )
    body = legacyArrayElement(body.split('--reason')[0])
    core.debug(`comment body after '--reason' removal: ${body}`)
  }

  // Get the global lock flag from the Action input
  const globalFlag = getActionInput('global_lock_flag').trim()

  // Check if the global lock flag was provided
  if (body.includes(globalFlag)) {
    return {
      environment: null,
      global: true
    }
  }

  // remove the unlock command from the body
  const unlockTrigger = getActionInput('unlock_trigger').trim()
  body = body.replace(unlockTrigger, '').trim()

  // If the body is empty, return the default environment
  if (body === '') {
    return {
      environment: getActionInput('environment').trim(),
      global: false
    }
  } else {
    // If there is anything left in the body, return that as the environment
    return {
      environment: body,
      global: false
    }
  }
}

interface UnlockRequestBase {
  readonly context: BranchDeployContext
  readonly octokit: UnlockOctokit
  readonly reactionId: number | null
  readonly target:
    | {readonly type: 'context'}
    | {readonly environment: string; readonly type: 'environment'}
}

export interface InteractiveUnlockRequest extends UnlockRequestBase {
  readonly mode: 'interactive'
}

export interface SilentUnlockRequest extends UnlockRequestBase {
  readonly mode: 'silent'
  readonly target: {readonly environment: string; readonly type: 'environment'}
}

export type SilentUnlockResult =
  | 'failed to delete lock (bad status code) - silent'
  | 'no deployment lock currently set - silent'
  | 'removed lock - silent'

// Helper function for releasing a deployment lock
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param reactionId: The ID of the reaction to add to the issue comment (only used if the lock is successfully released) (Integer)
// :param environment: The environment to remove the lock from (String) - can be null and if so, the environment will be determined from the context
// :param silent: A bool indicating whether to add a comment to the issue or not (Boolean)
// :returns: true if the lock was successfully released, a string with some details if silent was used, false otherwise
export async function unlock(
  request: SilentUnlockRequest
): Promise<SilentUnlockResult>
export async function unlock(
  request: InteractiveUnlockRequest
): Promise<boolean>
export async function unlock(
  request: InteractiveUnlockRequest | SilentUnlockRequest
): Promise<boolean | SilentUnlockResult> {
  const {context, octokit, reactionId} = request
  const silent = request.mode === 'silent'
  let environment =
    request.target.type === 'environment' ? request.target.environment : null
  let global: boolean | undefined
  try {
    let branchName: string
    // Find the environment from the context if it was not passed in
    // If the environment is not being passed in, we can safely assuming that this function is not being called from a post-deploy Action and instead, it is being directly called from an IssueOps command
    if (environment === null) {
      const envObject = findEnvironment(context)
      environment = envObject.environment
      global = envObject.global
    } else {
      // if the environment was passed in, we can assume it is not a global lock
      global = false
    }

    // construct the branch name and success message text
    let successText = ''
    if (global) {
      branchName = GLOBAL_LOCK_BRANCH
      successText = '`global`'
    } else {
      branchName = `${String(constructValidBranchName(environment))}-${LOCK_BRANCH_SUFFIX}`
      successText = `\`${String(environment)}\``
    }

    // Delete the lock branch
    const result = await octokit.rest.git.deleteRef({
      ...context.repo,
      ref: `heads/${branchName}`,
      headers: API_HEADERS
    })

    // If the lock was successfully released, return true
    if (result.status === 204) {
      core.info(
        `🔓 successfully ${COLORS.highlight}removed${COLORS.reset} lock`
      )

      // If silent, exit here
      if (silent) {
        core.debug('removing lock silently')
        return 'removed lock - silent'
      }

      // If a global lock was successfully released, set the output
      if (global) {
        setActionOutput('global_lock_released', 'true')
      }

      // Construct the message to add to the issue comment
      const comment = dedent(`
      ### 🔓 Deployment Lock Removed

      The ${successText} deployment lock has been successfully removed
      `)

      // Set the action status with the comment
      await actionStatus({
        context,
        octokit,
        reactionId,
        message: comment,
        result: 'alternate-success'
      })

      // Return true
      return true
    } else {
      // If the lock was not successfully released, return false and log the HTTP code
      const comment = `failed to delete lock branch: ${branchName} - HTTP: ${result.status}`
      core.info(comment)

      // If silent, exit here
      if (silent) {
        core.warning('failed to delete lock (bad status code) - silent')
        return 'failed to delete lock (bad status code) - silent'
      }

      await actionStatus({context, octokit, reactionId, message: comment})
      return false
    }
  } catch (error) {
    // debug the error msg
    const apiError = legacyApiError(error)
    core.debug(`unlock() error.status: ${String(apiError.status)}`)
    core.debug(`unlock() error.message: ${apiError.message}`)

    // The the error caught was a 422 - Reference does not exist, this is OK - It means the lock branch does not exist
    if (
      apiError.status === 422 &&
      apiError.message.startsWith('Reference does not exist')
    ) {
      // If silent, exit here
      if (silent) {
        core.debug('no deployment lock currently set - silent')
        return 'no deployment lock currently set - silent'
      }

      // Format the comment
      let noLockMsg: string
      if (global === true) {
        noLockMsg = '🔓 There is currently no `global` deployment lock set'
      } else {
        noLockMsg = `🔓 There is currently no \`${String(environment)}\` deployment lock set`
      }

      // Leave a comment letting the user know there is no lock to release
      await actionStatus({
        context,
        octokit,
        reactionId,
        message: noLockMsg,
        result: 'alternate-success'
      })

      // Return true since there is no lock to release
      return true
    }

    // If silent, exit here
    if (silent) {
      throw new Error(String(error))
    }

    // Update the PR with the error
    await actionStatus({
      context,
      octokit,
      reactionId,
      message: apiError.message
    })

    throw new Error(String(error))
  }
}
