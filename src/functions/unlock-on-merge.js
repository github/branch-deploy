import * as core from '@actions/core'

// Helper function to automatically find, and release a deployment lock when a pull request is merged
// :param octokit: the authenticated octokit instance
// :param context: the context object
// :return: true if the current deployment's ref is identical to the merge commit, false otherwise
export async function unlockOnMerge(octokit, context) {
  // core.setOutput('environment', environment)
}
