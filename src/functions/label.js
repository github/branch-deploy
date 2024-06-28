import * as core from '@actions/core'

// Helper function to add labels to a pull request
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :param labelsToAdd: An array of labels to add to the pull request (Array)
// :parm labelsToRemove: An array of labels to remove from the pull request (Array)
// :returns: An object containing the labels added and removed (Object)
export async function label(context, octokit, labelsToAdd, labelsToRemove) {
  // Get the owner, repo, and issue number from the context
  const {owner, repo} = context.repo
  const issueNumber = context.issue.number
  var addedLabels = []
  var removedLabels = []

  // exit early if there are no labels to add or remove
  if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
    core.debug('🏷️ no labels to add or remove')
    return {
      added: [],
      removed: []
    }
  }

  // first, find and cleanup labelsToRemove if any are provided
  if (labelsToRemove.length > 0) {
    // Fetch current labels on the issue
    core.debug('fetching current labels on the issue')
    const currentLabelsResult = await octokit.rest.issues.listLabelsOnIssue({
      owner: owner,
      repo: repo,
      issue_number: issueNumber
    })
    const currentLabels = currentLabelsResult.data.map(label => label.name)

    core.debug(`current labels: ${currentLabels}`)
    core.debug(`labels to remove: ${labelsToRemove}`)

    // Remove unwanted labels
    for (const label of labelsToRemove) {
      if (currentLabels.includes(label)) {
        await octokit.rest.issues.removeLabel({
          owner: owner,
          repo: repo,
          issue_number: issueNumber,
          name: label
        })
      }
    }
    core.info(`🏷️ labels removed: ${labelsToRemove}`)

    removedLabels = labelsToRemove
  }

  // now, add the labels if any are provided
  if (labelsToAdd.length > 0) {
    core.debug(`attempting to apply labels: ${labelsToAdd}`)
    await octokit.rest.issues.addLabels({
      owner: owner,
      repo: repo,
      issue_number: issueNumber,
      labels: labelsToAdd
    })
    core.info(`🏷️ labels added: ${labelsToAdd}`)

    addedLabels = labelsToAdd
  }

  return {
    added: addedLabels,
    removed: removedLabels
  }
}
