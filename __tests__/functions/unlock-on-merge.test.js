import * as core from '@actions/core'
import {vi, expect, test, beforeEach} from 'vitest'
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
  vi.spyOn(core, 'warning').mockImplementation(() => {})
  vi.spyOn(core, 'setOutput').mockImplementation(() => {})
  vi.spyOn(core, 'info').mockImplementation(() => {})
  vi.spyOn(core, 'debug').mockImplementation(() => {})
  vi.spyOn(core, 'error').mockImplementation(() => {})
  vi.spyOn(core, 'getInput').mockImplementation(name => {
    if (name === 'deployment_task') {
      return ''
    }
    return ''
  })
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

  octokit = {
    rest: {
      repos: {
        listBranches: vi.fn()
      }
    }
  }
})

test('successfully unlocks all environments on a pull request merge', async () => {
  process.env.INPUT_DEPLOYMENT_TASK = ''
  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - branch: ${COLORS.highlight}staging-branch-deploy-lock${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - branch: ${COLORS.highlight}development-branch-deploy-lock${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - branch: ${COLORS.highlight}production-branch-deploy-lock${COLORS.reset}`
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production,development,staging'
  )
})

test('finds that no deployment lock is set so none are removed', async () => {
  process.env.INPUT_DEPLOYMENT_TASK = ''
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
  process.env.INPUT_DEPLOYMENT_TASK = ''
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
    `⏩ lock for PR ${COLORS.info}111${COLORS.reset} on branch ${COLORS.highlight}production-branch-deploy-lock${COLORS.reset} is not associated with PR ${COLORS.info}123${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ no lock file found for branch ${COLORS.highlight}development-branch-deploy-lock${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - branch: ${COLORS.highlight}staging-branch-deploy-lock${COLORS.reset}`
  )
})

test('only unlocks one environment because the other is not associated with the pull request and the other has no lock branch', async () => {
  process.env.INPUT_DEPLOYMENT_TASK = ''
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
    `⏩ lock for PR ${COLORS.info}111${COLORS.reset} on branch ${COLORS.highlight}production-branch-deploy-lock${COLORS.reset} is not associated with PR ${COLORS.info}123${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ lock branch ${COLORS.highlight}development-branch-deploy-lock${COLORS.reset} no longer exists - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - branch: ${COLORS.highlight}staging-branch-deploy-lock${COLORS.reset}`
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
    "pull request was closed but not merged so this workflow will not run - OK (Use 'unlock-on-close' instead)"
  )
})

test('successfully unlocks all environments when deployment_task is set to "all"', async () => {
  vi.spyOn(core, 'getInput').mockImplementation(name => {
    if (name === 'deployment_task') {
      return 'all'
    }
    return ''
  })

  // Mock the listBranches API call to return multiple lock branches
  octokit.rest.repos.listBranches.mockResolvedValue({
    data: [
      {name: 'production-branch-deploy-lock'},
      {name: 'production-deploy-frontend-branch-deploy-lock'},
      {name: 'production-deploy-backend-branch-deploy-lock'},
      {name: 'development-branch-deploy-lock'},
      {name: 'staging-branch-deploy-lock'},
      {name: 'some-other-branch'}
    ]
  })

  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(true)

  // Verify the info message about deployment_task being set to 'all' (line 43)
  expect(infoMock).toHaveBeenCalledWith(
    `ℹ️ ${COLORS.highlight}deployment_task${COLORS.reset} is set to 'all', look for all related branches to unlock`
  )

  // Verify that listBranches was called for each environment (lines 53-56)
  expect(octokit.rest.repos.listBranches).toHaveBeenCalledTimes(3)

  // Verify the matching branches were found and logged (lines 67-69)
  expect(infoMock).toHaveBeenCalledWith(
    expect.stringContaining('🔍 found')
  )
  expect(infoMock).toHaveBeenCalledWith(
    expect.stringContaining('matching lock branches for environment')
  )
})

test('unlocks environment with task suffix when lockFile has task property', async () => {
  vi.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return {
      link: 'https://github.com/corp/test/pull/123#issuecomment-123456789',
      task: 'deploy-frontend'
    }
  })

  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(true)

  // Verify that the output includes the task suffix (line 121)
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production-deploy-frontend,development-deploy-frontend,staging-deploy-frontend'
  )
})

test('handles deployment_task="all" with no matching branches', async () => {
  vi.spyOn(core, 'getInput').mockImplementation(name => {
    if (name === 'deployment_task') {
      return 'all'
    }
    return ''
  })

  // Mock listBranches to return no matching lock branches
  octokit.rest.repos.listBranches.mockResolvedValue({
    data: [
      {name: 'main'},
      {name: 'feature-branch'},
      {name: 'some-other-branch'}
    ]
  })

  expect(
    await unlockOnMerge(octokit, context, environment_targets)
  ).toStrictEqual(true)

  // Verify that it found 0 matching branches
  expect(infoMock).toHaveBeenCalledWith(
    expect.stringContaining('🔍 found 0 matching lock branches')
  )

  // No environments should be unlocked
  expect(setOutputMock).toHaveBeenCalledWith('unlocked_environments', '')
})
