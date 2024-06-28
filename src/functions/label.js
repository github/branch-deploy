import * as core from '@actions/core'

// Helper function to add labels to a pull request
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :param labels: An array of labels to add to the pull request (Array)
// :returns: Nothing
export async function label(context, octokit, labels) {
  // Get the owner and repo from the context
  const {owner, repo} = context.repo

  if (labels.length === 0) {
    core.debug('🏷️ no labels to add')
    return
  }

  core.debug(`attempting to apply labels: ${labels}`)
  await octokit.rest.issues.addLabels({
    owner: owner,
    repo: repo,
    issue_number: context.issue.number,
    labels: labels
  })
  core.info(`🏷️ labels added: ${labels}`)
}
