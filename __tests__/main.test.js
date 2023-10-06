import {run} from '../src/main'
import * as reactEmote from '../src/functions/react-emote'
import * as contextCheck from '../src/functions/context-check'
import * as prechecks from '../src/functions/prechecks'
import * as help from '../src/functions/help'
import * as validPermissions from '../src/functions/valid-permissions'
import * as identicalCommitCheck from '../src/functions/identical-commit-check'
import * as unlockOnMerge from '../src/functions/unlock-on-merge'
import * as lock from '../src/functions/lock'
import * as unlock from '../src/functions/unlock'
import * as actionStatus from '../src/functions/action-status'
import * as github from '@actions/github'
import * as core from '@actions/core'
import * as isDeprecated from '../src/functions/deprecated-checks'
import * as nakedCommandCheck from '../src/functions/naked-command-check'
import {COLORS} from '../src/functions/colors'

const setOutputMock = jest.spyOn(core, 'setOutput')
const saveStateMock = jest.spyOn(core, 'saveState')
const setFailedMock = jest.spyOn(core, 'setFailed')
const infoMock = jest.spyOn(core, 'info')
const debugMock = jest.spyOn(core, 'debug')

const permissionsMsg =
  '👋 __monalisa__, seems as if you have not admin/write permissions in this repo, permissions: read'

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'error').mockImplementation(() => {})
  process.env.INPUT_GITHUB_TOKEN = 'faketoken'
  process.env.INPUT_TRIGGER = '.deploy'
  process.env.INPUT_REACTION = 'eyes'
  process.env.INPUT_ENVIRONMENT = 'production'
  process.env.INPUT_ENVIRONMENT_TARGETS = 'production,development,staging'
  process.env.INPUT_ENVIRONMENT_URLS = ''
  process.env.INPUT_PARAM_SEPARATOR = '|'
  process.env.INPUT_PRODUCTION_ENVIRONMENTS = 'production'
  process.env.INPUT_STABLE_BRANCH = 'main'
  process.env.INPUT_NOOP_TRIGGER = '.noop'
  process.env.INPUT_LOCK_TRIGGER = '.lock'
  process.env.INPUT_UNLOCK_TRIGGER = '.unlock'
  process.env.INPUT_HELP_TRIGGER = '.help'
  process.env.INPUT_LOCK_INFO_ALIAS = '.wcid'
  process.env.INPUT_REQUIRED_CONTEXTS = 'false'
  process.env.INPUT_ALLOW_FORKS = 'true'
  process.env.GITHUB_REPOSITORY = 'corp/test'
  process.env.INPUT_GLOBAL_LOCK_FLAG = '--global'
  process.env.INPUT_MERGE_DEPLOY_MODE = 'false'
  process.env.INPUT_UNLOCK_ON_MERGE_MODE = 'false'
  process.env.INPUT_STICKY_LOCKS = 'false'
  process.env.INPUT_STICKY_LOCKS_FOR_NOOP = 'false'
  process.env.INPUT_ALLOW_SHA_DEPLOYMENTS = 'false'
  process.env.INPUT_DISABLE_NAKED_COMMANDS = 'false'

  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy',
      id: 123,
      user: {
        login: 'monalisa'
      }
    }
  }

  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        issues: {
          createComment: jest.fn().mockReturnValueOnce({
            data: {}
          })
        },
        repos: {
          createDeployment: jest.fn().mockImplementation(() => {
            return {
              data: {id: 123}
            }
          }),
          createDeploymentStatus: jest.fn().mockImplementation(() => {
            return {data: {}}
          })
        },
        pulls: {
          get: jest.fn().mockImplementation(() => {
            return {data: {head: {ref: 'test-ref'}}, status: 200}
          })
        }
      }
    }
  })
  jest.spyOn(isDeprecated, 'isDeprecated').mockImplementation(() => {
    return false
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return true
  })
  jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return true
  })
  jest.spyOn(reactEmote, 'reactEmote').mockImplementation(() => {
    return {data: {id: '123'}}
  })
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false
    }
  })
})

test('successfully runs the action', async () => {
  expect(await run()).toBe('success')
  expect(setOutputMock).toHaveBeenCalledWith('deployment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', false)
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', false)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('deployment_id', 123)
  expect(debugMock).toHaveBeenCalledWith('production_environment: true')
})

test('successfully runs the action on a deployment to development', async () => {
  github.context.payload.comment.body = '.deploy to development'

  expect(await run()).toBe('success')
  expect(setOutputMock).toHaveBeenCalledWith('deployment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.deploy to development'
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', false)
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'development')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', false)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('deployment_id', 123)
  expect(debugMock).toHaveBeenCalledWith('production_environment: false')
})

test('successfully runs the action in noop mode', async () => {
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true
    }
  })

  github.context.payload.comment.body = '.noop'

  expect(await run()).toBe('success - noop')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.noop')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', true)
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', true)
})

