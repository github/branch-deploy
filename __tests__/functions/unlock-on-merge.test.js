import * as core from '@actions/core'
import * as unlock from '../../src/functions/unlock'
import * as checkLockFile from '../../src/functions/check-lock-file'
import {unlockOnMerge} from '../../src/functions/unlock-on-merge'

const setOutputMock = jest.spyOn(core, 'setOutput')
const infoMock = jest.spyOn(core, 'info')
const setFailedMock = jest.spyOn(core, 'setFailed')
// const debugMock = jest.spyOn(core, 'debug')

const environment_targets = 'production,development,staging'

var context
var octokit
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'error').mockImplementation(() => {})
  jest.spyOn(unlock, 'unlock').mockImplementation(() => {
    return 'removed lock - silent'
  })
  jest.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return {
      link: 'https://github.com/corp/test/pull/123#issuecomment-123456789'
    }
  })

  context = {
    eventName: 'pull_request',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    payload: {
      action: 'closed',
      pull_request: {
        merged: true,
        number: 123,
        head: {
          ref: 'deadbeef'
        }
      }
    }
  }

  octokit = {}
})

test('successfully unlocks all environments on a pull request merge', async () => {
  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith('removed lock - environment: staging')
  expect(infoMock).toHaveBeenCalledWith(
    'removed lock - environment: development'
  )
  expect(infoMock).toHaveBeenCalledWith(
    'removed lock - environment: production'
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production,development,staging'
  )
})

test('fails due to the context not being a PR merge', async () => {
  context.payload.action = 'opened'
  context.payload.pull_request.merged = false
  context.payload.eventName = 'pull_request'
  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(false)
  expect(infoMock).toHaveBeenCalledWith(
    'event name: pull_request, action: opened, merged: false'
  )
  expect(setFailedMock).toHaveBeenCalledWith(
    'This workflow can only run in the context of a merged pull request'
  )
})
