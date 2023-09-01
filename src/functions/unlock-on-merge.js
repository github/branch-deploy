import * as core from '@actions/core'
import {unlock} from './unlock'
import {LOCK_METADATA} from './lock-metadata'
import {checkLockFile} from './check-lock-file'

// Helper function to automatically find, and release a deployment lock when a pull request is merged
// :param octokit: the authenticated octokit instance
// :param context: the context object
// :param environment_targets: the environment targets to check for unlocking
// :return: true if all locks were released successfully, false otherwise
export async function unlockOnMerge(octokit, context, environment_targets) {
  // first, check the context to ensure that the event is a pull request 'closed' event and that the pull request was merged
  if (
    context?.eventName !== 'pull_request' ||
    context?.payload?.action !== 'closed' ||
    context?.payload?.pull_request?.merged !== true
  ) {
    core.info(
      `event name: ${context?.eventName}, action: ${context?.payload?.action}, merged: ${context?.payload?.pull_request?.merged}`
    )
    core.setFailed(
      'this workflow can only run in the context of a merged pull request'
    )
    return false
  }

  // loop through all the environment targets and check each one for a lock associated with this merged pull request
  var releasedEnvironments = []
  for (const environment of environment_targets.split(',')) {
    // construct the lock branch name for this environment
    var lockBranch = `${environment}-${LOCK_METADATA.lockBranchSuffix}`

    // attempt to fetch the lockFile for this branch
    var lockFile = await checkLockFile(octokit, context, lockBranch)

    // check to see if the lockFile exists and if it does, check to see if it has a link property
    if (lockFile && lockFile?.link) {
      // if the lockFile has a link property, find the PR number from the link
      var prNumber = lockFile.link.split('/pull/')[1].split('#issuecomment')[0]
      core.info(`🔍 checking lock for PR ${prNumber} (env: ${environment})`)

      // if the PR number matches the PR number of the merged pull request, then this lock is associated with the merged pull request
      if (prNumber === context.payload.pull_request.number.toString()) {
        // release the lock
        var result = await unlock(
          octokit,
          context,
          null, // reactionId
          environment,
          true // silent
        )

        // if the result is 'removed lock - silent', then the lock was successfully removed - appead to the array for later use
        if (result === 'removed lock - silent') {
          releasedEnvironments.push(environment)
        }

        // log the result and format the output as it will always be a string ending with '- silent'
        var resultFmt = result.replace('- silent', '')
        core.info(`🔓 ${resultFmt.trim()} - environment: ${environment}`)
      } else {
        core.debug(
          `⏩ lock for PR ${prNumber} (env: ${environment}) is not associated with PR ${context.payload.pull_request.number} - skipping...`
        )
      }
    } else {
      core.debug(
        `⏩ no lock found for environment ${environment} - skipping...`
      )
    }
  }

  // if we get here, all locks were made a best effort to be released
  core.setOutput('unlocked_environments', releasedEnvironments.join(','))
  return true
}
