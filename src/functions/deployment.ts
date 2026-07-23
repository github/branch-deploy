import * as core from '../actions-core.ts'
import {API_HEADERS} from './api-headers.ts'
import {
  legacyDeploymentStatusId,
  legacyEnvironmentUrl
} from '../trust-boundaries.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  DeploymentGraphqlNode
} from '../types.ts'

type CreateDeploymentStatusMethod =
  BranchDeployOctokit['rest']['repos']['createDeploymentStatus']
type CreateDeploymentStatusParameters =
  Parameters<CreateDeploymentStatusMethod>[0]
type FullDeploymentStatusResponse = Awaited<
  ReturnType<CreateDeploymentStatusMethod>
>

export interface DeploymentStatusOctokit {
  readonly rest: {
    readonly repos: {
      readonly createDeploymentStatus: (
        parameters?: CreateDeploymentStatusParameters
      ) => Promise<{
        readonly data: Pick<FullDeploymentStatusResponse['data'], 'id' | 'url'>
      }>
    }
  }
}

export interface DeploymentGraphqlOctokit {
  readonly graphql: (
    query: string,
    variables: Readonly<Record<string, unknown>>
  ) => Promise<DeploymentHistoryResult>
}

interface DeploymentHistoryNode extends DeploymentGraphqlNode {
  readonly createdAt: string
  readonly environment: string
  readonly id: string
  readonly payload: unknown
}

interface DeploymentHistoryResult {
  readonly repository: null | {
    readonly deployments: {
      readonly nodes: readonly DeploymentHistoryNode[]
      readonly pageInfo: {
        readonly endCursor: string | null
        readonly hasNextPage: boolean
      }
    }
    readonly id: string
    readonly nameWithOwner: string
  }
}

// Helper function to add deployment statuses to a PR / ref
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param ref: The ref to add the deployment status to
// :param state: The state of the deployment
// :param deploymentId: The id of the deployment
// :param environment: The environment of the deployment
// :param environment_url: The environment url of the deployment (default '')
// :returns: The result of the deployment status creation (Object)
export async function createDeploymentStatus(
  octokit: DeploymentStatusOctokit,
  context: BranchDeployContext,
  ref: string,
  state:
    | 'error'
    | 'failure'
    | 'inactive'
    | 'in_progress'
    | 'pending'
    | 'queued'
    | 'success',
  deploymentId: number | string,
  environment: string,
  environment_url: string | null = null
): Promise<Pick<FullDeploymentStatusResponse['data'], 'id' | 'url'>> {
  // Get the owner and the repo from the context
  const {owner, repo} = context.repo

  const {data: result} = await octokit.rest.repos.createDeploymentStatus({
    owner: owner,
    repo: repo,
    ref: ref,
    deployment_id: legacyDeploymentStatusId(deploymentId),
    state: state,
    log_url: `${String(process.env['GITHUB_SERVER_URL'])}/${owner}/${repo}/actions/runs/${context.runId}`,
    environment: environment,
    environment_url: legacyEnvironmentUrl(environment_url),
    headers: API_HEADERS
  })

  core.debug(`deploymentStatus.id: ${result.id}`)
  core.debug(`deploymentStatus.url: ${result.url}`)

  return result
}

// Helper function to check and see if a given sha is active and deployed to a given environment
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param environment: The environment to check for (ex: production)
// :param sha: The sha to check for (ex: cb2bc0193184e779a5efc05e48acdfd1026f59a7)
// :returns: true if the deployment is active for the given environment at the given commit sha, false otherwise
export async function activeDeployment(
  octokit: DeploymentGraphqlOctokit,
  context: BranchDeployContext,
  environment: string,
  sha: string
): Promise<boolean> {
  const deployment = await latestActiveDeployment(octokit, context, environment)

  // If no deployment was found, return false
  if (deployment === null) {
    return false
  }

  // Otherwise, check to see if the deployment is active and the commit sha matches exactly
  return deployment.state === 'ACTIVE' && deployment.commit.oid === sha
}

