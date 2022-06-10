import * as core from '@actions/core'
import dedent from 'dedent-js'
import { actionStatus } from './action-status'

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
// :returns: The result of the createOrUpdateFileContents API call
async function createLock(octokit, context, ref, reason) {
  // Deconstruct the context to obtain the owner and repo
  const { owner, repo } = context.repo

  // Construct the file contents for the lock file
  const lockData = {
    reason: reason,
    branch: ref,
    created_at: new Date().toISOString(),
    created_by: context.actor,
    link: `${BASE_URL}/${owner}/${repo}/pull/${context.issue.number}#issuecomment-${context.payload.comment.id}`
  }

  // Create the lock file
  const result = await octokit.rest.repos.createOrUpdateFileContents({
    ...context.repo,
    path: LOCK_FILE,
    message: LOCK_COMMIT_MSG,
    content: Buffer.from(JSON.stringify(lockData)).toString('base64'),
    branch: LOCK_BRANCH
  });

  core.info('deployment lock obtained')

  // Return the result of the lock file creation
  return result
}

// Helper function for claiming a deployment lock
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param ref: The branch which requested the lock / deployment
// :param reason: The reason for the deployment lock
// :param reactionId: The ID of the reaction to add to the issue comment (only used if the lock is already claimed)
// :returns: true if the lock was successfully claimed, false otherwise
export async function lock(
  octokit,
  context,
  ref,
  reason,
  reactionId
) {
  // Check if the lock branch already exists
  try {
    await octokit.rest.repos.getBranch({
      ...context.repo,
      branch: LOCK_BRANCH,
    });
  } catch (error) {
    // Create the lock branch if it doesn't exist
    if (error.status === 404) {
      // Determine the default branch for the repo
      const repoData = await octokit.rest.repos.get({
        ...context.repo
      })

      // Fetch the base branch's to use its SHA as the parent
      const baseBranch = await octokit.rest.repos.getBranch({
        ...context.repo,
        branch: repoData.data.default_branch,
      });

      // Create the lock branch
      await octokit.rest.git.createRef({
        ...context.repo,
        ref: `refs/heads/${LOCK_BRANCH}`,
        sha: baseBranch.data.commit.sha
      });

      core.info(`Created lock branch: ${LOCK_BRANCH}`)

      // Create the lock file
      await createLock(octokit, context, ref, reason)
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
    });

    // Decode the file contents to json
    const lockData = JSON.parse(Buffer.from(response.data.content, 'base64').toString())

    // Deconstruct the context to obtain the owner and repo
    const { owner, repo } = context.repo

    // Construct the comment to add to the issue, alerting that the lock is already claimed
    const comment = dedent(`
    ### ⚠️ Cannot proceed with deployment

    Sorry __${context.actor}__, the deployment lock has already been claimed so your deployment cannot proceed

    #### Lock Details 🔒

    - __Reason__: \`${lockData.reason}\`
    - __Branch__: \`${lockData.branch}\`
    - __Created At__: \`${lockData.created_at}\`
    - __Created By__: \`${lockData.created_by}\`
    - __Comment Link__: [click here](${lockData.link})
    - __Lock Link__: [click here](${BASE_URL}/${owner}/${repo}/blob/${LOCK_BRANCH}/${LOCK_FILE})

    > If you need to unlock, please comment \`.unlock\`
    `)

    // Set the action status with the comment
    await actionStatus(
      context,
      octokit,
      reactionId,
      comment
    )

    // Set the bypass state to true so that the post run logic will not run
    core.saveState('bypass', 'true')
    core.setFailed(comment)

    // Return false to indicate that the lock was not claimed
    return false
  } catch (error) {
    // If the lock file doesn't exist, create it
    if (error.status === 404) {
      await createLock(octokit, context, ref, reason)
      return true
    }

    // If some other error occurred, throw it
    throw new Error(error)
  }
}
