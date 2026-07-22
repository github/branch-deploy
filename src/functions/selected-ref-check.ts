import {API_HEADERS} from './api-headers.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

type GetPullMethod = BranchDeployOctokit['rest']['pulls']['get']
type GetPullParameters = Parameters<GetPullMethod>[0]
type GetBranchMethod = BranchDeployOctokit['rest']['repos']['getBranch']
type GetBranchParameters = Parameters<GetBranchMethod>[0]

export interface SelectedRefOctokit {
  readonly rest: {
    readonly pulls: {
      readonly get: (parameters?: GetPullParameters) => Promise<{
        readonly data: {readonly head: {readonly sha: string}}
      }>
    }
    readonly repos: {
      readonly getBranch: (parameters?: GetBranchParameters) => Promise<{
        readonly data: {readonly commit: {readonly sha: string}}
      }>
    }
  }
}

export interface SelectedRefRequest {
  readonly exactSha: boolean
  readonly expectedSha: string
  readonly isFork: boolean
  readonly stableBranch: string
  readonly stableBranchUsed: boolean
}

export async function selectedRefMatches(
  octokit: SelectedRefOctokit,
  context: BranchDeployContext,
  request: SelectedRefRequest
): Promise<boolean> {
  if (request.exactSha || (request.isFork && !request.stableBranchUsed)) {
    return true
  }

  if (request.stableBranchUsed) {
    const branch = await octokit.rest.repos.getBranch({
      ...context.repo,
      branch: request.stableBranch,
      headers: API_HEADERS
    })
    return branch.data.commit.sha === request.expectedSha
  }

  const pull = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: context.issue.number,
    headers: API_HEADERS
  })
  return pull.data.head.sha === request.expectedSha
}
