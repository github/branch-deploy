import * as core from '@actions/core'
import dedent from 'dedent-js'
import {actionStatus} from './action-status'
import {timeDiff} from './time-diff'

// Constants for the lock file
const LOCK_BRANCH = 'branch-deploy-lock'
const LOCK_FILE = 'lock.json'
const LOCK_COMMIT_MSG = 'lock'
const BASE_URL = 'https://github.com'

// Helper function for creating a lock file for branch-deployment locks
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param ref: The branch which requested the lock / deployment
// :param reason: The reason for the deployment lock
// :param sticky: A bool indicating whether the lock is sticky or not (should persist forever)
// :returns: The result of the createOrUpdateFileContents API call
async function createLock(octokit, context, ref, reason, sticky, reactionId) {
  // Deconstruct the context to obtain the owner and repo
  const {owner, repo} = context.repo

  // Construct the file contents for the lock file
  // Use the 'sticky' flag to determine whether the lock is sticky or not
  // Sticky locks will persist forever
  // Non-sticky locks will be removed if the branch that claimed the lock is deleted / merged
  const lockData = {
    reason: reason,
    branch: ref,
    created_at: new Date().toISOString(),
    created_by: context.actor,
    sticky: sticky,
    link: `${BASE_URL}/${owner}/${repo}/pull/${context.issue.number}#issuecomment-${context.payload.comment.id}`
  }

  // Create the lock file
  const result = await octokit.rest.repos.createOrUpdateFileContents({
    ...context.repo,
    path: LOCK_FILE,
    message: LOCK_COMMIT_MSG,
    content: Buffer.from(JSON.stringify(lockData)).toString('base64'),
    branch: LOCK_BRANCH
  })

  // Write a log message stating the lock has been claimed
  core.info('deployment lock obtained')
  // If the lock is sticky, always leave a comment
  if (sticky) {
    core.info('deployment lock is sticky')

    const comment = dedent(`
    ### 🔒 Deployment Lock Claimed

    You are now the only user that can trigger deployments until the deployment lock is removed

    > This lock is _sticky_ and will persist until someone runs \`.unlock\`
    `)

    // If the lock is sticky, this means that it was invoked with `.lock` and not from a deployment
    // In this case, we update the actionStatus as we are about to exit
    await actionStatus(context, octokit, reactionId, comment, true, true)
  }

  // Return the result of the lock file creation
  return result
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

  // Get the body of the comment
  const body = context.payload.comment.body.trim()

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
  return reason
}

// Helper function for claiming a deployment lock
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param ref: The branch which requested the lock / deployment
// :param reactionId: The ID of the reaction to add to the issue comment (use if the lock is already claimed or if we claimed it with 'sticky')
// :param sticky: A bool indicating whether the lock is sticky or not (should persist forever)
// :param detailsOnly: A bool indicating whether to only return the details of the lock and not alter its state
// :returns: true if the lock was successfully claimed, false if already locked or it fails, 'owner' if the requestor is the one who owns the lock, or null if this is a detailsOnly request and the lock was not found
export async function lock(
  octokit,
  context,
  ref,
  reactionId,
  sticky,
  detailsOnly = false
) {
  // Attempt to obtain a reason from the context for the lock - either a string or null
  const reason = await findReason(context, sticky)

  // Check if the lock branch already exists
  try {
    await octokit.rest.repos.getBranch({
      ...context.repo,
      branch: LOCK_BRANCH
    })
  } catch (error) {
    // Create the lock branch if it doesn't exist
    if (error.status === 404) {
      // Exit if this is a detailsOnly request
      if (detailsOnly) {
        return null
      }

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
        ref: `refs/heads/${LOCK_BRANCH}`,
        sha: baseBranch.data.commit.sha
      })

      core.info(`Created lock branch: ${LOCK_BRANCH}`)

      // Create the lock file
      await createLock(octokit, context, ref, reason, sticky, reactionId)
      return true
    }
  }

  // If the lock branch exists, check if a lock file exists
  try {
    // Get the lock file contents
    const response = await octokit.rest.repos.getContent({
      ...context.repo,
      path: LOCK_FILE,
      ref: LOCK_BRANCH
    })

    // Decode the file contents to json
    const lockData = JSON.parse(
      Buffer.from(response.data.content, 'base64').toString()
    )

    if (detailsOnly) {
      return lockData
    }

    // If the requestor is the one who owns the lock, return 'owner'
    if (lockData.created_by === context.actor) {
      core.info(`${context.actor} is the owner of the lock`)

      // If this is a .lock (sticky) command, update with actionStatus as we are about to exit
      if (sticky) {
        // Find the total time since the lock was created
        const totalTime = await timeDiff(
          lockData.created_at,
          new Date().toISOString()
        )

        const youOwnItComment = dedent(`
          ### 🔒 Deployment Lock Information

          __${context.actor}__, you are already the owner of the current deployment lock

          The current lock has been active for \`${totalTime}\`

          > If you need to release the lock, please comment \`.unlock\`
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

      return 'owner'
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

    // Construct the comment to add to the issue, alerting that the lock is already claimed
    const comment = dedent(`
    ### ⚠️ Cannot ${header}

    Sorry __${context.actor}__, the deployment lock is currently claimed by __${lockData.created_by}__

    #### Lock Details 🔒

    - __Reason__: \`${lockData.reason}\`
    - __Branch__: \`${lockData.branch}\`
    - __Created At__: \`${lockData.created_at}\`
    - __Created By__: \`${lockData.created_by}\`
    - __Sticky__: \`${lockData.sticky}\`
    - __Comment Link__: [click here](${lockData.link})
    - __Lock Link__: [click here](${BASE_URL}/${owner}/${repo}/blob/${LOCK_BRANCH}/${LOCK_FILE})

    The current lock has been active for \`${totalTime}\`

    > If you need to release the lock, please comment \`.unlock\`
    `)

    // Set the action status with the comment
    await actionStatus(context, octokit, reactionId, comment)

    // Set the bypass state to true so that the post run logic will not run
    core.saveState('bypass', 'true')
    core.setFailed(comment)

    // Return false to indicate that the lock was not claimed
    return false
  } catch (error) {
    // If the lock file doesn't exist, create it
    if (error.status === 404) {
      // Exit if this is a detailsOnly request
      if (detailsOnly) {
        return null
      }

      await createLock(octokit, context, ref, reason, sticky, reactionId)
      return true
    }

    // If some other error occurred, throw it
    throw new Error(error)
  }
}
