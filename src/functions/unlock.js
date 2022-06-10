import * as core from '@actions/core'
import dedent from 'dedent-js'

// Constants for the lock file
const LOCK_BRANCH = 'branch-deploy-lock'

// Helper function for releasing a deployment lock
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :returns: true if the lock was successfully released, false otherwise
export async function unlock(
  octokit,
  context,
) {
  try {
    // Delete the lock branch
    const result = await octokit.rest.git.deleteRef({
      ...context.repo,
      ref: `heads/${LOCK_BRANCH}`,
    });

    // If the lock was successfully released, return true
    if (result.status === 204) {
      core.info(`successfully removed lock`);

      // Construct the message to add to the issue comment
      const comment = dedent(`
      ### 🔓 Deployment Lock Removed

      The deployment lock for this branch has been successfully removed
      `)

      // Comment on the PR letting the user know the deployment lock was removed
      await octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: context.issue.number,
        body: comment
      })

      // Return true
      return true
    } else {
      // If the lock was not successfully released, return false and log the HTTP code
      core.info(`failed to delete lock branch: ${LOCK_BRANCH} - HTTP: ${result.status}`)
      return false
    }
  } catch (error) {
    // The the error caught was a 422 - Reference does not exist, this is OK - It means the lock branch does not exist
    if (error.status === 422 && error.message === 'Reference does not exist') {
      // Leave a comment letting the user know there is no lock to release
      await octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: context.issue.number,
        body: '🔓 There is currently no deployment lock set'
      })
      // Return true since there is no lock to release
      return true
    }

    throw new Error(error)
  }
}
