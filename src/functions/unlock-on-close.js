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
export async function unlockOnClose(octokit, context, environment_targets) {
  // first, check the context to ensure that the event is a pull request 'closed' event and that the pull request was merged
  if (
    context?.eventName !== 'pull_request' ||
    context?.payload?.action !== 'closed'
  ) {
    core.warning(
      `this workflow can only run in the context of a ${COLORS.highlight}closed${COLORS.reset} pull request`
    )
    core.info(
      `event name: ${context?.eventName}, action: ${context?.payload?.action}, merged: ${context?.payload?.pull_request?.merged}`
    )

    // If the pull request is merged, then the 'unlockOnMerge' mode should be used instead
    if (context?.payload?.pull_request?.merged === true) {
      core.info(
        `pull request was merged so this workflow should not run - OK (Use 'unlock-on-merge' instead)`
      )
    }

    return false
  }

  // loop through all the environment targets and check each one for a lock associated with this closed pull request
  var releasedEnvironments = []

  const deployment_task = core.getInput('deployment_task')
  if (deployment_task === 'all') {
    core.info(
      `ℹ️ ${COLORS.highlight}deployment_task${COLORS.reset} is set to 'all', look for all related branches to unlock`
    )
  }

  for (const environment of environment_targets.split(',')) {
    let matchingBranches = []

    if (deployment_task === 'all') {
      // Get all branches that match the pattern for this environment
      const branches = await octokit.rest.repos.listBranches({
        owner: context.repo.owner,
        repo: context.repo.repo
      })

      const branchPattern = `${constructValidBranchName(environment)}-`
      matchingBranches = branches.data
        .map(branch => branch.name)
        .filter(
          branchName =>
            branchName.startsWith(branchPattern) &&
            branchName.endsWith(LOCK_METADATA.lockBranchSuffix)
        )

      core.info(
        `🔍 found ${matchingBranches.length} matching lock branches for environment ${COLORS.highlight}${environment}${COLORS.reset}: ${matchingBranches.join(', ')}`
      )
    } else {
      core.info(
        `ℹ️ ${COLORS.highlight}deployment_task${COLORS.reset} is set to '${deployment_task}', only look for the specific branch to unlock`
      )
      // construct the lock branch name for this environment
      matchingBranches = [
        `${constructValidBranchName(environment)}-${LOCK_METADATA.lockBranchSuffix}`
      ]
    }

    // Process each matching branch
    for (const lockBranch of matchingBranches) {
      // Check if the lock branch exists
      const branchExists = await checkBranch(octokit, context, lockBranch)

      // if the lock branch does not exist at all, then there is no lock to release
      if (!branchExists) {
        core.info(
          `⏩ lock branch ${COLORS.highlight}${lockBranch}${COLORS.reset} no longer exists - skipping...`
        )
        continue
      }

      // attempt to fetch the lockFile for this branch
      const lockFile = await checkLockFile(octokit, context, lockBranch)

      // check to see if the lockFile exists and if it does, check to see if it has a link property
      if (lockFile && lockFile?.link) {
        // if the lockFile has a link property, find the PR number from the link
        const prNumber = lockFile.link
          .split('/pull/')[1]
          .split('#issuecomment')[0]
        core.info(
          `🔍 checking lock for PR ${COLORS.info}${prNumber}${COLORS.reset} on branch ${COLORS.highlight}${lockBranch}${COLORS.reset}`
        )

        // if the PR number matches the PR number of the closed pull request, then this lock is associated with the closed pull request
        if (prNumber === context.payload.pull_request.number.toString()) {
          // release the lock
          const result = await unlock(
            octokit,
            context,
            null, // reactionId
            environment,
            true, // silent
            lockFile?.task || null // pass the task from the lock file to ensure the correct branch is deleted
          )

          // if the result is 'removed lock - silent', then the lock was successfully removed - append to the array for later use
          if (result === 'removed lock - silent') {
            if (lockFile.task) {
              releasedEnvironments.push(`${environment}-${lockFile.task}`)
            } else {
              releasedEnvironments.push(environment)
            }
          } else {
            core.debug(`unlock result for unlock-on-close: ${result}`)
          }

          // log the result and format the output as it will always be a string ending with '- silent'
          const resultFmt = result.replace('- silent', '')
          core.info(
            `🔓 ${resultFmt.trim()} - branch: ${COLORS.highlight}${lockBranch}${COLORS.reset}`
          )
        } else {
          core.info(
            `⏩ lock for PR ${COLORS.info}${prNumber}${COLORS.reset} on branch ${COLORS.highlight}${lockBranch}${COLORS.reset} is not associated with PR ${COLORS.info}${context.payload.pull_request.number}${COLORS.reset} - skipping...`
          )
        }
      } else {
        core.info(
          `⏩ no lock file found for branch ${COLORS.highlight}${lockBranch}${COLORS.reset} - skipping...`
        )
        continue
      }
    }
  }

  // if we get here, all locks had a best effort attempt to be released
  core.setOutput('unlocked_environments', releasedEnvironments.join(','))
  return true
}
