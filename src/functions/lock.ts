import {createHash} from 'node:crypto'
import * as core from '../actions-core.ts'
import {dedent} from './dedent.ts'
import {checkLockFile, InvalidLockFileError} from './check-lock-file.ts'
import {actionStatus} from './action-status.ts'
import {constructValidBranchName} from './valid-branch-name.ts'
import {timeDiff} from './time-diff.ts'
import {LOCK_METADATA} from './lock-metadata.ts'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {formatLockReason} from './format-lock-reason.ts'
import {getActionInput, saveActionState, setActionOutput} from '../action-io.ts'
import {
  issueCommentContext,
  legacyApiError,
  legacyArrayElement,
  legacyStrictTrue,
  legacyTruthy
} from '../trust-boundaries.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  LockData,
  LockResponse
} from '../types.ts'

// Constants for the lock file
const LOCK_BRANCH_SUFFIX = LOCK_METADATA.lockBranchSuffix
const GLOBAL_LOCK_BRANCH = LOCK_METADATA.globalLockBranch
const LOCK_FILE = LOCK_METADATA.lockFile
const LOCK_COMMIT_MSG = LOCK_METADATA.lockCommitMsg

type CreateRefMethod = BranchDeployOctokit['rest']['git']['createRef']
type CreateRefParameters = Parameters<CreateRefMethod>[0]
type CreateBlobMethod = BranchDeployOctokit['rest']['git']['createBlob']
type CreateBlobParameters = Parameters<CreateBlobMethod>[0]
type CreateCommitMethod = BranchDeployOctokit['rest']['git']['createCommit']
type CreateCommitParameters = Parameters<CreateCommitMethod>[0]
type CreateTreeMethod = BranchDeployOctokit['rest']['git']['createTree']
type CreateTreeParameters = Parameters<CreateTreeMethod>[0]
type GetRepositoryMethod = BranchDeployOctokit['rest']['repos']['get']
type GetRepositoryParameters = Parameters<GetRepositoryMethod>[0]
type FullGetRepositoryResponse = Awaited<ReturnType<GetRepositoryMethod>>
type GetBranchMethod = BranchDeployOctokit['rest']['repos']['getBranch']
type GetBranchParameters = Parameters<GetBranchMethod>[0]
type FullGetBranchResponse = Awaited<ReturnType<GetBranchMethod>>
type GetContentMethod = BranchDeployOctokit['rest']['repos']['getContent']
type GetContentParameters = Parameters<GetContentMethod>[0]
type CreateCommentMethod =
  BranchDeployOctokit['rest']['issues']['createComment']
type CreateCommentParameters = Parameters<CreateCommentMethod>[0]
type CreateReactionMethod =
  BranchDeployOctokit['rest']['reactions']['createForIssueComment']
type CreateReactionParameters = Parameters<CreateReactionMethod>[0]
type DeleteReactionMethod =
  BranchDeployOctokit['rest']['reactions']['deleteForIssueComment']
type DeleteReactionParameters = Parameters<DeleteReactionMethod>[0]

