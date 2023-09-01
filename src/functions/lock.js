import * as core from '@actions/core'
import dedent from 'dedent-js'
import {checkLockFile} from './check-lock-file'
import {actionStatus} from './action-status'
import {timeDiff} from './time-diff'
import {LOCK_METADATA} from './lock-metadata'
import {COLORS} from './colors'

// Constants for the lock file
const LOCK_BRANCH_SUFFIX = LOCK_METADATA.lockBranchSuffix
const GLOBAL_LOCK_BRANCH = LOCK_METADATA.globalLockBranch
const LOCK_FILE = LOCK_METADATA.lockFile
const LOCK_COMMIT_MSG = LOCK_METADATA.lockCommitMsg

// Helper function to construct the branch name
// :param environment: The name of the environment
// :param global: A bool indicating whether the lock is global or not
// :returns: The branch name (String)
async function constructBranchName(environment, global) {
  // If the lock is global, return the global lock branch name
  if (global === true) {
    return GLOBAL_LOCK_BRANCH
  }

  // If the lock is not global, return the environment-specific lock branch name
  return `${environment}-${LOCK_BRANCH_SUFFIX}`
}

// Helper function for creating a lock file for branch-deployment locks
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param ref: The branch which requested the lock / deployment
// :param reason: The reason for the deployment lock
// :param sticky: A bool indicating whether the lock is sticky or not (should persist forever)
// :param environment: The environment to lock
// :param global: A bool indicating whether the lock is global or not (should lock all environments)
// :param reactionId: The ID of the reaction that triggered the lock request
// :param leaveComment: A bool indicating whether to leave a comment or not (default: true)
// :returns: The result of the createOrUpdateFileContents API call
async function createLock(
  octokit,
  context,
  ref,
  reason,
  sticky,
  environment,
  global,
  reactionId,
  leaveComment = true
) {
  core.debug('attempting to create lock...')

  // Deconstruct the context to obtain the owner and repo
  const {owner, repo} = context.repo

  // Construct the file contents for the lock file
  // Use the 'sticky' flag to determine whether the lock is sticky or not
  // Sticky locks will persist forever unless the 'unlock on merge' mode is being utilized
  // non-sticky locks are tempory and only exist during the deployment process to prevent other deployments...
  // ... to the same environment
  const lockData = {
    reason: reason,
    branch: ref,
    created_at: new Date().toISOString(),
    created_by: context.actor,
    sticky: sticky,
    environment: environment,
    global: global,
    unlock_command: await constructUnlockCommand(environment, global),
    link: `${process.env.GITHUB_SERVER_URL}/${owner}/${repo}/pull/${context.issue.number}#issuecomment-${context.payload.comment.id}`
  }

  // Create the lock file
  const result = await octokit.rest.repos.createOrUpdateFileContents({
    ...context.repo,
    path: LOCK_FILE,
    message: LOCK_COMMIT_MSG,
    content: Buffer.from(JSON.stringify(lockData)).toString('base64'),
    branch: await constructBranchName(environment, global),
    request: {retries: 10, retryAfter: 1} // retry up to 10 times with a 1s delay
  })

  if (global === true) {
    core.info(
      `🌎 this is a request for a ${COLORS.highlight}global${COLORS.reset} deployment lock`
    )
  }

  // Write a log message stating the lock has been claimed
  core.info('✅ deployment lock obtained')
  // If the lock is sticky, always leave a comment unless we are running in the context of a "sticky_locks" deployment
  // AKA hubot style deployments
  if (sticky === true && leaveComment === true) {
    core.info(`🍯 deployment lock is ${COLORS.highlight}sticky`)

    // create a special comment section for global locks
    let globalMsg = ''
    let lockMsg
    if (global === true) {
      globalMsg =
        'This is a **global** deploy lock - All environments are now locked'
      lockMsg = '**globally**'
      core.setOutput('global_lock_claimed', 'true')
    } else {
      lockMsg = `to the \`${environment}\` environment`
    }

    const comment = dedent(`
    ### 🔒 Deployment Lock Claimed

    ${globalMsg}
    
    You are now the only user that can trigger deployments ${lockMsg} until the deployment lock is removed

    > This lock is _sticky_ and will persist until someone runs \`${lockData.unlock_command}\`
    `)

    // If the lock is sticky, this means that it was invoked with `.lock` and not from a deployment
    // In this case, we update the actionStatus as we are about to exit
    await actionStatus(context, octokit, reactionId, comment, true, true)
  }

  // Return the result of the lock file creation
  return result
}

