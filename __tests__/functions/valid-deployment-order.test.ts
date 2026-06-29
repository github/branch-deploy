import * as core from '../../src/actions-core.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import {COLORS} from '../../src/functions/colors.ts'
import {validDeploymentOrder} from '../../src/functions/valid-deployment-order.ts'
import * as activeDeployment from '../../src/functions/deployment.ts'
import {createContext} from '../test-helpers.ts'

const setOutputMock = vi.spyOn(core, 'setOutput')
const warningMock = vi.spyOn(core, 'warning')
const infoMock = vi.spyOn(core, 'info')
const errorMock = vi.spyOn(core, 'error')
const activeDeploymentMock = vi.spyOn(activeDeployment, 'activeDeployment')

let octokit: Parameters<typeof validDeploymentOrder>[0]
let context: Parameters<typeof validDeploymentOrder>[1]
const environment: Parameters<typeof validDeploymentOrder>[3] = 'production'
const sha: Parameters<typeof validDeploymentOrder>[4] = 'deadbeef'
const graphqlMock =
  vi.fn<Parameters<typeof validDeploymentOrder>[0]['graphql']>()

beforeEach(() => {
  vi.clearAllMocks()

  context = createContext()
  octokit = {graphql: graphqlMock}

  activeDeploymentMock.mockResolvedValue(true)
})

test('when the enforced deployment order is only one item and it is the requested environment', async () => {
  expect(
    await validDeploymentOrder(
      octokit,
      context,
      ['production'],
      environment,
      sha
    )
  ).toStrictEqual({
    valid: true,
    results: []
  })

  expect(
    warningMock.mock.calls.some(([message]) =>
      String(message).includes(
        'Having only one environment in the enforced deployment order will always cause the deployment order checks to pass if the environment names match'
      )
    )
  ).toBe(true)
})

test('when the enforced deployment order passes for all previous environments', async () => {
  expect(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      environment,
      sha
    )
  ).toStrictEqual({
    valid: true,
    results: [
      {
        environment: 'development',
        active: true
      },
      {
        environment: 'staging',
        active: true
      }
    ]
  })

  expect(
    infoMock.mock.calls.some(([message]) =>
      message.includes(
        'deployment order checks passed as all previous environments have active deployments'
      )
    )
  ).toBe(true)
})

test('when the enforced deployment order fails because one out of two environments (the first one) is not active in the order', async () => {
  activeDeploymentMock.mockResolvedValueOnce(false)

  expect(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      environment,
      sha
    )
  ).toStrictEqual({
    valid: false,
    results: [
      {
        environment: 'development',
        active: false
      },
      {
        environment: 'staging',
        active: true
      }
    ]
  })

  expect(
    errorMock.mock.calls.some(([message]) =>
      String(message).includes(
        `${COLORS.highlight}development${COLORS.reset} does not have an active deployment at sha: deadbeef`
      )
    )
  ).toBe(true)

  expect(setOutputMock).toHaveBeenCalledWith(
    'needs_to_be_deployed',
    'development'
  )
})

test('when the enforced deployment order fails because one out of two environments (the previous one) is not active in the order', async () => {
  activeDeploymentMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

  expect(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      environment,
      sha
    )
  ).toStrictEqual({
    valid: false,
    results: [
      {
        environment: 'development',
        active: true
      },
      {
        environment: 'staging',
        active: false
      }
    ]
  })

  expect(
    errorMock.mock.calls.some(([message]) =>
      String(message).includes(
        `${COLORS.highlight}staging${COLORS.reset} does not have an active deployment at sha: deadbeef`
      )
    )
  ).toBe(true)

  expect(setOutputMock).toHaveBeenCalledWith('needs_to_be_deployed', 'staging')
})

test('when the enforced deployment order fails because both of the environments are not active in the enforced order', async () => {
  activeDeploymentMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false)

  expect(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      environment,
      sha
    )
  ).toStrictEqual({
    valid: false,
    results: [
      {
        environment: 'development',
        active: false
      },
      {
        environment: 'staging',
        active: false
      }
    ]
  })

  expect(
    errorMock.mock.calls.some(([message]) =>
      String(message).includes(
        `${COLORS.highlight}development${COLORS.reset} does not have an active deployment at sha: deadbeef`
      )
    )
  ).toBe(true)
  expect(
    errorMock.mock.calls.some(([message]) =>
      String(message).includes(
        `${COLORS.highlight}staging${COLORS.reset} does not have an active deployment at sha: deadbeef`
      )
    )
  ).toBe(true)

  expect(setOutputMock).toHaveBeenCalledWith(
    'needs_to_be_deployed',
    'development,staging'
  )
})

test('when the enforced deployment order passes due to the environment being the first in the order', async () => {
  expect(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      'development',
      sha
    )
  ).toStrictEqual({
    valid: true,
    results: []
  })

  expect(
    infoMock.mock.calls.some(([message]) =>
      message.includes('the first environment in the enforced deployment order')
    )
  ).toBe(true)
})

test('when the enforced deployment order passes and the requested environment is the second in the order and all after that item are not checked by design', async () => {
  expect(
    await validDeploymentOrder(
      octokit,
      context,
      ['development', 'staging', 'production'],
      'staging',
      sha
    )
  ).toStrictEqual({
    valid: true,
    results: [
      {
        environment: 'development',
        active: true
      }
    ]
  })

  expect(
    infoMock.mock.calls.some(([message]) =>
      message.includes(
        'deployment order checks passed as all previous environments have active deployments'
      )
    )
  ).toBe(true)
})