export interface LockOctokit {
  readonly rest: {
    readonly git: {
      readonly createBlob: (
        parameters?: CreateBlobParameters
      ) => Promise<{readonly data: {readonly sha: string}}>
      readonly createCommit: (
        parameters?: CreateCommitParameters
      ) => Promise<{readonly data: {readonly sha: string}}>
      readonly createRef: (parameters?: CreateRefParameters) => Promise<unknown>
      readonly createTree: (
        parameters?: CreateTreeParameters
      ) => Promise<{readonly data: {readonly sha: string}}>
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
    readonly repos: {
      readonly get: (parameters?: GetRepositoryParameters) => Promise<{
        readonly data: Pick<FullGetRepositoryResponse['data'], 'default_branch'>
      }>
      readonly getBranch: (parameters?: GetBranchParameters) => Promise<{
        readonly data: {
          readonly commit: Pick<
            FullGetBranchResponse['data']['commit'],
            'sha'
          > & {
            readonly commit?: {
              readonly tree?: {readonly sha?: string}
            }
          }
        }
      }>
      readonly getContent: (
        parameters?: GetContentParameters
      ) => Promise<{readonly data: unknown}>
    }
  }
}

// Helper function to construct the branch name
// :param environment: The name of the environment
// :param global: A bool indicating whether the lock is global or not
// :returns: The branch name (String)
function constructBranchName(
  environment: string | null,
  global: boolean
): string {
  // If the lock is global, return the global lock branch name
  if (global) {
    return GLOBAL_LOCK_BRANCH
  }

  // If the lock is not global, return the environment-specific lock branch name
  return `${String(constructValidBranchName(environment))}-${LOCK_BRANCH_SUFFIX}`
}

type CreateLockResult =
  | {readonly kind: 'ambiguous'}
  | {
      readonly kind: 'created'
      readonly lockData: LockData
      readonly lockRefSha: string
    }
  | {
      readonly kind: 'existing'
      readonly lockData: LockData
      readonly lockRefSha: string
    }

function constructClaimId(
  context: BranchDeployContext,
  ref: string | null,
  sticky: boolean | null,
  environment: string | null,
  global: boolean
): string {
  const claim = {
    repository: {owner: context.repo.owner, name: context.repo.repo},
    issue_number: context.issue.number,
    comment_id: issueCommentContext(context).payload.comment.id,
    target: {environment, global},
    ref,
    sticky
  } as const
  return `sha256:${createHash('sha256').update(JSON.stringify(claim)).digest('hex')}`
}

function constructLockData(
  context: BranchDeployContext,
  ref: string | null,
  reason: unknown,
  sticky: boolean | null,
  environment: string | null,
  global: boolean
): LockData {
  const {owner, repo} = context.repo
  return {
    schema_version: 1,
    reason,
    branch: ref,
    created_at: new Date().toISOString(),
    created_by: context.actor,
    sticky,
    environment,
    global,
    unlock_command: constructUnlockCommand(environment, global),
    link: `${String(process.env['GITHUB_SERVER_URL'])}/${owner}/${repo}/pull/${context.issue.number}#issuecomment-${issueCommentContext(context).payload.comment.id}`,
    claim_id: constructClaimId(context, ref, sticky, environment, global)
  }
}

async function reportLockAcquired(
  octokit: LockOctokit,
  context: BranchDeployContext,
  lockData: LockData,
  sticky: boolean | null,
  environment: string | null,
  global: boolean,
  reactionId: number | null,
  leaveComment: boolean
): Promise<void> {
  if (global) {
    core.info(
      `🌎 this is a request for a ${COLORS.highlight}global${COLORS.reset} deployment lock`
    )
  }

  core.info('✅ deployment lock obtained')
  // If the lock is sticky, always leave a comment unless we are running in the context of a "sticky_locks" deployment
  // AKA hubot style deployments
  if (sticky === true && leaveComment) {
    core.info(`🍯 deployment lock is ${COLORS.highlight}sticky`)

    // create a special comment section for global locks
    let globalMsg = ''
    let lockMsg
    if (global) {
      globalMsg =
        'This is a **global** deploy lock - All environments are now locked'
      lockMsg = '**globally**'
      setActionOutput('global_lock_claimed', 'true')
    } else {
      lockMsg = `to the \`${String(environment)}\` environment`
    }

    const comment = dedent(`
    ### 🔒 Deployment Lock Claimed

    ${globalMsg}

    You are now the only user that can trigger deployments ${lockMsg} until the deployment lock is removed

    > This lock is _sticky_ and will persist until someone runs \`${lockData.unlock_command}\`
    `)

    // If the lock is sticky, this means that it was invoked with `.lock` and not from a deployment
    // In this case, we update the actionStatus as we are about to exit
    await actionStatus({
      context,
      octokit,
      reactionId,
      message: comment,
      result: 'alternate-success'
    })
  }
}

// Build the complete lock commit before atomically publishing its branch ref.
async function createLock(
  octokit: LockOctokit,
  context: BranchDeployContext,
  ref: string | null,
  reason: unknown,
  sticky: boolean | null,
  environment: string | null,
  global: boolean,
  reactionId: number | null,
  leaveComment: boolean,
  branchName: string
): Promise<CreateLockResult> {
  core.debug('attempting to create lock...')
  const lockData = constructLockData(
    context,
    ref,
    reason,
    sticky,
    environment,
    global
  )
  const lockContents = JSON.stringify(lockData)
  const repository = await octokit.rest.repos.get({
    ...context.repo,
    headers: API_HEADERS
  })
  const baseBranch = await octokit.rest.repos.getBranch({
    ...context.repo,
    branch: repository.data.default_branch,
    headers: API_HEADERS
  })
  const baseTreeSha = baseBranch.data.commit.commit?.tree?.sha
  if (baseTreeSha === undefined) {
    throw new Error('The default branch response did not include a tree SHA')
  }
  const blob = await octokit.rest.git.createBlob({
    ...context.repo,
    content: lockContents,
    encoding: 'utf-8',
    headers: API_HEADERS
  })
  const tree = await octokit.rest.git.createTree({
    ...context.repo,
    base_tree: baseTreeSha,
    tree: [
      {
        path: LOCK_FILE,
        mode: '100644',
        type: 'blob',
        sha: blob.data.sha
      }
    ],
    headers: API_HEADERS
  })
  const commit = await octokit.rest.git.createCommit({
    ...context.repo,
    message: LOCK_COMMIT_MSG,
    tree: tree.data.sha,
    parents: [baseBranch.data.commit.sha],
    headers: API_HEADERS
  })

  try {
    await octokit.rest.git.createRef({
      ...context.repo,
      ref: `refs/heads/${branchName}`,
      sha: commit.data.sha,
      headers: API_HEADERS
    })
  } catch (error) {
    const status = legacyApiError(error).status
    if (status !== 409 && status !== 422) {
      throw error
    }
    if (!(await checkBranch(octokit, context, branchName))) {
      throw error
    }
    try {
      const branch = await octokit.rest.repos.getBranch({
        ...context.repo,
        branch: branchName,
        headers: API_HEADERS
      })
      const lockRefSha = branch.data.commit.sha
      const existingLock = await checkLockFile(octokit, context, lockRefSha)
      return existingLock === false
        ? {kind: 'ambiguous'}
        : {kind: 'existing', lockData: existingLock, lockRefSha}
    } catch (readError) {
      if (readError instanceof InvalidLockFileError) {
        return {kind: 'ambiguous'}
      }
      throw readError
    }
  }

  core.info(`🔒 created lock branch: ${COLORS.highlight}${branchName}`)
  if (sticky === false) {
    saveActionState('lock_ref_sha', commit.data.sha)
  }
  await reportLockAcquired(
    octokit,
    context,
    lockData,
    sticky,
    environment,
    global,
    reactionId,
    leaveComment
  )
  return {kind: 'created', lockData, lockRefSha: commit.data.sha}
}

// Helper function to construct the unlock command
// :param environment: The name of the environment
// :param global: A bool indicating whether the lock is global or not
// :returns: The unlock command (String)
function constructUnlockCommand(
  environment: string | null,
  global: boolean
): string {
  // fetch the unlock trigger
  const unlockTrigger = getActionInput('unlock_trigger').trim()
  // fetch the global lock flag
  const globalFlag = getActionInput('global_lock_flag').trim()

  // If the lock is global, return the global lock branch name
  if (global) {
    return `${unlockTrigger} ${globalFlag}`
  }

  // If the lock is not global, return the environment-specific lock branch name
  return `${unlockTrigger} ${String(environment)}`
}

// Helper function to find the environment to be locked (if any - otherwise, the default)
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

