import * as core from '../actions-core.ts'
import {API_HEADERS} from './api-headers.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

type AddLabelsMethod = BranchDeployOctokit['rest']['issues']['addLabels']
type AddLabelsParameters = Parameters<AddLabelsMethod>[0]
type ListLabelsMethod =
  BranchDeployOctokit['rest']['issues']['listLabelsOnIssue']
type ListLabelsParameters = Parameters<ListLabelsMethod>[0]
type FullListLabelsResponse = Awaited<ReturnType<ListLabelsMethod>>
type RemoveLabelMethod = BranchDeployOctokit['rest']['issues']['removeLabel']
type RemoveLabelParameters = Parameters<RemoveLabelMethod>[0]

export interface LabelOctokit {
  readonly rest: {
    readonly issues: {
      readonly addLabels: (parameters?: AddLabelsParameters) => Promise<unknown>
      readonly listLabelsOnIssue: (
        parameters?: ListLabelsParameters
      ) => Promise<{
        readonly data: readonly Pick<
          FullListLabelsResponse['data'][number],
          'name'
        >[]
      }>
      readonly removeLabel: (
        parameters?: RemoveLabelParameters
      ) => Promise<unknown>
    }
  }
}

// Helper function to add labels to a pull request
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :param labelsToAdd: An array of labels to add to the pull request (Array)
// :parm labelsToRemove: An array of labels to remove from the pull request (Array)
// :returns: An object containing the labels added and removed (Object)
export async function label(
  context: BranchDeployContext,
  octokit: LabelOctokit,
  labelsToAdd: readonly string[],
  labelsToRemove: readonly string[]
): Promise<{
  readonly added: readonly string[]
  readonly removed: readonly string[]
}> {
  // Get the owner, repo, and issue number from the context
  const {owner, repo} = context.repo
  const issueNumber = context.issue.number
  let addedLabels: readonly string[] = [] // an array of labels that were actually added
  const removedLabels: string[] = [] // an array of labels that were actually removed

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
    const currentLabels: string[] = []
    const labelsPerPage = 100
    let page = 1
    while (true) {
      const currentLabelsResult = await octokit.rest.issues.listLabelsOnIssue({
        owner: owner,
        repo: repo,
        issue_number: issueNumber,
        per_page: labelsPerPage,
        page,
        headers: API_HEADERS
      })
      currentLabels.push(...currentLabelsResult.data.map(label => label.name))
      if (currentLabelsResult.data.length < labelsPerPage) break
      page += 1
    }

    core.debug(`current labels: ${currentLabels.join(',')}`)
    core.debug(`labels to remove: ${labelsToRemove.join(',')}`)

    // Remove unwanted labels
    for (const label of labelsToRemove) {
      if (currentLabels.includes(label)) {
        await octokit.rest.issues.removeLabel({
          owner: owner,
          repo: repo,
          issue_number: issueNumber,
          name: label,
          headers: API_HEADERS
        })
        core.info(`🏷️ label removed: ${label}`)
        removedLabels.push(label)
      } else {
        core.debug(`🏷️ label not found: '${label}' so it was not removed`)
      }
    }
  }

  // now, add the labels if any are provided
  if (labelsToAdd.length > 0) {
    core.debug(`attempting to apply labels: ${labelsToAdd.join(',')}`)
    await octokit.rest.issues.addLabels({
      owner: owner,
      repo: repo,
      issue_number: issueNumber,
      labels: [...labelsToAdd],
      headers: API_HEADERS
    })
    core.info(`🏷️ labels added: ${labelsToAdd.join(',')}`)

    addedLabels = labelsToAdd
  }

  return {
    added: addedLabels,
    removed: removedLabels
  }
}
