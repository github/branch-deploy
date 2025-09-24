import * as core from '@actions/core'
import {actionStatus} from './action-status'
import dedent from 'dedent-js'
import {LOCK_METADATA} from './lock-metadata'
import {constructValidBranchName} from './valid-branch-name'
import {COLORS} from './colors'
import {API_HEADERS} from './api-headers'

// Constants for the lock file
const LOCK_BRANCH_SUFFIX = LOCK_METADATA.lockBranchSuffix
const GLOBAL_LOCK_BRANCH = LOCK_METADATA.globalLockBranch

// Helper function to find the environment to be unlocked (if any - otherwise, the default)
// This function will also check if the global lock flag was provided
// If the global lock flag was provided, the environment will be set to null
// :param context: The GitHub Actions event context
// :returns: An object - EX: {environment: 'staging', global: false, task: 'backend'}
async function findEnvironment(context) {
  // Get the body of the comment
  var body = context.payload.comment.body.trim()

  // remove the --reason <text> from the body if it exists
  if (body.includes('--reason')) {
    core.debug(
      `'--reason' found in unlock comment body: ${body} - attempting to remove for environment checks`
    )
    body = body.split('--reason')[0]
    core.debug(`comment body after '--reason' removal: ${body}`)
  }

  // Get the global lock flag from the Action input
  const globalFlag = core.getInput('global_lock_flag').trim()

  // Check if the global lock flag was provided
  if (body.includes(globalFlag) === true) {
    return {
      environment: null,
      global: true
    }
  }

  // remove the unlock command from the body
  const unlockTrigger = core.getInput('unlock_trigger').trim()
  body = body.replace(unlockTrigger, '').trim()

  // Parse task parameter if present (e.g., "--task backend")
  let task = null
  if (body.includes('--task')) {
    const taskMatch = body.match(/--task\s+(\S+)/)
    if (taskMatch) {
      task = taskMatch[1]
      body = body.replace(/--task\s+\S+/, '').trim()
    }
  }

  // If the body is empty, return the default environment
  if (body === '') {
    return {
      environment: core.getInput('environment').trim(),
      global: false,
      task: task
    }
  } else {
    // If there is anything left in the body, return that as the environment
    return {
      environment: body,
      global: false,
      task: task
    }
  }
}

// Helper function for releasing a deployment lock
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param reactionId: The ID of the reaction to add to the issue comment (only used if the lock is successfully released) (Integer)
// :param environment: The environment to remove the lock from (String) - can be null and if so, the environment will be determined from the context
// :param silent: A bool indicating whether to add a comment to the issue or not (Boolean)
// :param task: The task to remove the lock for (String) - optional for concurrent deployments
// :returns: true if the lock was successfully released, a string with some details if silent was used, false otherwise
export async function unlock(
  octokit,
  context,
  reactionId,
  environment = null,
  silent = false,
  task = null
) {
  try {
    var branchName
    var global
    // Find the environment from the context if it was not passed in
    // If the environment is not being passed in, we can safely assuming that this function is not being called from a post-deploy Action and instead, it is being directly called from an IssueOps command
    if (environment === null) {
      const envObject = await findEnvironment(context)
      environment = envObject.environment
      global = envObject.global
      // Use task from comment if not provided as parameter
      if (task === null) {
        task = envObject.task
      }
    } else {
      // if the environment was passed in, we can assume it is not a global lock
      global = false
    }

    // construct the branch name and success message text
    var successText = ''
    if (global === true) {
      branchName = GLOBAL_LOCK_BRANCH
      successText = '`global`'
    } else {
      // Include task in the branch name if provided to support concurrent deployments
      const taskSuffix = task ? `-${constructValidBranchName(task)}` : ''
      branchName = `${constructValidBranchName(environment)}${taskSuffix}-${LOCK_BRANCH_SUFFIX}`
      successText = `\`${environment}${task ? ` (task: ${task})` : ''}\``
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
      if (global === true) {
        core.setOutput('global_lock_released', 'true')
      }

      // Construct the message to add to the issue comment
      const comment = dedent(`
      ### 🔓 Deployment Lock Removed

      The ${successText} deployment lock has been successfully removed
      `)

      // Set the action status with the comment
      await actionStatus(context, octokit, reactionId, comment, true, true)

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

      await actionStatus(context, octokit, reactionId, comment, false)
      return false
    }
  } catch (error) {
    // debug the error msg
    core.debug(`unlock() error.status: ${error.status}`)
    core.debug(`unlock() error.message: ${error.message}`)

    // The the error caught was a 422 - Reference does not exist, this is OK - It means the lock branch does not exist
    if (
      error.status === 422 &&
      error.message.startsWith('Reference does not exist')
    ) {
      // If silent, exit here
      if (silent) {
        core.debug('no deployment lock currently set - silent')
        return 'no deployment lock currently set - silent'
      }

      // Format the comment
      var noLockMsg
      if (global === true) {
        noLockMsg = '🔓 There is currently no `global` deployment lock set'
      } else {
        noLockMsg = `🔓 There is currently no \`${environment}\` deployment lock set`
      }

      // Leave a comment letting the user know there is no lock to release
      await actionStatus(
        context,
        octokit,
        reactionId,
        noLockMsg,
        true, // success
        true // alt success reaction (ususally thumbs up)
      )

      // Return true since there is no lock to release
      return true
    }

    // If silent, exit here
    if (silent) {
      throw new Error(error)
    }

    // Update the PR with the error
    await actionStatus(context, octokit, reactionId, error.message, false)

    throw new Error(error)
  }
}