  // Get the global lock flag from the Action input
  const globalFlag = getActionInput('global_lock_flag').trim()

  // Check if the global lock flag was provided
  if (body.includes(globalFlag)) {
    return {
      environment: null,
      global: true
    }
  }

  // also remove any lock flags from the body
  LOCK_METADATA.lockInfoFlags.forEach(flag => {
    body = body.replace(flag, '').trim()
  })

  // remove everything from the body after --reason
  if (body.includes('--reason')) {
    body = legacyArrayElement(body.split('--reason')[0]).trim()
  }

  // remove the lock command from the body
  const lockTrigger = getActionInput('lock_trigger').trim()
  body = body.replace(lockTrigger, '').trim()

  // remove the lock info alias command from the body
  const lockInfoAlias = getActionInput('lock_info_alias').trim()
  body = body.replace(lockInfoAlias, '').trim()

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

// Helper function to find a --reason flag in the comment body for a lock request
// :param context: The GitHub Actions event context
// :param sticky: A bool indicating whether the lock is sticky or not (should persist forever) - non-sticky locks are inherent from deployments
// :returns: The reason for the lock request - either a string of text or null if no reason was provided
function findReason(
  context: BranchDeployContext,
  sticky: boolean | null
): string | null {
  // If if not sticky, return deployment as the reason
  if (sticky === false) {
    return 'deployment'
  }

  // Get the global lock flag from the Action input
  const globalFlag = getActionInput('global_lock_flag').trim()

  // Get the body of the comment and remove the global lock flag from the string
  const body = issueCommentContext(context)
    .payload.comment.body.trim()
    .replace(globalFlag, '')
    .trim()

  // Check if --reason was provided
  if (!body.includes('--reason')) {
    // If no reason was provided, return null
    return null
  }

  // Find the --reason flag in the body
  const reasonRaw = body.split('--reason')[1]

  // Remove whitespace
  const reason = legacyArrayElement(reasonRaw).trim()

  // If the reason is empty, return null
  if (reason === '') {
    return null
  }

  // Return the reason for the lock request
  core.debug(`reason: ${reason}`)
  return reason
}

// Helper function to check if a given branch exists
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param branchName: The name of the branch to check
// :return: true if the branch exists, false if not
export async function checkBranch(
  octokit: LockOctokit,
  context: BranchDeployContext,
  branchName: string
): Promise<boolean> {
  core.debug(`checking if branch ${branchName} exists...`)
  // Check if the lock branch already exists
  try {
    await octokit.rest.repos.getBranch({
      ...context.repo,
      branch: branchName,
      headers: API_HEADERS
    })

    core.debug(`branch '${branchName}' exists`)
    return true
  } catch (error) {
    const apiError = legacyApiError(error)
    core.debug(`checkBranch() error.status: ${String(apiError.status)}`)
    // Check if the error was due to the lock branch not existing
    if (apiError.status === 404) {
      core.debug(`lock branch ${branchName} does not exist`)
      return false
    } else {
      core.error(
        'an unexpected status code was returned while checking for the lock branch'
      )
      throw new Error(String(error))
    }
  }
}

// Helper function to check the lock owner
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param lockData: The lock file contents
// :param sticky: A bool indicating whether the lock is sticky or not (should persist forever) - non-sticky locks are inherent from deployments
// :param reactionId: The ID of the reaction that triggered the lock request
// :param leaveComment: A bool indicating whether to leave a comment or not (default: true)
// :return: true if the lock owner is the requestor, false if not
async function checkLockOwner(
  octokit: LockOctokit,
  context: BranchDeployContext,
  lockData: LockData,
  sticky: boolean | null,
  reactionId: number | null,
  leaveComment: boolean
): Promise<boolean> {
  core.debug('checking the owner of the lock...')
  // If the requestor is the one who owns the lock, return 'owner'
  if (lockData.created_by === context.actor) {
    core.info(
      `✅ ${COLORS.highlight}${context.actor}${COLORS.reset} initiated this request and is also the owner of the current lock`
    )

    // If this is a '.lock' command (sticky) and not a sticky_locks deployment request, update with actionStatus as we are about to exit
    if (sticky === true && leaveComment) {
      // Find the total time since the lock was created
      const totalTime = timeDiff(lockData.created_at, new Date().toISOString())

      let lockMsg
      if (legacyStrictTrue(lockData.global)) {
        lockMsg = 'global'
      } else {
        lockMsg = `\`${String(lockData.environment)}\` environment`
      }

      const youOwnItComment = dedent(`
        ### 🔒 Deployment Lock Information

        __${context.actor}__, you are already the owner of the current ${lockMsg} deployment lock

        The current lock has been active for \`${totalTime}\`

        > If you need to release the lock, please comment \`${lockData.unlock_command}\`
        `)

      await actionStatus({
        context,
        octokit,
        reactionId,
        message: youOwnItComment,
        result: 'alternate-success'
      })
    }

    return true
  }

  // Deconstruct the context to obtain the owner and repo
  const {owner, repo} = context.repo

  // Find the total time since the lock was created
  const totalTime = timeDiff(lockData.created_at, new Date().toISOString())

  // Set the header if it is sticky or not (aka a deployment or a direct invoke of .lock)
  let header = ''
  if (sticky === true) {
    header = 'claim deployment lock'
  } else {
    header = 'proceed with deployment'
  }

  // dynamic reason text
  let reasonText = ''
  if (legacyTruthy(lockData.reason)) {
    reasonText = formatLockReason(lockData.reason)
  } else {
    core.debug('no reason detected')
  }

  // dynamic lock text
  let lockText = ''
  let environmentText = ''
  let lockBranchForLink: string
  if (legacyStrictTrue(lockData.global)) {
    lockText = dedent(
      `the \`global\` deployment lock is currently claimed by __${lockData.created_by}__

      A \`global\` deployment lock prevents all other users from deploying to any environment except for the owner of the lock
      `
    )
    lockBranchForLink = GLOBAL_LOCK_BRANCH
  } else {
    lockText = `the \`${String(lockData.environment)}\` environment deployment lock is currently claimed by __${lockData.created_by}__`
    environmentText = `- __Environment__: \`${String(lockData.environment)}\``
    lockBranchForLink = `${String(lockData.environment)}-${LOCK_BRANCH_SUFFIX}`
  }

  // Construct the comment to add to the issue, alerting that the lock is already claimed
  const commentHeader = dedent(`
  ### ⚠️ Cannot ${header}

  Sorry __${context.actor}__, ${lockText}

  #### Lock Details 🔒
  `)

  const commentDetails = dedent(`
  ${environmentText}
  - __Branch__: \`${String(lockData.branch)}\`
  - __Created At__: \`${lockData.created_at}\`
  - __Created By__: \`${lockData.created_by}\`
  - __Sticky__: \`${String(lockData.sticky)}\`
  - __Global__: \`${lockData.global}\`
  - __Comment Link__: [click here](${lockData.link})
  - __Lock Link__: [click here](${String(process.env['GITHUB_SERVER_URL'])}/${owner}/${repo}/blob/${lockBranchForLink}/${LOCK_FILE})

  The current lock has been active for \`${totalTime}\`

  > If you need to release the lock, please comment \`${lockData.unlock_command}\`
  `)
  const comment = [commentHeader, reasonText, commentDetails]
    .filter(part => part !== '')
    .join('\n\n')

  // Set the action status with the comment
  await actionStatus({context, octokit, reactionId, message: comment})

  // Set the bypass state to true so that the post run logic will not run
  saveActionState('bypass', 'true')
  core.setFailed(comment)

  // Return false to indicate that the lock was not claimed
  core.debug(
    `the lock was not claimed as it is owned by ${lockData.created_by}`
  )
  return false
}

interface ExistingLockRequest {
  readonly claimId: string
  readonly context: BranchDeployContext
  readonly environment: string | null
  readonly global: boolean
  readonly globalFlag: string
  readonly leaveComment: boolean
  readonly lockData: LockData
  readonly octokit: LockOctokit
  readonly reactionId: number | null
  readonly sticky: boolean | null
}

async function existingLockResponse({
  claimId,
  context,
  environment,
  global,
  globalFlag,
  leaveComment,
  lockData,
  octokit,
  reactionId,
  sticky
}: ExistingLockRequest): Promise<LockResponse> {
  if (lockData.claim_id === claimId) {
    core.info('✅ this deployment lock claim was already acquired')
    return {
      status: 'owner',
      lockData,
      globalFlag,
      environment,
      global
    }
  }

  const lockOwner = await checkLockOwner(
    octokit,
    context,
    lockData,
    sticky,
    reactionId,
    leaveComment
  )
  return {
    status: lockOwner ? 'owner' : false,
    lockData,
    globalFlag,
    environment,
    global
  }
}

interface AmbiguousLockRequest {
  readonly branchName: string
  readonly context: BranchDeployContext
  readonly environment: string | null
  readonly global: boolean
  readonly globalFlag: string
  readonly octokit: LockOctokit
  readonly reactionId: number | null
}

function saveOwnedLockRef(
  lockRefSha: string,
  sticky: boolean | null,
  response: LockResponse
): LockResponse {
  if (sticky !== false || response.status !== 'owner') return response

  saveActionState('lock_ref_sha', lockRefSha)
  return {...response, lockRefSha}
}

async function ambiguousLockResponse({
  branchName,
  context,
  environment,
  global,
  globalFlag,
  octokit,
  reactionId
}: AmbiguousLockRequest): Promise<LockResponse> {
  const unlockCommand = constructUnlockCommand(environment, global)
  const message = dedent(`
    ### ⚠️ Cannot process deployment lock

    The lock branch \`${branchName}\` exists but does not contain a readable \`${LOCK_FILE}\`. The Action will not repair or claim an ambiguous lock automatically.

    > A maintainer should [inspect the lock branch](${String(process.env['GITHUB_SERVER_URL'])}/${context.repo.owner}/${context.repo.repo}/tree/${branchName}) and then run \`${unlockCommand}\` if the branch should be removed.
  `)
  await actionStatus({context, octokit, reactionId, message})
  saveActionState('bypass', 'true')
  core.setFailed(message)
  return {
    status: 'ambiguous',
    lockData: null,
    globalFlag,
    environment,
    global
  }
}

export interface LockRequest {
  readonly context: BranchDeployContext
  readonly environment: string | null
  readonly leaveComment: boolean
  readonly mode:
    | {readonly postDeployStep: boolean; readonly type: 'acquire'}
    | {readonly postDeployStep: boolean; readonly type: 'details'}
  readonly octokit: LockOctokit
  readonly reactionId: number | null
  readonly ref: string | null
  readonly sticky: boolean | null
}

// Helper function for claiming a deployment lock
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param ref: The branch which requested the lock / deployment
// :param reactionId: The ID of the reaction to add to the issue comment (use if the lock is already claimed or if we claimed it with 'sticky')
// :param sticky: A bool indicating whether the lock is sticky or not (should persist forever)
// :param environment: The environment to lock (can be passed in if already known - otherwise we try and find it)
// :param detailsOnly: A bool indicating whether to only return the details of the lock and not alter its state
// :param postDeployStep: A bool indicating whether this function is being called from the post-deploy step
// :param leaveComment: A bool indicating whether to leave a comment or not (default: true)
// :returns: A lock repsponse object
// Example:
// {
//   status: 'owner' | 'ambiguous' | false | true | null | 'details-only',
//   lockData: Object,
//   globalFlag: String (--global for example),
//   environment: String (production for example)
//   global: Boolean (true if the request is for a global lock)
// }
// status: 'owner' - the lock was already claimed by the requestor
// status: 'ambiguous' - the lock branch exists without a readable lock file
// status: false - the lock was not claimed
// status: true - the lock was claimed
// status: null - no lock exists
// status: 'details-only' - the lock details were returned, but the lock was not claimed
export async function lock(request: LockRequest): Promise<LockResponse> {
  const {context, leaveComment, mode, octokit, reactionId, ref, sticky} =
    request
  let environment = request.environment
  let global: boolean
  const detailsOnly = mode.type === 'details'
  const postDeployStep = mode.postDeployStep

  core.debug(`lock() called with ref: ${String(ref)}`)
  core.debug(`lock() called with sticky: ${String(sticky)}`)
  core.debug(`lock() called with environment: ${String(environment)}`)
  core.debug(`lock() called with detailsOnly: ${detailsOnly}`)
  core.debug(`lock() called with postDeployStep: ${postDeployStep}`)

  // find the global flag for returning
  const globalFlag = getActionInput('global_lock_flag').trim()

  // Attempt to obtain a reason from the context for the lock - either a string or null
  const reason = findReason(context, sticky)

  // Find the environment from the context if it was not passed in
  if (environment === null) {
    const envObject = findEnvironment(context)
    environment = envObject.environment
    global = envObject.global
  } else {
    // if the environment was passed in, we can assume it is not a global lock
    global = false
  }

  // construct the branch name for the lock
  const branchName = constructBranchName(environment, global)
  const claimId = constructClaimId(context, ref, sticky, environment, global)

  // lock debug info
  core.debug(`detected lock env: ${String(environment)}`)
  core.debug(`detected lock global: ${global}`)
  core.debug(`constructed lock branch name: ${branchName}`)

  // Before we can process THIS lock request, we must first check for a global lock
  // If there is a global lock, we must check if the requestor is the owner of the lock
  // We can only proceed here if there is NO global lock or if the requestor is the owner of the global lock
  // We can just jump directly to checking the lock file
  let globalLockData: false | LockData
  let globalBranchExists: boolean | undefined
  try {
    globalLockData = await checkLockFile(octokit, context, GLOBAL_LOCK_BRANCH)
  } catch (error) {
    if (error instanceof InvalidLockFileError) {
      return ambiguousLockResponse({
        branchName: GLOBAL_LOCK_BRANCH,
        context,
        environment: null,
        global: true,
        globalFlag,
        octokit,
        reactionId
      })
    }
    throw error
  }
  if (globalLockData === false) {
    globalBranchExists = await checkBranch(octokit, context, GLOBAL_LOCK_BRANCH)
    if (globalBranchExists) {
      return ambiguousLockResponse({
        branchName: GLOBAL_LOCK_BRANCH,
        context,
        environment: null,
        global: true,
        globalFlag,
        octokit,
        reactionId
      })
    }
  }

  if (legacyTruthy(globalLockData) && detailsOnly && !postDeployStep) {
    // If the lock file exists and this is a detailsOnly request for the global lock, return the lock data
    return {
      status: 'details-only',
      lockData: globalLockData,
      globalFlag,
      environment,
      global
    }
  }

  // If the global lock exists, check if the requestor is the owner
  if (legacyTruthy(globalLockData) && !postDeployStep) {
    const globalLockResponse = await existingLockResponse({
      claimId,
      context,
      environment,
      global,
      globalFlag,
      leaveComment,
      lockData: globalLockData,
      octokit,
      reactionId,
      sticky
    })
    if (global) {
      return globalLockResponse
    }
    core.debug('global lock exists - checking if requestor is the owner')
    if (globalLockResponse.status === false) {
      // If the requestor is not the owner of the global lock, return false
      core.debug('requestor is not the owner of the current global lock')
      return {status: false, lockData: null, globalFlag, environment, global}
    } else {
      core.debug(
        'requestor is the owner of the global lock - continuing checks'
      )
    }
  }

  // Check if the lock branch exists
  const branchExists =
    branchName === GLOBAL_LOCK_BRANCH && globalBranchExists !== undefined
      ? globalBranchExists
      : await checkBranch(octokit, context, branchName)

  if (!branchExists && detailsOnly) {
    // If the lock branch doesn't exist and this is a detailsOnly request, return null
    core.debug('lock branch does not exist and this is a detailsOnly request')
    return {status: null, lockData: null, globalFlag, environment, global}
  }

  if (branchExists) {
    const lockRef =
      !detailsOnly && sticky === false
        ? (
            await octokit.rest.repos.getBranch({
              ...context.repo,
              branch: branchName,
              headers: API_HEADERS
            })
          ).data.commit.sha
        : branchName
    // Check if the lock file exists
    let lockData: false | LockData
    try {
      lockData = await checkLockFile(octokit, context, lockRef)
    } catch (error) {
      if (error instanceof InvalidLockFileError) {
        return ambiguousLockResponse({
          branchName,
          context,
          environment,
          global,
          globalFlag,
          octokit,
          reactionId
        })
      }
      throw error
    }

    if (!legacyTruthy(lockData)) {
      return ambiguousLockResponse({
        branchName,
        context,
        environment,
        global,
        globalFlag,
        octokit,
        reactionId
      })
    }

    if (detailsOnly) {
      // If the lock file exists and this is a detailsOnly request, return the lock data
      return {
        status: 'details-only',
        lockData,
        globalFlag,
        environment,
        global
      }
    }

    return saveOwnedLockRef(
      lockRef,
      sticky,
      await existingLockResponse({
        claimId,
        context,
        environment,
        global,
        globalFlag,
        leaveComment,
        lockData,
        octokit,
        reactionId,
        sticky
      })
    )
  }

  // Build the complete lock commit and publish the branch as one visible step.
  const creation = await createLock(
    octokit,
    context,
    ref,
    reason,
    sticky,
    environment,
    global,
    reactionId,
    leaveComment,
    branchName
  )
  if (creation.kind === 'created') {
    return {
      status: true,
      lockData: null,
      globalFlag,
      environment,
      global,
      lockRefSha: creation.lockRefSha
    }
  }
  if (creation.kind === 'ambiguous') {
    return ambiguousLockResponse({
      branchName,
      context,
      environment,
      global,
      globalFlag,
      octokit,
      reactionId
    })
  }
  return saveOwnedLockRef(
    creation.lockRefSha,
    sticky,
    await existingLockResponse({
      claimId,
      context,
      environment,
      global,
      globalFlag,
      leaveComment,
      lockData: creation.lockData,
      octokit,
      reactionId,
      sticky
    })
  )
}
