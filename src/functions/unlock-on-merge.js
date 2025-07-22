import * as core from '@actions/core'
import {unlock} from './unlock'
import {LOCK_METADATA} from './lock-metadata'
import {checkLockFile} from './check-lock-file'
import {checkBranch} from './lock'
import {constructValidBranchName} from './valid-branch-name'
import {COLORS} from './colors'

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
    core.warning(
      `this workflow can only run in the context of a ${COLORS.highlight}merged${COLORS.reset} pull request`
    )
    core.info(
      `event name: ${context?.eventName}, action: ${context?.payload?.action}, merged: ${context?.payload?.pull_request?.merged}`
    )

    // many pull requests in a project will end up being closed without being merged, so we can just log this so its clear
    if (context?.payload?.action === 'closed') {
      core.info(
        `pull request was closed but not merged so this workflow will not run - OK`
      )
    }

    return false
  }

  // loop through all the environment targets and check each one for a lock associated with this merged pull request
  var releasedEnvironments = []
  for (const environment of environment_targets.split(',')) {
    // construct the lock branch name for this environment
    var lockBranch = `${constructValidBranchName(environment)}-${LOCK_METADATA.lockBranchSuffix}`

    // Check if the lock branch exists
    const branchExists = await checkBranch(octokit, context, lockBranch)

    // if the lock branch does not exist at all, then there is no lock to release
    if (!branchExists) {
      core.info(
        `⏩ no lock branch found for environment ${COLORS.highlight}${environment}${COLORS.reset} - skipping...`
      )
      continue
    }

    // attempt to fetch the lockFile for this branch
    var lockFile = await checkLockFile(octokit, context, lockBranch)

    // check to see if the lockFile exists and if it does, check to see if it has a link property
    if (lockFile && lockFile?.link) {
      // if the lockFile has a link property, find the PR number from the link
      var prNumber = lockFile.link.split('/pull/')[1].split('#issuecomment')[0]
      core.info(
        `🔍 checking lock for PR ${COLORS.info}${prNumber}${COLORS.reset} (env: ${COLORS.highlight}${environment}${COLORS.reset})`
      )

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

        // if the result is 'removed lock - silent', then the lock was successfully removed - append to the array for later use
        if (result === 'removed lock - silent') {
          releasedEnvironments.push(environment)
        } else {
          core.debug(`unlock result for unlock-on-merge: ${result}`)
        }

        // log the result and format the output as it will always be a string ending with '- silent'
        var resultFmt = result.replace('- silent', '')
        core.info(
          `🔓 ${resultFmt.trim()} - environment: ${COLORS.highlight}${environment}${COLORS.reset}`
        )
      } else {
        core.info(
          `⏩ lock for PR ${COLORS.info}${prNumber}${COLORS.reset} (env: ${COLORS.highlight}${environment}${COLORS.reset}) is not associated with PR ${COLORS.info}${context.payload.pull_request.number}${COLORS.reset} - skipping...`
        )
      }
    } else {
      core.info(
        `⏩ no lock file found for environment ${COLORS.highlight}${environment}${COLORS.reset} - skipping...`
      )
      continue
    }
  }

  // if we get here, all locks had a best effort attempt to be released
  core.setOutput('unlocked_environments', releasedEnvironments.join(','))
  return true
}
