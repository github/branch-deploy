import assert from 'node:assert/strict'
import {afterEach, beforeEach, mock, test} from 'node:test'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
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
type DeploymentPage = Awaited<ReturnType<GraphqlOctokit['graphql']>>
type DeploymentNode = NonNullable<
  DeploymentPage['repository']
>['deployments']['nodes'][number]

const debugMock = createMock<ActionsCore['debug']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock
})

const {
  activeDeployment,
  createDeploymentStatus,
  latestActiveDeployment,
  latestBranchDeployDeployment
} = await import('../../src/functions/deployment.ts')

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
  nodes: readonly DeploymentNode[],
  hasNextPage = false,
  endCursor: string | null = null,
  repositoryId = 'R_test',
  nameWithOwner = 'corp/test'
): DeploymentPage {
  return {
    repository: {
      id: repositoryId,
      nameWithOwner,
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

for (const state of [
  'error',
  'failure',
  'inactive',
  'in_progress',
  'pending',
  'queued',
  'success'
] as const) {
  test(`preserves the ${state} deployment status request contract`, async () => {
    const environmentUrl = 'https://example.com/staging?mode=preview#ready'

    assert.deepStrictEqual(
      await createDeploymentStatus(
        statusOctokit,
        context,
        ref,
        state,
        '123',
        environment,
        environmentUrl
      ),
      {id: 456, url: 'https://api.github.com/deployments/456'}
    )
    assert.deepStrictEqual(
      createDeploymentStatusMock.mock.calls[0]?.arguments[0],
      {
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref,
        deployment_id: '123',
        state,
        environment,
        environment_url: environmentUrl,
        log_url: logUrl,
        headers: API_HEADERS
      }
    )
  })
}

test('successfully fetches the latest deployment', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(deploymentPage([activeDeploymentNode]))
  )

  assert.deepStrictEqual(
    await latestActiveDeployment(graphqlOctokit, context, environment),
    activeDeploymentNode
  )
  assertCalledTimes(graphqlMock, 1)
  const call = graphqlMock.mock.calls[0]
  assert.ok(call)
  assert.match(call.arguments[0], /after: \$cursor/)
  assert.deepStrictEqual(call.arguments[1], {
    repo_owner: 'corp',
    repo_name: 'test',
    environment,
    first: 1,
    cursor: null
  })
})

test('returns null if no deployments are found', async () => {
  graphqlMock.mock.mockImplementation(() => Promise.resolve(deploymentPage([])))

  assert.strictEqual(
    await latestActiveDeployment(graphqlOctokit, context, environment),
    null
  )
  assertCalledTimes(graphqlMock, 1)
})

test('returns null when the newest deployment is inactive without reading older pages', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(
      deploymentPage(
        [{...activeDeploymentNode, id: 'inactive', state: 'INACTIVE'}],
        true,
        'cursor'
      )
    )
  )

  assert.strictEqual(
    await latestActiveDeployment(graphqlOctokit, context, environment),
    null
  )
  assertCalledTimes(graphqlMock, 1)
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

test('paginates with cursor variables to find the newest branch-deploy deployment', async () => {
  graphqlMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve(
        deploymentPage(
          [
            {
              ...activeDeploymentNode,
              id: 'other-object',
              payload: {type: 'other'}
            },
            {
              ...activeDeploymentNode,
              id: 'other-json',
              payload: '{"type":"other"}'
            },
            {...activeDeploymentNode, id: 'null-payload', payload: null}
          ],
          true,
          'cursor-1'
        )
      ),
    0
  )
  graphqlMock.mock.mockImplementationOnce(
    () => Promise.resolve(deploymentPage([activeDeploymentNode])),
    1
  )

  assert.deepStrictEqual(
    await latestBranchDeployDeployment(graphqlOctokit, context, environment),
    activeDeploymentNode
  )
  assert.deepStrictEqual(
    graphqlMock.mock.calls.map(call => call.arguments[1]),
    [
      {
        repo_owner: 'corp',
        repo_name: 'test',
        environment,
        first: 100,
        cursor: null
      },
      {
        repo_owner: 'corp',
        repo_name: 'test',
        environment,
        first: 100,
        cursor: 'cursor-1'
      }
    ]
  )
})

