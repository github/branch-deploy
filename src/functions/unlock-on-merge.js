import * as core from '@actions/core'

// Helper function to automatically find, and release a deployment lock when a pull request is merged
// :param octokit: the authenticated octokit instance
// :param context: the context object
// :return: true if all locks were released successfully, false otherwise
export async function unlockOnMerge(octokit, context) {
  // first, check the context to ensure that the event is a pull request 'closed' event and that the pull request was merged
  if (
    context?.eventName !== 'pull_request' ||
    context?.payload?.action !== 'closed' ||
    context?.payload?.pull_request?.merged !== true
  ) {
    core.debug(
      `event name: ${context?.eventName}, action: ${context?.payload?.action}, merged: ${context?.payload?.pull_request?.merged}`
    )
    core.setFailed(
      'This workflow can only run in the context of a merged pull request'
    )
    return false
  }
}

// core.setOutput('environment', environment)
