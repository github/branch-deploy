import {vi, expect, test, beforeEach} from 'vitest'
import {
  createDeploymentStatus,
  latestActiveDeployment,
  activeDeployment
} from '../../src/functions/deployment.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import type {
  DeploymentGraphqlNode,
  DeploymentGraphqlResult
} from '../../src/types.ts'
import {createContext} from '../test-helpers.ts'

type StatusOctokit = Parameters<typeof createDeploymentStatus>[0]
type GraphqlOctokit = Parameters<typeof latestActiveDeployment>[0]

const createDeploymentStatusMock =
  vi.fn<StatusOctokit['rest']['repos']['createDeploymentStatus']>()
const graphqlMock = vi.fn<GraphqlOctokit['graphql']>()

const statusOctokit: StatusOctokit = {
  rest: {repos: {createDeploymentStatus: createDeploymentStatusMock}}
}
const graphqlOctokit: GraphqlOctokit = {graphql: graphqlMock}

const activeDeploymentNode = {
  createdAt: '2024-09-19T20:18:18Z',
  environment: 'production',
  updatedAt: '2024-09-19T20:18:21Z',
  id: 'DE_kwDOID9x8M5sC6QZ',
  payload:
    '{"type":"branch-deploy", "sha": "315cec138fc9d7dac8a47c6bba4217d3965ede3b"}',
  state: 'ACTIVE',
  creator: {login: 'github-actions'},
  ref: {name: 'main'},
  commit: {oid: '315cec138fc9d7dac8a47c6bba4217d3965ede3b'}
}

function deploymentPage(
  nodes: readonly DeploymentGraphqlNode[],
  hasNextPage = false,
  endCursor: string | null = null
): DeploymentGraphqlResult {
  return {
    repository: {
      deployments: {
        nodes,
        pageInfo: {endCursor, hasNextPage}
      }
    }
  }
}

let context: Parameters<typeof latestActiveDeployment>[1]

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com')
  context = createContext({
    repo: {owner: 'corp', repo: 'test'},
    runId: 12345
  })
  createDeploymentStatusMock.mockResolvedValue({
    data: {id: 456, url: 'https://api.github.com/deployments/456'}
  })
})

const environment = 'production'
const deploymentId = 123
const ref = 'test-ref'
const logUrl = 'https://github.com/corp/test/actions/runs/12345'

test('creates an in_progress deployment status', async () => {
  expect(
    await createDeploymentStatus(
      statusOctokit,
      context,
      ref,
      'in_progress',
      deploymentId,
      environment
    )
  ).toStrictEqual({
    id: 456,
    url: 'https://api.github.com/deployments/456'
  })

  expect(createDeploymentStatusMock).toHaveBeenCalledWith({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref,
    deployment_id: deploymentId,
    state: 'in_progress',
    environment,
    environment_url: null,
    log_url: logUrl,
    headers: API_HEADERS
  })
})

test('successfully fetches the latest deployment', async () => {
  graphqlMock.mockResolvedValue(deploymentPage([activeDeploymentNode]))

  expect(
    await latestActiveDeployment(graphqlOctokit, context, environment)
  ).toStrictEqual(activeDeploymentNode)
  expect(graphqlMock).toHaveBeenCalled()
})

test('returns null if no deployments are found', async () => {
  graphqlMock.mockResolvedValue(deploymentPage([]))

  expect(
    await latestActiveDeployment(graphqlOctokit, context, environment)
  ).toBeNull()
  expect(graphqlMock).toHaveBeenCalled()
})

test('returns null if no deployments are found in 3 pages of queries', async () => {
  const inactive = {state: 'INACTIVE', commit: {oid: 'sha'}}
  graphqlMock
    .mockResolvedValueOnce(deploymentPage([inactive], true, 'cursor'))
    .mockResolvedValueOnce(deploymentPage([inactive], true, 'cursor'))
    .mockResolvedValueOnce(deploymentPage([inactive], false, 'cursor'))

  expect(
    await latestActiveDeployment(graphqlOctokit, context, environment)
  ).toBeNull()
  expect(graphqlMock).toHaveBeenCalledTimes(3)
})

test('returns the deployment when it is found in the second page of queries', async () => {
  const inactive = {state: 'INACTIVE', commit: {oid: 'sha'}}
  const pending = {state: 'PENDING', commit: {oid: 'sha'}}
  const active = {state: 'ACTIVE', commit: {oid: 'sha'}}
  graphqlMock
    .mockResolvedValueOnce(
      deploymentPage([inactive, inactive, inactive, pending], true, 'cursor')
    )
    .mockResolvedValueOnce(
      deploymentPage([inactive, inactive, active, inactive], true, 'cursor')
    )

  expect(
    await latestActiveDeployment(graphqlOctokit, context, environment)
  ).toStrictEqual(active)
  expect(graphqlMock).toHaveBeenCalledTimes(2)
})

test('returns false if the deployment is not active', async () => {
  graphqlMock.mockResolvedValue(
    deploymentPage([{...activeDeploymentNode, state: 'INACTIVE'}])
  )

  expect(
    await activeDeployment(graphqlOctokit, context, environment, 'sha')
  ).toBe(false)
  expect(graphqlMock).toHaveBeenCalled()
})

test('returns false if the deployment does not match the sha', async () => {
  graphqlMock.mockResolvedValue(
    deploymentPage([{...activeDeploymentNode, commit: {oid: 'badsha'}}])
  )

  expect(
    await activeDeployment(graphqlOctokit, context, environment, 'sha')
  ).toBe(false)
  expect(graphqlMock).toHaveBeenCalled()
})

test('returns true if the deployment is active and matches the sha', async () => {
  graphqlMock.mockResolvedValue(deploymentPage([activeDeploymentNode]))

  expect(
    await activeDeployment(
      graphqlOctokit,
      context,
      environment,
      '315cec138fc9d7dac8a47c6bba4217d3965ede3b'
    )
  ).toBe(true)
  expect(graphqlMock).toHaveBeenCalled()
})

test('returns false if the deployment is not found', async () => {
  graphqlMock.mockResolvedValue(deploymentPage([]))

  expect(
    await activeDeployment(graphqlOctokit, context, environment, 'sha')
  ).toBe(false)
  expect(graphqlMock).toHaveBeenCalled()
})
