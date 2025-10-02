import * as core from '@actions/core'
import * as unlock from '../../src/functions/unlock'
import * as checkLockFile from '../../src/functions/check-lock-file'
import * as checkBranch from '../../src/functions/lock'
import {unlockOnClose} from '../../src/functions/unlock-on-close'
import {COLORS} from '../../src/functions/colors'

const setOutputMock = jest.spyOn(core, 'setOutput')
const infoMock = jest.spyOn(core, 'info')
const warningMock = jest.spyOn(core, 'warning')
const debugMock = jest.spyOn(core, 'debug')

const environment_targets = 'production,development,staging'

var context
var octokit
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'error').mockImplementation(() => {})
  jest.spyOn(core, 'getInput').mockImplementation(name => {
    if (name === 'deployment_task') {
      return ''
    }
    return ''
  })
  jest.spyOn(unlock, 'unlock').mockImplementation(() => {
    return 'removed lock - silent'
  })
  jest.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return {
      link: 'https://github.com/corp/test/pull/123#issuecomment-123456789'
    }
  })
  jest.spyOn(checkBranch, 'checkBranch').mockImplementation(() => {
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
        merged: false,
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
        listBranches: jest.fn().mockReturnValue({
          data: [
            {name: 'production-branch-deploy-lock'},
            {name: 'development-branch-deploy-lock'},
            {name: 'staging-branch-deploy-lock'}
          ]
        })
      }
    }
  }
})

test('successfully unlocks when PR is closed (not merged)', async () => {
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production,development,staging'
  )
})

test('returns false when event is not pull_request', async () => {
  context.eventName = 'push'
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(
    false
  )
  expect(warningMock).toHaveBeenCalledWith(
    `this workflow can only run in the context of a ${COLORS.highlight}closed${COLORS.reset} pull request`
  )
})

test('returns false when action is not closed', async () => {
  context.payload.action = 'opened'
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(
    false
  )
  expect(warningMock).toHaveBeenCalledWith(
    `this workflow can only run in the context of a ${COLORS.highlight}closed${COLORS.reset} pull request`
  )
})

test('returns false and logs unlock-on-merge message when wrong event but PR is merged', async () => {
  context.eventName = 'push'
  context.payload.pull_request.merged = true
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(
    false
  )
  expect(warningMock).toHaveBeenCalledWith(
    `this workflow can only run in the context of a ${COLORS.highlight}closed${COLORS.reset} pull request`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `pull request was merged so this workflow should not run - OK (Use 'unlock-on-merge' instead)`
  )
})

test('successfully unlocks even when PR is merged', async () => {
  context.payload.pull_request.merged = true
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(
    true
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production,development,staging'
  )
})

test('skips when lock branch does not exist', async () => {
  jest.spyOn(checkBranch, 'checkBranch').mockImplementation(() => {
    return false
  })
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(true)
  expect(infoMock).toHaveBeenCalledWith(
    expect.stringContaining('no longer exists - skipping...')
  )
})

test('skips when no lock file found', async () => {
  jest.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return null
  })
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(true)
  expect(infoMock).toHaveBeenCalledWith(
    expect.stringContaining('no lock file found')
  )
})

test('skips when lock file has no link property', async () => {
  jest.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return {}
  })
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(true)
  expect(infoMock).toHaveBeenCalledWith(
    expect.stringContaining('no lock file found')
  )
})

test('skips when lock is for a different PR', async () => {
  jest.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return {
      link: 'https://github.com/corp/test/pull/999#issuecomment-123456789'
    }
  })
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(true)
  expect(infoMock).toHaveBeenCalledWith(
    expect.stringContaining('is not associated with PR')
  )
  expect(setOutputMock).toHaveBeenCalledWith('unlocked_environments', '')
})

test('handles unlock failure gracefully', async () => {
  jest.spyOn(unlock, 'unlock').mockImplementation(() => {
    return 'lock not found - silent'
  })
  expect(await unlockOnClose(octokit, context, environment_targets)).toBe(true)
  expect(debugMock).toHaveBeenCalledWith(
    'unlock result for unlock-on-close: lock not found - silent'
  )
})

test('handles deployment_task set to "all"', async () => {
  jest.spyOn(core, 'getInput').mockImplementation(name => {
    if (name === 'deployment_task') {
      return 'all'
    }
    return ''
  })

  octokit.rest.repos.listBranches = jest.fn().mockReturnValue({
    data: [
      {name: 'production-branch-deploy-lock'},
      {name: 'production-backend-branch-deploy-lock'},
      {name: 'production-frontend-branch-deploy-lock'}
    ]
  })

  expect(await unlockOnClose(octokit, context, 'production')).toBe(true)
  expect(infoMock).toHaveBeenCalledWith(
    `ℹ️ ${COLORS.highlight}deployment_task${COLORS.reset} is set to 'all', look for all related branches to unlock`
  )
  expect(octokit.rest.repos.listBranches).toHaveBeenCalled()
})

test('handles lock with task property', async () => {
  jest.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return {
      link: 'https://github.com/corp/test/pull/123#issuecomment-123456789',
      task: 'backend'
    }
  })

  expect(await unlockOnClose(octokit, context, 'production')).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production-backend'
  )
  expect(unlock.unlock).toHaveBeenCalledWith(
    octokit,
    context,
    null,
    'production',
    true,
    'backend'
  )
})

test('handles lock without task property', async () => {
  jest.spyOn(checkLockFile, 'checkLockFile').mockImplementation(() => {
    return {
      link: 'https://github.com/corp/test/pull/123#issuecomment-123456789'
    }
  })

  expect(await unlockOnClose(octokit, context, 'production')).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production'
  )
  expect(unlock.unlock).toHaveBeenCalledWith(
    octokit,
    context,
    null,
    'production',
    true,
    null
  )
})
