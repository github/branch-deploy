import * as github from '@actions/github'
import * as core from '@actions/core'

import {post} from '../../src/functions/post'
import {COLORS} from '../../src/functions/colors'
import * as postDeploy from '../../src/functions/post-deploy'
import * as contextCheck from '../../src/functions/context-check'

const validBooleanInputs = {
  skip_completing: false
}
const validInputs = {
  status: 'success'
}

const validStates = {
  ref: 'test-ref',
  comment_id: '123',
  noop: 'false',
  deployment_id: '456',
  environment: 'production',
  token: 'test-token'
}

const setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation(() => {})
const setWarningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})
const infoMock = jest.spyOn(core, 'info').mockImplementation(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'error').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'getBooleanInput').mockImplementation(name => {
    return validBooleanInputs[name]
  })
  jest.spyOn(core, 'getInput').mockImplementation(name => {
    return validInputs[name]
  })
  jest.spyOn(core, 'getState').mockImplementation(name => {
    return validStates[name]
  })
  jest.spyOn(postDeploy, 'postDeploy').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return true
  })
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return true
  })
})

test('successfully runs post() Action logic', async () => {
  expect(await post()).toBeUndefined()
})

test('exits due to an invalid Actions context', async () => {
  jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return false
  })
  expect(await post()).toBeUndefined()
})

test('exits due to a bypass being set', async () => {
  const bypassed = {
    bypass: 'true'
  }
  jest.spyOn(core, 'getState').mockImplementation(name => {
    return bypassed[name]
  })
  expect(await post()).toBeUndefined()
  expect(setWarningMock).toHaveBeenCalledWith(
    `⛔ ${COLORS.highlight}bypass${COLORS.reset} set, exiting`
  )
})

test('skips the process of completing a deployment', async () => {
  const skipped = {
    skip_completing: 'true'
  }
  jest.spyOn(core, 'getBooleanInput').mockImplementation(name => {
    return skipped[name]
  })
  expect(await post()).toBeUndefined()
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ ${COLORS.highlight}skip_completing${COLORS.reset} set, exiting`
  )
})

test('throws an error', async () => {
  try {
    jest.spyOn(github, 'getOctokit').mockImplementation(() => {
      throw new Error('test error')
    })
    await post()
  } catch (e) {
    expect(e.message).toBe('test error')
    expect(setFailedMock).toHaveBeenCalledWith('test error')
  }
})
