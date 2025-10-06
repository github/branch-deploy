import * as core from '@actions/core'
import {vi, expect, describe, test, beforeEach, afterEach} from 'vitest'
import * as unlock from '../../src/functions/unlock.js'
import * as checkLockFile from '../../src/functions/check-lock-file.js'
import * as checkBranch from '../../src/functions/lock.js'
import {unlockOnMerge} from '../../src/functions/unlock-on-merge.js'
import {COLORS} from '../../src/functions/colors.js'

const setOutputMock = vi.spyOn(core, 'setOutput')
const infoMock = vi.spyOn(core, 'info')
const warningMock = vi.spyOn(core, 'warning')
const debugMock = vi.spyOn(core, 'debug')

const environment_targets = 'production,development,staging'

var context
var octokit
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(unlock, 'unlock').mockImplementation(() => {
    return 'removed lock - silent'
  })
  vi.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return {
      link: 'https://github.com/corp/test/pull/123#issuecomment-123456789'
    }
  })
  vi.spyOn(checkBranch, 'checkBranch').mockImplementation(() => {
    return true
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
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}development${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}production${COLORS.reset}`
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production,development,staging'
  )
})

test('finds that no deployment lock is set so none are removed', async () => {
  vi.spyOn(unlock, 'unlock').mockImplementation(() => {
    return 'no deployment lock currently set - silent'
  })

  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(true)
  expect(debugMock).toHaveBeenCalledWith(
    'unlock result for unlock-on-merge: no deployment lock currently set - silent'
  )
  expect(setOutputMock).toHaveBeenCalledWith('unlocked_environments', '')
})

test('only unlocks one environment because the other has no lock and the other is not associated with the pull request', async () => {
  checkLockFile.checkLockFile.mockImplementationOnce(() => {
    return {
      link: 'https://github.com/corp/test/pull/111#issuecomment-123456789'
    }
  })
  checkLockFile.checkLockFile.mockImplementationOnce(() => {
    return false
  })

  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ lock for PR ${COLORS.info}111${COLORS.reset} (env: ${COLORS.highlight}production${COLORS.reset}) is not associated with PR ${COLORS.info}123${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ no lock file found for environment ${COLORS.highlight}development${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
  )
})

test('only unlocks one environment because the other is not associated with the pull request and the other has no lock branch', async () => {
  checkLockFile.checkLockFile.mockImplementationOnce(() => {
    return {
      link: 'https://github.com/corp/test/pull/111#issuecomment-123456789'
    }
  })
  checkBranch.checkBranch.mockImplementationOnce(() => {
    return true
  })
  checkBranch.checkBranch.mockImplementationOnce(() => {
    return false
  })

  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ lock for PR ${COLORS.info}111${COLORS.reset} (env: ${COLORS.highlight}production${COLORS.reset}) is not associated with PR ${COLORS.info}123${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ no lock branch found for environment ${COLORS.highlight}development${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
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
  expect(warningMock).toHaveBeenCalledWith(
    `this workflow can only run in the context of a ${COLORS.highlight}merged${COLORS.reset} pull request`
  )
})

test('fails due to the context being a PR closed event but not a merge', async () => {
  context.payload.action = 'closed'
  context.payload.pull_request.merged = false
  context.payload.eventName = 'pull_request'
  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(false)
  expect(warningMock).toHaveBeenCalledWith(
    `this workflow can only run in the context of a ${COLORS.highlight}merged${COLORS.reset} pull request`
  )
  expect(infoMock).toHaveBeenCalledWith(
    'event name: pull_request, action: closed, merged: false'
  )
  expect(infoMock).toHaveBeenCalledWith(
    'pull request was closed but not merged so this workflow will not run - OK'
  )
})
