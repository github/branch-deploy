import * as core from '@actions/core'
import {actionStatus} from './action-status'
import dedent from 'dedent-js'

// Constants for the lock file
const LOCK_BRANCH = 'branch-deploy-lock'

// Helper function for releasing a deployment lock
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param reactionId: The ID of the reaction to add to the issue comment (only used if the lock is successfully released) (Integer)
// :param silent: A bool indicating whether to add a comment to the issue or not (Boolean)
// :returns: true if the lock was successfully released, a string with some details if silent was used, false otherwise
export async function unlock(octokit, context, reactionId, silent = false) {
  try {
    // Delete the lock branch
    const result = await octokit.rest.git.deleteRef({
      ...context.repo,
      ref: `heads/${LOCK_BRANCH}`
    })

    // If the lock was successfully released, return true
    if (result.status === 204) {
      core.info(`successfully removed lock`)

      // If silent, exit here
      if (silent) {
        return 'removed lock - silent'
      }

      // Construct the message to add to the issue comment
      const comment = dedent(`
      ### 🔓 Deployment Lock Removed

      The deployment lock has been successfully removed
      `)

      // Set the action status with the comment
      await actionStatus(context, octokit, reactionId, comment, true, true)

      // Return true
      return true
    } else {
      // If the lock was not successfully released, return false and log the HTTP code
      const comment = `failed to delete lock branch: ${LOCK_BRANCH} - HTTP: ${result.status}`
      core.info(comment)

      // If silent, exit here
      if (silent) {
        return 'failed to delete lock (bad status code) - silent'
      }

      await actionStatus(context, octokit, reactionId, comment, false)
      return false
    }
  } catch (error) {
    // The the error caught was a 422 - Reference does not exist, this is OK - It means the lock branch does not exist
    if (error.status === 422 && error.message === 'Reference does not exist') {
      // If silent, exit here
      if (silent) {
        return 'no deployment lock currently set - silent'
      }

      // Leave a comment letting the user know there is no lock to release
      await actionStatus(
        context,
        octokit,
        reactionId,
        '🔓 There is currently no deployment lock set',
        true,
        true
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
