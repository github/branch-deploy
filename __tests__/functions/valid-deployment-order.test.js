import {test, expect, jest, beforeEach} from '@jest/globals'

import * as core from '@actions/core'
import {COLORS} from '../../src/functions/colors.js'
import {validDeploymentOrder} from '../../src/functions/valid-deployment-order.js'
import * as activeDeployment from '../../src/functions/deployment.js'

let octokit
let context
let environment = 'production'
let sha = 'deadbeef'

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'error').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})

  context = {}
  octokit = {}

  jest.spyOn(activeDeployment, 'activeDeployment').mockImplementation(() => {
    return true
  })
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

  expect(core.warning).toHaveBeenCalledWith(
    expect.stringMatching(
      /Having only one environment in the enforced deployment order will always cause the deployment order checks to pass if the environment names match/
    )
  )
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

  expect(core.info).toHaveBeenCalledWith(
    expect.stringMatching(
      /deployment order checks passed as all previous environments have active deployments/
    )
  )
})

test('when the enforced deployment order fails because one out of two environments (the first one) is not active in the order', async () => {
  jest
    .spyOn(activeDeployment, 'activeDeployment')
    .mockImplementationOnce(() => {
      return false
    })

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

  expect(core.error).toHaveBeenCalledWith(
    expect.stringContaining(
      `${COLORS.highlight}development${COLORS.reset} does not have an active deployment at sha: deadbeef`
    )
  )

  expect(core.setOutput).toHaveBeenCalledWith(
    'needs_to_be_deployed',
    'development'
  )
})

test('when the enforced deployment order fails because one out of two environments (the previous one) is not active in the order', async () => {
  jest
    .spyOn(activeDeployment, 'activeDeployment')
    .mockImplementationOnce(() => {
      return true
    })

  jest
    .spyOn(activeDeployment, 'activeDeployment')
    .mockImplementationOnce(() => {
      return false
    })

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

  expect(core.error).toHaveBeenCalledWith(
    expect.stringContaining(
      `${COLORS.highlight}staging${COLORS.reset} does not have an active deployment at sha: deadbeef`
    )
  )

  expect(core.setOutput).toHaveBeenCalledWith('needs_to_be_deployed', 'staging')
})

test('when the enforced deployment order fails because both of the environments are not active in the enforced order', async () => {
  jest
    .spyOn(activeDeployment, 'activeDeployment')
    .mockImplementationOnce(() => {
      return false
    })

  jest
    .spyOn(activeDeployment, 'activeDeployment')
    .mockImplementationOnce(() => {
      return false
    })

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

  expect(core.error).toHaveBeenCalledWith(
    expect.stringContaining(
      `${COLORS.highlight}development${COLORS.reset} does not have an active deployment at sha: deadbeef`
    )
  )

  expect(core.error).toHaveBeenCalledWith(
    expect.stringContaining(
      `${COLORS.highlight}staging${COLORS.reset} does not have an active deployment at sha: deadbeef`
    )
  )

  expect(core.setOutput).toHaveBeenCalledWith(
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

  expect(core.info).toHaveBeenCalledWith(
    expect.stringMatching(
      /the first environment in the enforced deployment order/
    )
  )
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

  expect(core.info).toHaveBeenCalledWith(
    expect.stringMatching(
      /deployment order checks passed as all previous environments have active deployments/
    )
  )
})