// Helper function to construct the unlock command
// :param environment: The name of the environment
// :param global: A bool indicating whether the lock is global or not
// :returns: The unlock command (String)
async function constructUnlockCommand(environment, global) {
  // fetch the unlock trigger
  const unlockTrigger = core.getInput('unlock_trigger').trim()
  // fetch the global lock flag
  const globalFlag = core.getInput('global_lock_flag').trim()

  // If the lock is global, return the global lock branch name
  if (global === true) {
    return `${unlockTrigger} ${globalFlag}`
  }

  // If the lock is not global, return the environment-specific lock branch name
  return `${unlockTrigger} ${environment}`
}

// Helper function to find the environment to be locked (if any - otherwise, the default)
// This function will also check if the global lock flag was provided
// If the global lock flag was provided, the environment will be set to null
// :param context: The GitHub Actions event context
// :returns: An object - EX: {environment: 'staging', global: false}
async function findEnvironment(context) {
  // Get the body of the comment
  var body = context.payload.comment.body.trim()

  // Get the global lock flag from the Action input
  const globalFlag = core.getInput('global_lock_flag').trim()

  // Check if the global lock flag was provided
  if (body.includes(globalFlag) === true) {
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
    body = body.split('--reason')[0].trim()
  }

  // remove the lock command from the body
  const lockTrigger = core.getInput('lock_trigger').trim()
  body = body.replace(lockTrigger, '').trim()

  // remove the lock info alias command from the body
  const lockInfoAlias = core.getInput('lock_info_alias').trim()
  body = body.replace(lockInfoAlias, '').trim()

  // If the body is empty, return the default environment
  if (body === '') {
    return {
      environment: core.getInput('environment').trim(),
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
async function findReason(context, sticky) {
  // If if not sticky, return deployment as the reason
  if (sticky === false) {
    return 'deployment'
  }

  // Get the global lock flag from the Action input
  const globalFlag = core.getInput('global_lock_flag').trim()

  // Get the body of the comment and remove the global lock flag from the string
  const body = context.payload.comment.body
    .trim()
    .replace(globalFlag, '')
    .trim()

  // Check if --reason was provided
  if (body.includes('--reason') === false) {
    // If no reason was provided, return null
    return null
  }

  // Find the --reason flag in the body
  const reasonRaw = body.split('--reason')[1]

  // Remove whitespace
  const reason = reasonRaw.trim()

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
async function checkBranch(octokit, context, branchName) {
  core.debug(`checking if branch ${branchName} exists...`)
  // Check if the lock branch already exists
  try {
    await octokit.rest.repos.getBranch({
      ...context.repo,
      branch: branchName
    })

    core.debug(`branch '${branchName}' exists`)
    return true
  } catch (error) {
    // Check if the error was due to the lock branch not existing
    if (error.status === 404) {
      core.debug(`lock branch ${branchName} does not exist`)
      return false
    } else {
      core.error(
        'an unexpected status code was returned while checking for the lock branch'
      )
      throw new Error(error)
    }
  }
}

// Helper function to create a lock branch
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param branchName: The name of the branch to create
async function createBranch(octokit, context, branchName) {
  core.debug(`attempting to create lock branch: ${branchName}...`)

  // Determine the default branch for the repo
  const repoData = await octokit.rest.repos.get({
    ...context.repo
  })

  // Fetch the base branch's to use its SHA as the parent
  const baseBranch = await octokit.rest.repos.getBranch({
    ...context.repo,
    branch: repoData.data.default_branch
  })

  // Create the lock branch
  await octokit.rest.git.createRef({
    ...context.repo,
    ref: `refs/heads/${branchName}`,
    sha: baseBranch.data.commit.sha
  })

  core.info(`🔒 created lock branch: ${COLORS.highlight}${branchName}`)
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
  octokit,
  context,
  lockData,
  sticky,
  reactionId,
  leaveComment = true
) {
  core.debug('checking the owner of the lock...')
  // If the requestor is the one who owns the lock, return 'owner'
  if (lockData.created_by === context.actor) {
    core.info(
      `✅ ${COLORS.highlight}${context.actor}${COLORS.reset} initiated this request and is also the owner of the current lock`
    )

    // If this is a '.lock' command (sticky) and not a sticky_locks deployment request, update with actionStatus as we are about to exit
    if (sticky === true && leaveComment === true) {
      // Find the total time since the lock was created
      const totalTime = await timeDiff(
        lockData.created_at,
        new Date().toISOString()
      )

      let lockMsg
      if (lockData.global === true) {
        lockMsg = 'global'
      } else {
        lockMsg = `\`${lockData.environment}\` environment`
      }

      const youOwnItComment = dedent(`
        ### 🔒 Deployment Lock Information

        __${context.actor}__, you are already the owner of the current ${lockMsg} deployment lock

        The current lock has been active for \`${totalTime}\`

        > If you need to release the lock, please comment \`${lockData.unlock_command}\`
        `)

      await actionStatus(
        context,
        octokit,
        reactionId,
        youOwnItComment,
        true,
        true
      )
    }

    return true
  }

  // Deconstruct the context to obtain the owner and repo
  const {owner, repo} = context.repo

  // Find the total time since the lock was created
  const totalTime = await timeDiff(
    lockData.created_at,
    new Date().toISOString()
  )

  // Set the header if it is sticky or not (aka a deployment or a direct invoke of .lock)
  var header = ''
  if (sticky === true) {
    header = 'claim deployment lock'
  } else if (sticky === false) {
    header = 'proceed with deployment'
  }

  // dynamic reason text
  let reasonText = ''
  if (lockData.reason) {
    reasonText = `- __Reason__: \`${lockData.reason}\``
  }

  // dynamic lock text
  let lockText = ''
  let environmentText = ''
  var lockBranchForLink
  if (lockData.global === true) {
    lockText = dedent(
      `the \`global\` deployment lock is currently claimed by __${lockData.created_by}__
      
      A \`global\` deployment lock prevents all other users from deploying to any environment except for the owner of the lock
      `
    )
    lockBranchForLink = GLOBAL_LOCK_BRANCH
  } else {
    lockText = `the \`${lockData.environment}\` environment deployment lock is currently claimed by __${lockData.created_by}__`
    environmentText = `- __Environment__: \`${lockData.environment}\``
    lockBranchForLink = `${lockData.environment}-${LOCK_BRANCH_SUFFIX}`
  }

  // Construct the comment to add to the issue, alerting that the lock is already claimed
  const comment = dedent(`
  ### ⚠️ Cannot ${header}

  Sorry __${context.actor}__, ${lockText}

  #### Lock Details 🔒

  ${reasonText}
  ${environmentText}
  - __Branch__: \`${lockData.branch}\`
  - __Created At__: \`${lockData.created_at}\`
  - __Created By__: \`${lockData.created_by}\`
  - __Sticky__: \`${lockData.sticky}\`
  - __Global__: \`${lockData.global}\`
  - __Comment Link__: [click here](${lockData.link})
  - __Lock Link__: [click here](${process.env.GITHUB_SERVER_URL}/${owner}/${repo}/blob/${lockBranchForLink}/${LOCK_FILE})

  The current lock has been active for \`${totalTime}\`

  > If you need to release the lock, please comment \`${lockData.unlock_command}\`
  `)

  // Set the action status with the comment
  await actionStatus(context, octokit, reactionId, comment)

  // Set the bypass state to true so that the post run logic will not run
  core.saveState('bypass', 'true')
  core.setFailed(comment)

  // Return false to indicate that the lock was not claimed
  return false
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
//   status: 'owner' | false | true | null | 'details-only',
//   lockData: Object,
//   globalFlag: String (--global for example),
//   environment: String (production for example)
//   global: Boolean (true if the request is for a global lock)
// }
// status: 'owner' - the lock was already claimed by the requestor
// status: false - the lock was not claimed
// status: true - the lock was claimed
// status: null - no lock exists
// status: 'details-only' - the lock details were returned, but the lock was not claimed
export async function lock(
  octokit,
  context,
  ref,
  reactionId,
  sticky,
  environment = null,
  detailsOnly = false,
  postDeployStep = false,
  leaveComment = true
) {
  var global

  core.debug(`lock() called with ref: ${ref}`)
  core.debug(`lock() called with sticky: ${sticky}`)
  core.debug(`lock() called with environment: ${environment}`)
  core.debug(`lock() called with detailsOnly: ${detailsOnly}`)
  core.debug(`lock() called with postDeployStep: ${postDeployStep}`)

  // find the global flag for returning
  const globalFlag = core.getInput('global_lock_flag').trim()

  // Attempt to obtain a reason from the context for the lock - either a string or null
  const reason = await findReason(context, sticky)

  // Find the environment from the context if it was not passed in
  if (environment === null) {
    const envObject = await findEnvironment(context)
    environment = envObject.environment
    global = envObject.global
  } else {
    // if the environment was passed in, we can assume it is not a global lock
    global = false
  }

  // construct the branch name for the lock
  const branchName = await constructBranchName(environment, global)

  // lock debug info
  core.debug(`detected lock env: ${environment}`)
  core.debug(`detected lock global: ${global}`)
  core.debug(`constructed lock branch name: ${branchName}`)

  // Before we can process THIS lock request, we must first check for a global lock
  // If there is a global lock, we must check if the requestor is the owner of the lock
  // We can only proceed here if there is NO global lock or if the requestor is the owner of the global lock
  // We can just jump directly to checking the lock file
  const globalLockData = await checkLockFile(
    octokit,
    context,
    GLOBAL_LOCK_BRANCH
  )

  if (globalLockData === false && detailsOnly === true && global === true) {
    // If the global lock file doesn't exist and this is a detailsOnly request for the global lock return null
    return {
      status: null,
      lockData: null,
      globalFlag,
      environment,
      global
    }
  } else if (
    globalLockData &&
    detailsOnly === true &&
    postDeployStep === false
  ) {
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
  if (globalLockData && postDeployStep === false) {
    core.debug('global lock exists - checking if requestor is the owner')
    // Check if the requestor is the owner of the global lock
    const globalLockOwner = await checkLockOwner(
      octokit,
      context,
      globalLockData,
      sticky,
      reactionId,
      leaveComment
    )
    if (globalLockOwner === false) {
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
  const branchExists = await checkBranch(octokit, context, branchName)

  if (branchExists === false && detailsOnly === true) {
    // If the lock branch doesn't exist and this is a detailsOnly request, return null
    core.debug('lock branch does not exist and this is a detailsOnly request')
    return {status: null, lockData: null, globalFlag, environment, global}
  }

  if (branchExists) {
    // Check if the lock file exists
    const lockData = await checkLockFile(octokit, context, branchName)

    if (lockData === false && detailsOnly === true) {
      // If the lock file doesn't exist and this is a detailsOnly request, return null
      return {status: null, lockData: null, globalFlag, environment, global}
    } else if (lockData && detailsOnly) {
      // If the lock file exists and this is a detailsOnly request, return the lock data
      return {
        status: 'details-only',
        lockData: lockData,
        globalFlag,
        environment,
        global
      }
    }

    if (lockData === false) {
      // If the lock files doesn't exist, we can create it here
      // Create the lock file
      await createLock(
        octokit,
        context,
        ref,
        reason,
        sticky,
        environment,
        global,
        reactionId,
        leaveComment
      )
      return {status: true, lockData: null, globalFlag, environment, global}
    } else {
      // If the lock file exists, check if the requestor is the one who owns the lock
      const lockOwner = await checkLockOwner(
        octokit,
        context,
        lockData,
        sticky,
        reactionId,
        leaveComment
      )
      if (lockOwner === true) {
        // If the requestor is the one who owns the lock, return 'owner'
        return {
          status: 'owner',
          lockData: lockData,
          globalFlag,
          environment,
          global
        }
      } else {
        // If the requestor is not the one who owns the lock, return false
        return {
          status: false,
          lockData: lockData,
          globalFlag,
          environment,
          global
        }
      }
    }
  }

  // If we get here, the lock branch does not exist and the detailsOnly flag is not set
  // We can now safely create the lock branch and the lock file

  // Create the lock branch if it doesn't exist
  await createBranch(octokit, context, branchName)

  // Create the lock file
  await createLock(
    octokit,
    context,
    ref,
    reason,
    sticky,
    environment,
    global,
    reactionId,
    leaveComment
  )
  return {status: true, lockData: null, globalFlag, environment, global}
}
