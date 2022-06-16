import {post} from '../../src/functions/post'
import * as core from '@actions/core'
import * as postDeploy from '../../src/functions/post-deploy'
import * as contextCheck from '../../src/functions/context-check'
import * as github from '@actions/github'

const validStates = {
  ref: 'test-ref',
  comment_id: '123',
  noop: 'false',
  deployment_id: '456',
  environment: 'production',
  token: 'test-token',
  status: 'success'
}

const setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation(() => {})
const setWarningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(core, 'error').mockImplementation(() => {})
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
  expect(setWarningMock).toHaveBeenCalledWith('bypass set, exiting')
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