test('accepts an object branch-deploy payload', async () => {
  const deployment = {
    ...activeDeploymentNode,
    payload: {type: 'branch-deploy'}
  }
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(deploymentPage([deployment]))
  )

  assert.deepStrictEqual(
    await latestBranchDeployDeployment(graphqlOctokit, context, environment),
    deployment
  )
})

test('accepts the double-encoded payload returned by GitHub GraphQL', async () => {
  const deployment = {
    ...activeDeploymentNode,
    payload: JSON.stringify(JSON.stringify({type: 'branch-deploy'}))
  }
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(deploymentPage([deployment]))
  )

  assert.deepStrictEqual(
    await latestBranchDeployDeployment(graphqlOctokit, context, environment),
    deployment
  )
})

test('returns null when deployment history has no branch-deploy deployment', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(
      deploymentPage([
        {...activeDeploymentNode, payload: {type: 'another-deployer'}}
      ])
    )
  )

  assert.strictEqual(
    await latestBranchDeployDeployment(graphqlOctokit, context, environment),
    null
  )
})

for (const payload of [
  '{',
  JSON.stringify('{'),
  JSON.stringify(JSON.stringify(JSON.stringify({type: 'branch-deploy'}))),
  1,
  {type: null}
] as const) {
  test(`stops at malformed deployment payload ${JSON.stringify(payload)}`, async () => {
    graphqlMock.mock.mockImplementation(() =>
      Promise.resolve(
        deploymentPage([
          {...activeDeploymentNode, payload},
          activeDeploymentNode
        ])
      )
    )

    assert.strictEqual(
      await latestBranchDeployDeployment(graphqlOctokit, context, environment),
      null
    )
  })
}

test('treats an object without a deployment type as unrelated history', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(
      deploymentPage([
        {...activeDeploymentNode, payload: {}},
        activeDeploymentNode
      ])
    )
  )

  assert.deepStrictEqual(
    await latestBranchDeployDeployment(graphqlOctokit, context, environment),
    activeDeploymentNode
  )
})

for (const [description, page] of [
  ['missing repository', {repository: null}],
  ['empty repository identity', deploymentPage([], false, null, '')]
] as const) {
  test(`rejects deployment history with ${description}`, async () => {
    graphqlMock.mock.mockImplementation(() => Promise.resolve(page))

    await assert.rejects(
      latestBranchDeployDeployment(graphqlOctokit, context, environment),
      /deployment history has no repository identity/
    )
  })
}

test('rejects deployment history for another repository', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(deploymentPage([], false, null, 'R_other', 'corp/other'))
  )

  await assert.rejects(
    latestBranchDeployDeployment(graphqlOctokit, context, environment),
    /deployment history belongs to another repository/
  )
})

test('rejects deployment history for another environment', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(
      deploymentPage([{...activeDeploymentNode, environment: 'staging'}])
    )
  )

  await assert.rejects(
    latestBranchDeployDeployment(graphqlOctokit, context, environment),
    /deployment history belongs to another environment/
  )
})

test('rejects a repository identity change while paging deployment history', async () => {
  graphqlMock.mock.mockImplementationOnce(
    () => Promise.resolve(deploymentPage([], true, 'cursor-1')),
    0
  )
  graphqlMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve(
        deploymentPage([], false, null, 'R_changed', 'CORP/TEST')
      ),
    1
  )

  await assert.rejects(
    latestBranchDeployDeployment(graphqlOctokit, context, environment),
    /deployment history repository changed while paging/
  )
})

for (const [description, cursor] of [
  ['missing', null],
  ['empty', '']
] as const) {
  test(`rejects a ${description} deployment page cursor`, async () => {
    graphqlMock.mock.mockImplementation(() =>
      Promise.resolve(deploymentPage([], true, cursor))
    )

    await assert.rejects(
      latestBranchDeployDeployment(graphqlOctokit, context, environment),
      /deployment page has no end cursor/
    )
  })
}

test('rejects a repeated deployment page cursor', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(deploymentPage([], true, 'cursor-1'))
  )

  await assert.rejects(
    latestBranchDeployDeployment(graphqlOctokit, context, environment),
    /deployment page cursor did not advance/
  )
  assertCalledTimes(graphqlMock, 2)
})