test('successfully runs the action in noop mode when using sticky_locks_for_noop set to true', async () => {
  process.env.INPUT_STICKY_LOCKS_FOR_NOOP = 'true'
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true
    }
  })

  github.context.payload.comment.body = '.noop'

  expect(await run()).toBe('success - noop')
  expect(debugMock).toHaveBeenCalledWith(
    `🔒 noop mode detected and using stickyLocks: true`
  )
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.noop')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', true)
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', true)
})

test('runs the action in lock mode and fails due to bad permissions', async () => {
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return permissionsMsg
  })
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })

  github.context.payload.comment.body = '.lock'

  expect(await run()).toBe('failure')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.lock')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setFailedMock).toHaveBeenCalledWith(permissionsMsg)
})

test('successfully runs the action in lock mode with a reason', async () => {
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return true
  })

  github.context.payload.comment.body = '.lock --reason testing a new feature'

  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.lock --reason testing a new feature'
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action in lock mode - details only', async () => {
  const infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {
      lockData: {
        branch: 'octocats-everywhere',
        created_at: '2022-06-14T21:12:14.041Z',
        created_by: 'octocat',
        environment: 'production',
        global: false,
        link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
        reason: 'Testing my new feature with lots of cats',
        sticky: true,
        unlock_command: '.unlock production'
      },
      status: 'details-only',
      globalFlag: '--global',
      environment: 'production'
    }
  })

  github.context.payload.comment.body = '.lock --details'

  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.lock --details')
  expect(infoSpy).toHaveBeenCalledWith(
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action in lock mode - details only - for the development environment', async () => {
  const infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {
      lockData: {
        branch: 'octocats-everywhere',
        created_at: '2022-06-14T21:12:14.041Z',
        created_by: 'octocat',
        global: false,
        environment: 'development',
        link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
        reason: 'Testing my new feature with lots of cats',
        sticky: true,
        unlock_command: '.unlock development'
      },
      status: 'details-only',
      globalFlag: '--global',
      environment: 'development'
    }
  })
  github.context.payload.comment.body = '.lock development --details'
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.lock development --details'
  )
  expect(infoSpy).toHaveBeenCalledWith(
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action in lock mode - details only - --info flag', async () => {
  const infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {
      lockData: {
        branch: 'octocats-everywhere',
        created_at: '2022-06-14T21:12:14.041Z',
        created_by: 'octocat',
        environment: 'production',
        global: false,
        link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
        reason: 'Testing my new feature with lots of cats',
        sticky: true,
        unlock_command: '.unlock production'
      },
      status: 'details-only',
      globalFlag: '--global',
      environment: 'production'
    }
  })
  github.context.payload.comment.body = '.lock --info'
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.lock --info')
  expect(infoSpy).toHaveBeenCalledWith(
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action in lock mode - details only - lock alias wcid', async () => {
  const infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {
      lockData: {
        branch: 'octocats-everywhere',
        created_at: '2022-06-14T21:12:14.041Z',
        created_by: 'octocat',
        environment: 'production',
        global: false,
        link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
        reason: 'Testing my new feature with lots of cats',
        sticky: true,
        unlock_command: '.unlock production'
      },
      environment: 'production',
      globalFlag: '--global',
      status: 'details-only'
    }
  })
  github.context.payload.comment.body = '.wcid'
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.wcid')
  expect(infoSpy).toHaveBeenCalledWith(
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock-info-alias')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action in lock mode - details only - lock alias wcid - and finds a global lock', async () => {
  const infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {
      lockData: {
        branch: 'octocats-everywhere',
        created_at: '2022-06-14T21:12:14.041Z',
        created_by: 'octocat',
        global: true,
        environment: null,
        link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
        reason: 'Testing my new feature with lots of cats',
        sticky: true,
        unlock_command: '.unlock --global'
      },
      status: 'details-only',
      globalFlag: '--global',
      environment: null
    }
  })
  github.context.payload.comment.body = '.wcid production'
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.wcid production')
  expect(infoSpy).toHaveBeenCalledWith(
    `🌏 there is a ${COLORS.highlight}global${COLORS.reset} deployment lock on this repository`
  )
  expect(infoSpy).toHaveBeenCalledWith(
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock-info-alias')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action in lock mode and finds no lock - details only', async () => {
  const infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {
      status: null,
      lockData: null,
      environment: 'production',
      globalFlag: '--global'
    }
  })
  github.context.payload.comment.body = '.lock --details'
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.lock --details')
  expect(infoSpy).toHaveBeenCalledWith('✅ no active deployment locks found')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action in lock mode and finds no GLOBAL lock - details only', async () => {
  const infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {
      status: null,
      lockData: null,
      environment: null,
      global: true,
      globalFlag: '--global'
    }
  })
  github.context.payload.comment.body = '.lock --global --details'
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.lock --global --details'
  )
  expect(infoSpy).toHaveBeenCalledWith('✅ no active deployment locks found')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('fails to aquire the lock on a deploy so it exits', async () => {
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {status: false}
  })
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
})