// Helper function to get the latest deployment for a given environment
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param environment: The environment to get the latest deployment for (ex: production)
// :returns: The result of the deployment (Object)
// 'nodes' may look like this:
// otherwise, nodes may look like this:
// [
//   {
//       "createdAt": "2024-09-19T20:18:18Z",
//       "environment": "production",
//       "updatedAt": "2024-09-19T20:18:23Z",
//       "id": "DE_kwDOID9x8N5sC6QZ",
//       "payload": "{\\\"type\\\":\\\"branch-deploy\\\", \\\"sha\\\": \\\"315cec138fc9d7dbc8a47c6bba4217d3965ede3b\\\"}",
//       "state": "ACTIVE",
//       "creator": {
//           "login": "github-actions"
//       },
//       "ref": {
//           "name": "main"
//       },
//       "commit": {
//           "oid": "315cec138fc9d7dbc8a47c6bba4217d3965ede3b"
//       }
//   }
// ]
export async function latestActiveDeployment(
  octokit: DeploymentGraphqlOctokit,
  context: BranchDeployContext,
  environment: string
): Promise<DeploymentGraphqlNode | null> {
  const repository = await deploymentPage(
    octokit,
    context,
    environment,
    1,
    null,
    null
  )
  const latest = repository.deployments.nodes[0]
  if (latest === undefined) {
    core.debug(`no deployments found for ${environment}`)
    return null
  }
  if (latest.state !== 'ACTIVE') {
    core.debug(`latest deployment for ${environment} is ${latest.state}`)
    return null
  }
  return latest
}

function buildQuery(): string {
  return `
    query BranchDeployments($repo_owner: String!, $repo_name: String!, $environment: String!, $first: Int!, $cursor: String) {
      repository(owner: $repo_owner, name: $repo_name) {
        id
        nameWithOwner
        deployments(environments: [$environment], first: $first, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
          nodes {
            createdAt
            environment
            id
            payload
            state
            commit {
              oid
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }`
}

async function deploymentPage(
  octokit: DeploymentGraphqlOctokit,
  context: BranchDeployContext,
  environment: string,
  first: number,
  cursor: string | null,
  expectedRepositoryId: string | null
): Promise<NonNullable<DeploymentHistoryResult['repository']>> {
  const page = await octokit.graphql(buildQuery(), {
    repo_owner: context.repo.owner,
    repo_name: context.repo.repo,
    environment,
    first,
    cursor
  })
  const repository = page.repository
  if (repository === null || repository.id === '') {
    throw new Error('The deployment history has no repository identity')
  }
  if (
    repository.nameWithOwner.toLowerCase() !==
    `${context.repo.owner}/${context.repo.repo}`.toLowerCase()
  ) {
    throw new Error('The deployment history belongs to another repository')
  }
  if (expectedRepositoryId !== null && repository.id !== expectedRepositoryId) {
    throw new Error('The deployment history repository changed while paging')
  }
  if (
    repository.deployments.nodes.some(
      deployment => deployment.environment !== environment
    )
  ) {
    throw new Error('The deployment history belongs to another environment')
  }
  return repository
}

function deploymentPayloadKind(
  payload: unknown
): 'branch-deploy' | 'malformed' | 'other' {
  let parsed = payload
  for (let layer = 0; layer < 2 && typeof parsed === 'string'; layer += 1) {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      return 'malformed'
    }
  }
  if (typeof parsed === 'string') return 'malformed'
  if (typeof parsed !== 'object' || parsed === null) {
    return parsed === null ? 'other' : 'malformed'
  }
  if (!('type' in parsed)) return 'other'
  if (parsed.type === 'branch-deploy') return 'branch-deploy'
  return typeof parsed.type === 'string' ? 'other' : 'malformed'
}

export async function latestBranchDeployDeployment(
  octokit: DeploymentGraphqlOctokit,
  context: BranchDeployContext,
  environment: string
): Promise<DeploymentHistoryNode | null> {
  let cursor: string | null = null
  let repositoryId: string | null = null
  const seenCursors = new Set<string>()
  while (true) {
    const repository = await deploymentPage(
      octokit,
      context,
      environment,
      100,
      cursor,
      repositoryId
    )
    repositoryId = repository.id
    for (const deployment of repository.deployments.nodes) {
      const payloadKind = deploymentPayloadKind(deployment.payload)
      if (payloadKind === 'branch-deploy') return deployment
      if (payloadKind === 'malformed') return null
    }

    const pageInfo = repository.deployments.pageInfo
    if (!pageInfo.hasNextPage) return null
    if (pageInfo.endCursor === null || pageInfo.endCursor === '') {
      throw new Error('The deployment page has no end cursor')
    }
    if (seenCursors.has(pageInfo.endCursor)) {
      throw new Error('The deployment page cursor did not advance')
    }
    seenCursors.add(pageInfo.endCursor)
    cursor = pageInfo.endCursor
  }
}
