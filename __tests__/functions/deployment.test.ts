import assert from 'node:assert/strict'
import {afterEach, beforeEach, mock, test} from 'node:test'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import type {
  DeploymentGraphqlNode,
  DeploymentGraphqlResult
} from '../../src/types.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledTimes,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type DeploymentModule = typeof import('../../src/functions/deployment.ts')
type StatusOctokit = Parameters<DeploymentModule['createDeploymentStatus']>[0]
type GraphqlOctokit = Parameters<DeploymentModule['latestActiveDeployment']>[0]

const debugMock = createMock<ActionsCore['debug']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock
})

const {createDeploymentStatus, latestActiveDeployment, activeDeployment} =
  await import('../../src/functions/deployment.ts')

const createDeploymentStatusMock =
  createMock<StatusOctokit['rest']['repos']['createDeploymentStatus']>()
const graphqlMock = createMock<GraphqlOctokit['graphql']>()

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
const originalServerUrl = process.env['GITHUB_SERVER_URL']

beforeEach(() => {
  debugMock.mock.resetCalls()
  createDeploymentStatusMock.mock.resetCalls()
  graphqlMock.mock.resetCalls()
  process.env['GITHUB_SERVER_URL'] = 'https://github.com'
  context = createContext({
    repo: {owner: 'corp', repo: 'test'},
    runId: 12345
  })
  createDeploymentStatusMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {id: 456, url: 'https://api.github.com/deployments/456'}
    })
  )
})

afterEach(() => {
  if (originalServerUrl === undefined) {
    delete process.env['GITHUB_SERVER_URL']
  } else {
    process.env['GITHUB_SERVER_URL'] = originalServerUrl
  }
})

const environment = 'production'
const deploymentId = 123
const ref = 'test-ref'
const logUrl = 'https://github.com/corp/test/actions/runs/12345'

test('creates an in_progress deployment status', async () => {
  assert.deepStrictEqual(
    await createDeploymentStatus(
      statusOctokit,
      context,
      ref,
      'in_progress',
      deploymentId,
      environment
    ),
    {
      id: 456,
      url: 'https://api.github.com/deployments/456'
    }
  )

  assert.deepStrictEqual(
    createDeploymentStatusMock.mock.calls.map(call => call.arguments),
    [
      [
        {
          owner: context.repo.owner,
          repo: context.repo.repo,
          ref,
          deployment_id: deploymentId,
          state: 'in_progress',
          environment,
          environment_url: null,
          log_url: logUrl,
          headers: API_HEADERS
        }
      ]
    ]
  )
})

test('successfully fetches the latest deployment', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(deploymentPage([activeDeploymentNode]))
  )

  assert.deepStrictEqual(
    await latestActiveDeployment(graphqlOctokit, context, environment),
    activeDeploymentNode
  )
  assertCalledTimes(graphqlMock, 1)
})

test('returns null if no deployments are found', async () => {
  graphqlMock.mock.mockImplementation(() => Promise.resolve(deploymentPage([])))

  assert.strictEqual(
    await latestActiveDeployment(graphqlOctokit, context, environment),
    null
  )
  assertCalledTimes(graphqlMock, 1)
})

test('returns null if no deployments are found in 3 pages of queries', async () => {
  const inactive = {state: 'INACTIVE', commit: {oid: 'sha'}}
  graphqlMock.mock.mockImplementationOnce(
    () => Promise.resolve(deploymentPage([inactive], true, 'cursor')),
    0
  )
  graphqlMock.mock.mockImplementationOnce(
    () => Promise.resolve(deploymentPage([inactive], true, 'cursor')),
    1
  )
  graphqlMock.mock.mockImplementationOnce(
    () => Promise.resolve(deploymentPage([inactive], false, 'cursor')),
    2
  )

  assert.strictEqual(
    await latestActiveDeployment(graphqlOctokit, context, environment),
    null
  )
  assertCalledTimes(graphqlMock, 3)
})

test('returns the deployment when it is found in the second page of queries', async () => {
  const inactive = {state: 'INACTIVE', commit: {oid: 'sha'}}
  const pending = {state: 'PENDING', commit: {oid: 'sha'}}
  const active = {state: 'ACTIVE', commit: {oid: 'sha'}}
  graphqlMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve(
        deploymentPage([inactive, inactive, inactive, pending], true, 'cursor')
      ),
    0
  )
  graphqlMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve(
        deploymentPage([inactive, inactive, active, inactive], true, 'cursor')
      ),
    1
  )

  assert.deepStrictEqual(
    await latestActiveDeployment(graphqlOctokit, context, environment),
    active
  )
  assertCalledTimes(graphqlMock, 2)
})

test('returns false if the deployment is not active', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(
      deploymentPage([{...activeDeploymentNode, state: 'INACTIVE'}])
    )
  )

  assert.strictEqual(
    await activeDeployment(graphqlOctokit, context, environment, 'sha'),
    false
  )
  assertCalledTimes(graphqlMock, 1)
})

test('returns false if the deployment does not match the sha', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(
      deploymentPage([{...activeDeploymentNode, commit: {oid: 'badsha'}}])
    )
  )

  assert.strictEqual(
    await activeDeployment(graphqlOctokit, context, environment, 'sha'),
    false
  )
  assertCalledTimes(graphqlMock, 1)
})

test('returns true if the deployment is active and matches the sha', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(deploymentPage([activeDeploymentNode]))
  )

  assert.strictEqual(
    await activeDeployment(
      graphqlOctokit,
      context,
      environment,
      '315cec138fc9d7dac8a47c6bba4217d3965ede3b'
    ),
    true
  )
  assertCalledTimes(graphqlMock, 1)
})

test('returns false if the deployment is not found', async () => {
  graphqlMock.mock.mockImplementation(() => Promise.resolve(deploymentPage([])))

  assert.strictEqual(
    await activeDeployment(graphqlOctokit, context, environment, 'sha'),
    false
  )
  assertCalledTimes(graphqlMock, 1)
})
