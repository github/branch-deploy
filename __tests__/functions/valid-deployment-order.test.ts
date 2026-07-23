import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  assertNotCalled,
  createMock,
  queueMockImplementation,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type ActiveDeployment = typeof import('../../src/functions/deployment.ts')

const setOutputMock = createMock<ActionsCore['setOutput']>()
const warningMock = createMock<ActionsCore['warning']>()
const infoMock = createMock<ActionsCore['info']>()
const errorMock = createMock<ActionsCore['error']>()
const debugMock = createMock<ActionsCore['debug']>()
const activeDeploymentMock = createMock<ActiveDeployment['activeDeployment']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  error: errorMock,
  info: infoMock,
  setOutput: setOutputMock,
  warning: warningMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/deployment.ts', import.meta.url),
  {activeDeployment: activeDeploymentMock}
)

const {validDeploymentOrder} =
  await import('../../src/functions/valid-deployment-order.ts')

let octokit: Parameters<typeof validDeploymentOrder>[0]
let context: Parameters<typeof validDeploymentOrder>[1]
const environment: Parameters<typeof validDeploymentOrder>[3] = 'production'
const sha: Parameters<typeof validDeploymentOrder>[4] = 'deadbeef'
const graphqlMock =
  createMock<Parameters<typeof validDeploymentOrder>[0]['graphql']>()

beforeEach(() => {
  setOutputMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  infoMock.mock.resetCalls()
  errorMock.mock.resetCalls()
  debugMock.mock.resetCalls()
  activeDeploymentMock.mock.resetCalls()
  graphqlMock.mock.resetCalls()

  context = createContext()
  octokit = {graphql: graphqlMock}

  activeDeploymentMock.mock.mockImplementation(() => Promise.resolve(true))
})

test('when the enforced deployment order is only one item and it is the requested environment', async () => {
  assert.deepStrictEqual(
    await validDeploymentOrder(
      octokit,
      context,
      ['production'],
      environment,
      sha
    ),
    {valid: true, results: []}
  )

  assert.ok(
    warningMock.mock.calls.some(call =>
      String(call.arguments[0]).includes(
        'Having only one environment in the enforced deployment order will always cause the deployment order checks to pass if the environment names match'
      )
    )
  )
})

test('rejects duplicate environments before checking deployment history', async () => {
  await assert.rejects(
    validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'development', 'production'],
      environment,
      sha
    ),
    /enforced deployment order contains duplicate environments/
  )

  assertNotCalled(activeDeploymentMock)
  assertNotCalled(setOutputMock)
})

test('rejects a requested environment missing from the enforced order', async () => {
  await assert.rejects(
    validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging'],
      environment,
      sha
    ),
    /requested environment is not present in the enforced deployment order: production/
  )

  assertNotCalled(activeDeploymentMock)
  assertNotCalled(setOutputMock)
})

test('when the enforced deployment order passes for all previous environments', async () => {
  assert.deepStrictEqual(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      environment,
      sha
    ),
    {
      valid: true,
      results: [
        {environment: 'development', active: true},
        {environment: 'staging', active: true}
      ]
    }
  )

  assert.ok(
    infoMock.mock.calls.some(call =>
      call.arguments[0].includes(
        'deployment order checks passed as all previous environments have active deployments'
      )
    )
  )
})

test('when the enforced deployment order fails because one out of two environments (the first one) is not active in the order', async () => {
  queueMockImplementation(activeDeploymentMock, () => Promise.resolve(false))

  assert.deepStrictEqual(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      environment,
      sha
    ),
    {
      valid: false,
      results: [
        {environment: 'development', active: false},
        {environment: 'staging', active: true}
      ]
    }
  )

  assert.ok(
    errorMock.mock.calls.some(call =>
      String(call.arguments[0]).includes(
        `${COLORS.highlight}development${COLORS.reset} does not have an active deployment at sha: deadbeef`
      )
    )
  )
  assertCalledWith(setOutputMock, 'needs_to_be_deployed', 'development')
})

test('when the enforced deployment order fails because one out of two environments (the previous one) is not active in the order', async () => {
  activeDeploymentMock.mock.mockImplementationOnce(
    () => Promise.resolve(true),
    0
  )
  activeDeploymentMock.mock.mockImplementationOnce(
    () => Promise.resolve(false),
    1
  )

  assert.deepStrictEqual(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      environment,
      sha
    ),
    {
      valid: false,
      results: [
        {environment: 'development', active: true},
        {environment: 'staging', active: false}
      ]
    }
  )

  assert.ok(
    errorMock.mock.calls.some(call =>
      String(call.arguments[0]).includes(
        `${COLORS.highlight}staging${COLORS.reset} does not have an active deployment at sha: deadbeef`
      )
    )
  )
  assertCalledWith(setOutputMock, 'needs_to_be_deployed', 'staging')
})

test('when the enforced deployment order fails because both of the environments are not active in the enforced order', async () => {
  activeDeploymentMock.mock.mockImplementationOnce(
    () => Promise.resolve(false),
    0
  )
  activeDeploymentMock.mock.mockImplementationOnce(
    () => Promise.resolve(false),
    1
  )

  assert.deepStrictEqual(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      environment,
      sha
    ),
    {
      valid: false,
      results: [
        {environment: 'development', active: false},
        {environment: 'staging', active: false}
      ]
    }
  )

  for (const failedEnvironment of ['development', 'staging']) {
    assert.ok(
      errorMock.mock.calls.some(call =>
        String(call.arguments[0]).includes(
          `${COLORS.highlight}${failedEnvironment}${COLORS.reset} does not have an active deployment at sha: deadbeef`
        )
      )
    )
  }
  assertCalledWith(setOutputMock, 'needs_to_be_deployed', 'development,staging')
})

test('when the enforced deployment order passes due to the environment being the first in the order', async () => {
  assert.deepStrictEqual(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      'development',
      sha
    ),
    {valid: true, results: []}
  )

  assert.ok(
    infoMock.mock.calls.some(call =>
      call.arguments[0].includes(
        'the first environment in the enforced deployment order'
      )
    )
  )
})

test('when the enforced deployment order passes and the requested environment is the second in the order and all after that item are not checked by design', async () => {
  assert.deepStrictEqual(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      'staging',
      sha
    ),
    {
      valid: true,
      results: [{environment: 'development', active: true}]
    }
  )

  assert.ok(
    infoMock.mock.calls.some(call =>
      call.arguments[0].includes(
        'deployment order checks passed as all previous environments have active deployments'
      )
    )
  )
})
