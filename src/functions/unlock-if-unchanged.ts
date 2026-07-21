import * as core from '../actions-core.ts'
import {constructValidBranchName} from './valid-branch-name.ts'
import {LOCK_METADATA} from './lock-metadata.ts'
import {API_HEADERS} from './api-headers.ts'
import {legacyApiError} from '../trust-boundaries.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

type GetRepositoryMethod = BranchDeployOctokit['rest']['repos']['get']
type GetRepositoryParameters = Parameters<GetRepositoryMethod>[0]
type GetRepositoryResponse = Awaited<ReturnType<GetRepositoryMethod>>

export interface ConditionalUnlockOctokit {
  readonly graphql: (
    query: string,
    variables?: Readonly<Record<string, unknown>>
  ) => Promise<unknown>
  readonly rest: {
    readonly repos: {
      readonly get: (parameters?: GetRepositoryParameters) => Promise<{
        readonly data: Pick<GetRepositoryResponse['data'], 'node_id'>
      }>
    }
  }
}

const deleteLockRef = `
  mutation($input: UpdateRefsInput!) {
    updateRefs(input: $input) {
      clientMutationId
    }
  }
`

export async function unlockIfUnchanged(
  octokit: ConditionalUnlockOctokit,
  context: BranchDeployContext,
  environment: string,
  expectedSha: string
): Promise<boolean> {
  const branchName = `${constructValidBranchName(environment)}-${LOCK_METADATA.lockBranchSuffix}`

  try {
    const repository = await octokit.rest.repos.get({
      ...context.repo,
      headers: API_HEADERS
    })
    await octokit.graphql(deleteLockRef, {
      input: {
        repositoryId: repository.data.node_id,
        refUpdates: [
          {
            name: `refs/heads/${branchName}`,
            beforeOid: expectedSha,
            afterOid: '0000000000000000000000000000000000000000'
          }
        ]
      }
    })
  } catch (error) {
    core.warning(
      `could not remove the original deployment lock; leaving the current lock in place: ${legacyApiError(error).message}`
    )
    return false
  }

  core.info('🔓 successfully removed the original deployment lock')
  return true
}