test('runs with the unlock trigger', async () => {
  github.context.payload.comment.body = '.unlock'
  jest.spyOn(unlock, 'unlock').mockImplementation(() => {
    return true
  })
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'unlock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
})

test('runs with the deprecated noop input', async () => {
  github.context.payload.comment.body = '.deploy noop'
  jest.spyOn(isDeprecated, 'isDeprecated').mockImplementation(() => {
    return true
  })
  expect(await run()).toBe('safe-exit')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('runs with a naked command when naked commands are NOT allowed', async () => {
  process.env.INPUT_DISABLE_NAKED_COMMANDS = 'true'
  github.context.payload.comment.body = '.deploy'
  jest.spyOn(nakedCommandCheck, 'nakedCommandCheck').mockImplementation(() => {
    return true
  })
  expect(await run()).toBe('safe-exit')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action after trimming the body', async () => {
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true
    }
  })
  github.context.payload.comment.body = '.noop    \n\t\n   '
  expect(await run()).toBe('success - noop')
  // other expects are similar to previous tests.
})

test('successfully runs the action with required contexts', async () => {
  process.env.INPUT_REQUIRED_CONTEXTS = 'lint,test,build'
  expect(await run()).toBe('success')
  expect(setOutputMock).toHaveBeenCalledWith('deployment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', false)
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', false)
})

test('detects an out of date branch and exits', async () => {
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        issues: {
          createComment: jest.fn().mockReturnValueOnce({
            data: {}
          })
        },
        repos: {
          createDeployment: jest.fn().mockImplementation(() => {
            return {data: {id: undefined, message: 'Auto-merged'}}
          }),
          createDeploymentStatus: jest.fn().mockImplementation(() => {
            return {data: {}}
          })
        }
      }
    }
  })
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', false)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', false)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('fails due to a bad context', async () => {
  jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return false
  })
  expect(await run()).toBe('safe-exit')
})

test('fails due to no valid environment targets being found in the comment body', async () => {
  github.context.payload.comment.body = '.deploy to chaos'
  expect(await run()).toBe('safe-exit')
  expect(debugMock).toHaveBeenCalledWith('No valid environment targets found')
})

test('fails due to no trigger being found', async () => {
  process.env.INPUT_TRIGGER = '.shipit'
  expect(await run()).toBe('safe-exit')
  expect(infoMock).toHaveBeenCalledWith(
    '⛔ no trigger detected in comment - exiting'
  )
})

test('fails prechecks', async () => {
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: false,
      message: '### ⚠️ Cannot proceed with deployment... something went wrong',
      noopMode: false
    }
  })
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('failure')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    '### ⚠️ Cannot proceed with deployment... something went wrong'
  )
})

test('runs the .help command successfully', async () => {
  github.context.payload.comment.body = '.help'
  jest.spyOn(help, 'help').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('safe-exit')
  expect(debugMock).toHaveBeenCalledWith('help command detected')
})

test('runs the .help command successfully', async () => {
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return permissionsMsg
  })
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  github.context.payload.comment.body = '.help'

  jest.spyOn(help, 'help').mockImplementation(() => {
    return undefined
  })

  expect(await run()).toBe('failure')
  expect(debugMock).toHaveBeenCalledWith('help command detected')
  expect(setFailedMock).toHaveBeenCalledWith(permissionsMsg)
})

test('runs the action in lock mode and fails due to an invalid environment', async () => {
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  github.context.payload.comment.body = '.lock --details super-production'
  expect(await run()).toBe('safe-exit')
  expect(debugMock).toHaveBeenCalledWith(
    'No valid environment targets found for lock/unlock request'
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.lock --details super-production'
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  process.env.INPUT_GLOBAL_LOCK_FLAG = ''
})

test('successfully runs in mergeDeployMode', async () => {
  process.env.INPUT_MERGE_DEPLOY_MODE = 'true'
  jest
    .spyOn(identicalCommitCheck, 'identicalCommitCheck')
    .mockImplementation(() => {
      return true
    })
  expect(await run()).toBe('success - merge deploy mode')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(infoMock).toHaveBeenCalledWith(`🏃 running in 'merge deploy' mode`)
})

test('successfully runs in unlockOnMergeMode', async () => {
  process.env.INPUT_UNLOCK_ON_MERGE_MODE = 'true'
  jest.spyOn(unlockOnMerge, 'unlockOnMerge').mockImplementation(() => {
    return true
  })
  expect(await run()).toBe('success - unlock on merge mode')
  expect(infoMock).toHaveBeenCalledWith(`🏃 running in 'unlock on merge' mode`)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('handles and unexpected error and exits', async () => {
  github.context.payload = {}
  try {
    await run()
  } catch (e) {
    expect(setFailedMock.toHaveBeenCalled())
  }
})
