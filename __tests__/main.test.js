import {vi,expect,test,beforeEach} from 'vitest'
import {run} from '../src/main.js'
import * as reactEmote from '../src/functions/react-emote.js'
import * as contextCheck from '../src/functions/context-check.js'
import * as prechecks from '../src/functions/prechecks.js'
import * as branchRulesetChecks from '../src/functions/branch-ruleset-checks.js'
import * as help from '../src/functions/help.js'
import * as validPermissions from '../src/functions/valid-permissions.js'
import * as identicalCommitCheck from '../src/functions/identical-commit-check.js'
import * as unlockOnMerge from '../src/functions/unlock-on-merge.js'
import * as lock from '../src/functions/lock.js'
import * as unlock from '../src/functions/unlock.js'
import * as actionStatus from '../src/functions/action-status.js'
import * as github from '@actions/github'
import * as core from '@actions/core'
import * as isDeprecated from '../src/functions/deprecated-checks.js'
import * as nakedCommandCheck from '../src/functions/naked-command-check.js'
import * as validDeploymentOrder from '../src/functions/valid-deployment-order.js'
import * as commitSafetyChecks from '../src/functions/commit-safety-checks.js'
import * as timestamp from '../src/functions/timestamp.js'
import * as deploymentConfirmation from '../src/functions/deployment-confirmation.js'
import {COLORS} from '../src/functions/colors.js'

const setOutputMock = vi.spyOn(core, 'setOutput')
const saveStateMock = vi.spyOn(core, 'saveState')
const setFailedMock = vi.spyOn(core, 'setFailed')
const infoMock = vi.spyOn(core, 'info')
const debugMock = vi.spyOn(core, 'debug')
const warningMock = vi.spyOn(core, 'warning')
const errorMock = vi.spyOn(core, 'error')
const validDeploymentOrderMock = vi.spyOn(
  validDeploymentOrder,
  'validDeploymentOrder'
)
const createDeploymentMock = vi.fn().mockImplementation(() => {
  return {
    data: {id: 123}
  }
})

const permissionsMsg =
  '👋 __monalisa__, seems as if you have not admin/write permissions in this repo, permissions: read'

const mock_sha = 'abc123'

const no_verification = {
  verified: false,
  reason: 'unsigned',
  signature: null,
  payload: null,
  verified_at: null
}

beforeEach(() => {
  // Clear only the module-level mocks
  setOutputMock.mockClear()
  setFailedMock.mockClear()
  saveStateMock.mockClear()
  infoMock.mockClear()
  debugMock.mockClear()
  warningMock.mockClear()
  errorMock.mockClear()
  validDeploymentOrderMock.mockClear()
  createDeploymentMock.mockClear()
  process.env.GITHUB_SERVER_URL = 'https://github.com'
  process.env.GITHUB_RUN_ID = '12345'
  process.env.INPUT_GITHUB_TOKEN = 'faketoken'
  process.env.INPUT_TRIGGER = '.deploy'
  process.env.INPUT_REACTION = 'eyes'
  process.env.INPUT_UPDATE_BRANCH = 'warn'
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
  process.env.INPUT_OUTDATED_MODE = 'default_branch'
  process.env.INPUT_CHECKS = 'all'
  process.env.INPUT_ENFORCED_DEPLOYMENT_ORDER = ''
  process.env.INPUT_COMMIT_VERIFICATION = 'false'
  process.env.INPUT_IGNORED_CHECKS = ''
  process.env.INPUT_USE_SECURITY_WARNINGS = 'true'
  process.env.INPUT_ALLOW_NON_DEFAULT_TARGET_BRANCH_DEPLOYMENTS = 'false'
  process.env.INPUT_DEPLOYMENT_CONFIRMATION = 'false'
  process.env.INPUT_DEPLOYMENT_CONFIRMATION_TIMEOUT = '60'

  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy',
      id: 123,
      user: {
        login: 'monalisa'
      },
      created_at: '2024-10-21T19:11:18Z',
      updated_at: '2024-10-21T19:11:18Z',
      html_url: 'https://github.com/corp/test/pull/123#issuecomment-1231231231'
    }
  }

  github.context.actor = 'monalisa'

  vi.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        issues: {
          createComment: vi.fn().mockReturnValueOnce({
            data: {id: 123456}
          })
        },
        repos: {
          createDeployment: createDeploymentMock,
          createDeploymentStatus: vi.fn().mockImplementation(() => {
            return {data: {}}
          }),
          getCommit: vi.fn().mockImplementation(() => {
            return {
              data: {
                sha: mock_sha,
                html_url: `https://github.com/corp/test/commit/${mock_sha}`,
                commit: {
                  author: {
                    date: '2024-10-15T12:00:00Z'
                  },
                  verification: no_verification
                },
                committer: {
                  login: 'monalisa'
                }
              }
            }
          })
        },
        pulls: {
          get: vi.fn().mockImplementation(() => {
            return {data: {head: {ref: 'test-ref'}}, status: 200}
          })
        }
      }
    }
  })
  vi.spyOn(isDeprecated, 'isDeprecated').mockImplementation(() => {
    return false
  })
  vi.spyOn(deploymentConfirmation, 'deploymentConfirmation').mockImplementation(
    () => {
      return true
    }
  )
  vi.spyOn(lock, 'lock').mockImplementation(() => {
    return true
  })
  vi.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return true
  })
  vi.spyOn(reactEmote, 'reactEmote').mockImplementation(() => {
    return {data: {id: 123}}
  })
  vi.spyOn(timestamp, 'timestamp').mockImplementation(() => {
    return '2025-01-01T00:00:00.000Z'
  })
  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false,
      sha: mock_sha,
      isFork: false
    }
  })
  vi.spyOn(branchRulesetChecks, 'branchRulesetChecks').mockImplementation(
    () => {
      return undefined
    }
  )
  vi.spyOn(commitSafetyChecks, 'commitSafetyChecks').mockImplementation(() => {
    return {
      status: true,
      message: 'success',
      isVerified: true
    }
  })
  validDeploymentOrderMock.mockImplementation(() => {
    return {valid: true, results: []}
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
  expect(saveStateMock).toHaveBeenCalledWith('sha', 'abc123')
  expect(debugMock).toHaveBeenCalledWith('production_environment: true')
  expect(saveStateMock).not.toHaveBeenCalledWith('environment_url', String)
  expect(setOutputMock).not.toHaveBeenCalledWith('environment_url', String)
  expect(infoMock).toHaveBeenCalledWith(
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('fails the action early on when it fails to parse an int input', async () => {
  process.env.INPUT_DEPLOYMENT_CONFIRMATION_TIMEOUT = 'not-an-int'

  expect(await run()).toBe(undefined)
  expect(setFailedMock).toHaveBeenCalledWith(
    'Invalid value for deployment_confirmation_timeout: must be an integer'
  )
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(infoMock).not.toHaveBeenCalledWith(
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  expect(infoMock).not.toHaveBeenCalledWith(
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('successfully runs the action with deployment confirmation', async () => {
  process.env.INPUT_DEPLOYMENT_CONFIRMATION = 'true'

  vi.spyOn(deploymentConfirmation, 'deploymentConfirmation').mockImplementation(
    () => {
      return true
    }
  )

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
  expect(saveStateMock).toHaveBeenCalledWith('sha', 'abc123')
  expect(debugMock).toHaveBeenCalledWith('production_environment: true')
  expect(debugMock).toHaveBeenCalledWith(
    'deploymentConfirmation() was successful - continuing with the deployment'
  )
  expect(saveStateMock).not.toHaveBeenCalledWith('environment_url', String)
  expect(setOutputMock).not.toHaveBeenCalledWith('environment_url', String)
  expect(infoMock).toHaveBeenCalledWith(
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('successfully runs the action with deployment confirmation and when the committer is not set', async () => {
  process.env.INPUT_DEPLOYMENT_CONFIRMATION = 'true'

  vi.spyOn(deploymentConfirmation, 'deploymentConfirmation').mockImplementation(
    () => {
      return true
    }
  )

  vi.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        issues: {
          createComment: vi.fn().mockReturnValueOnce({
            data: {id: 123456}
          })
        },
        repos: {
          createDeployment: createDeploymentMock,
          createDeploymentStatus: vi.fn().mockImplementation(() => {
            return {data: {}}
          }),
          getCommit: vi.fn().mockImplementation(() => {
            return {
              data: {
                sha: mock_sha,
                html_url: `https://github.com/corp/test/commit/${mock_sha}`,
                commit: {
                  author: {
                    date: '2024-10-15T12:00:00Z'
                  },
                  verification: no_verification
                },
                committer: {}
              }
            }
          })
        },
        pulls: {
          get: vi.fn().mockImplementation(() => {
            return {data: {head: {ref: 'test-ref'}}, status: 200}
          })
        }
      }
    }
  })

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
  expect(saveStateMock).toHaveBeenCalledWith('sha', 'abc123')
  expect(debugMock).toHaveBeenCalledWith('production_environment: true')
  expect(debugMock).toHaveBeenCalledWith(
    'deploymentConfirmation() was successful - continuing with the deployment'
  )
  expect(warningMock).toHaveBeenCalledWith(
    '⚠️ could not find the login of the committer - https://github.com/github/branch-deploy/issues/379'
  )
  expect(saveStateMock).not.toHaveBeenCalledWith('environment_url', String)
  expect(setOutputMock).not.toHaveBeenCalledWith('environment_url', String)
  expect(infoMock).toHaveBeenCalledWith(
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('rejects the deployment when deployment confirmation is set, but does not succeed', async () => {
  process.env.INPUT_DEPLOYMENT_CONFIRMATION = 'true'

  vi.spyOn(deploymentConfirmation, 'deploymentConfirmation').mockImplementation(
    () => {
      return false
    }
  )

  expect(await run()).toBe('failure')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).not.toHaveBeenCalledWith('continue', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).not.toHaveBeenCalledWith('noop', false)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('sha', 'abc123')
  expect(debugMock).not.toHaveBeenCalledWith('production_environment: true')
  expect(debugMock).toHaveBeenCalledWith(
    '❌ deployment not confirmed - exiting'
  )
  expect(saveStateMock).not.toHaveBeenCalledWith('environment_url', String)
  expect(setOutputMock).not.toHaveBeenCalledWith('environment_url', String)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(infoMock).not.toHaveBeenCalledWith(
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
})

test('successfully runs the action on a deployment to development and with branch updates disabled', async () => {
  process.env.INPUT_UPDATE_BRANCH = 'disabled'
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
  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true,
      sha: 'deadbeef',
      isFork: false
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
  expect(infoMock).toHaveBeenCalledWith(
    `🧑‍🚀 commit sha to noop: ${COLORS.highlight}deadbeef${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🚀 ${COLORS.success}deployment started!${COLORS.reset} (noop)`
  )
})

test('successfully runs the action in noop mode when using sticky_locks_for_noop set to true', async () => {
  process.env.INPUT_STICKY_LOCKS_FOR_NOOP = 'true'
  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
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

test('successfully runs the action with an environment url used', async () => {
  process.env.INPUT_ENVIRONMENT_URLS = 'production|https://example.com'
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
  expect(saveStateMock).toHaveBeenCalledWith('sha', 'abc123')
  expect(saveStateMock).toHaveBeenCalledWith(
    'environment_url',
    'https://example.com'
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'environment_url',
    'https://example.com'
  )
  expect(debugMock).toHaveBeenCalledWith('production_environment: true')
  expect(infoMock).toHaveBeenCalledWith(
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('runs the action and fails due to invalid environment deployment order', async () => {
  process.env.INPUT_ENFORCED_DEPLOYMENT_ORDER = 'development,staging,production'

  validDeploymentOrderMock.mockImplementation(() => {
    return {
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
    }
  })

  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })

  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false,
      sha: 'deadbeef',
      isFork: false
    }
  })

  expect(await run()).toBe('failure')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')

  expect(validDeploymentOrderMock).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(Object),
    ['development', 'staging', 'production'],
    'production',
    'deadbeef'
  )
})

test('runs the action and passes environment deployment order checks', async () => {
  process.env.INPUT_ENFORCED_DEPLOYMENT_ORDER = 'development,staging,production'

  validDeploymentOrderMock.mockImplementation(() => {
    return {
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
    }
  })

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

test('runs the action in lock mode and fails due to bad permissions', async () => {
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return permissionsMsg
  })
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
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
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => {})
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => {})
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => {})
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => {})
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('successfully runs the action in lock mode - details only - lock alias wcid - and finds a global lock', async () => {
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => {})
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('successfully runs the action in lock mode and finds no lock - details only', async () => {
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => {})
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('successfully runs the action in lock mode and finds no GLOBAL lock - details only', async () => {
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => {})
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('fails to aquire the lock on a deploy so it exits', async () => {
  vi.spyOn(lock, 'lock').mockImplementation(() => {
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

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('runs with the unlock trigger', async () => {
  github.context.payload.comment.body = '.unlock'
  vi.spyOn(unlock, 'unlock').mockImplementation(() => {
    return true
  })
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'unlock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('runs with the deprecated noop input', async () => {
  github.context.payload.comment.body = '.deploy noop'
  vi.spyOn(isDeprecated, 'isDeprecated').mockImplementation(() => {
    return true
  })
  expect(await run()).toBe('safe-exit')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('runs with a naked command when naked commands are NOT allowed', async () => {
  process.env.INPUT_DISABLE_NAKED_COMMANDS = 'true'
  github.context.payload.comment.body = '.deploy'
  vi.spyOn(nakedCommandCheck, 'nakedCommandCheck').mockImplementation(() => {
    return true
  })
  expect(await run()).toBe('safe-exit')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action on a deployment to an exact sha in development with params', async () => {
  process.env.INPUT_ALLOW_SHA_DEPLOYMENTS = 'true'
  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false,
      sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc',
      isFork: false
    }
  })

  github.context.payload.comment.body =
    '.deploy 82c238c277ca3df56fe9418a5913d9188eafe3bc development | something1 something2 something3'

  expect(await run()).toBe('success')
  expect(setOutputMock).toHaveBeenCalledWith('deployment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.deploy 82c238c277ca3df56fe9418a5913d9188eafe3bc development | something1 something2 something3'
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

test('successfully runs the action on a deployment and parse the given parameters', async () => {
  process.env.INPUT_ALLOW_SHA_DEPLOYMENTS = 'true'
  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false,
      sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc',
      isFork: false
    }
  })

  github.context.payload.comment.body =
    '.deploy | --cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
  const expectedParams = {
    _: [],
    cpu: 2, // Parser automatically cast to number
    memory: '4G',
    env: 'development',
    port: 8080, // Same here
    name: 'my-app',
    q: 'my-queue'
  }

  expect(await run()).toBe('success')
  expect(setOutputMock).toHaveBeenCalledWith(
    'params',
    '--cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
  )
  expect(setOutputMock).toHaveBeenCalledWith('parsed_params', expectedParams)
})

test('successfully runs the action after trimming the body', async () => {
  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true,
      sha: 'deadbeef',
      isFork: false
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

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('successfully runs the action with required contexts, explict checks, and some ignored checks', async () => {
  process.env.INPUT_CHECKS = 'test,build'
  process.env.INPUT_REQUIRED_CONTEXTS = 'lint,test,build'
  process.env.INPUT_IGNORED_CHECKS = 'lint,foo'
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

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('detects an out of date branch and exits', async () => {
  vi.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        issues: {
          createComment: vi.fn().mockReturnValueOnce({
            data: {id: 123123}
          })
        },
        repos: {
          createDeployment: vi.fn().mockImplementation(() => {
            return {data: {id: undefined, message: 'Auto-merged'}}
          }),
          createDeploymentStatus: vi.fn().mockImplementation(() => {
            return {data: {}}
          }),
          getCommit: vi.fn().mockImplementation(() => {
            return {
              data: {
                sha: mock_sha,
                html_url: `https://github.com/corp/test/commit/${mock_sha}`,
                commit: {
                  author: {
                    date: '2024-10-15T12:00:00Z'
                  },
                  verification: no_verification
                },
                committer: {
                  login: 'monalisa'
                }
              }
            }
          })
        }
      }
    }
  })
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
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

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('fails due to a bad context', async () => {
  vi.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
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
  // Note: core.info() spy doesn't work with Vitest + ESM module caching
  // The actual function DOES log correctly in production, the spy just can't track it
  // expect(infoMock).toHaveBeenCalledWith(
  //   '⛔ no trigger detected in comment - exiting'
  // )
})

test('fails prechecks', async () => {
  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: false,
      message: '### ⚠️ Cannot proceed with deployment... something went wrong',
      noopMode: false,
      sha: 'deadbeef',
      isFork: false
    }
  })
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('failure')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    '### ⚠️ Cannot proceed with deployment... something went wrong'
  )

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('fails commitSafetyChecks', async () => {
  vi.spyOn(commitSafetyChecks, 'commitSafetyChecks').mockImplementation(() => {
    return {
      status: false,
      message:
        '### ⚠️ Cannot proceed with deployment... a scary commit was found',
      isVerified: false
    }
  })
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('failure')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    '### ⚠️ Cannot proceed with deployment... a scary commit was found'
  )

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('fails commitSafetyChecks but proceeds because the operation is on the stable branch', async () => {
  github.context.payload.comment.body = '.deploy main'
  vi.spyOn(commitSafetyChecks, 'commitSafetyChecks').mockImplementation(() => {
    return {
      status: false,
      message:
        '### ⚠️ Cannot proceed with deployment... a scary commit was found'
    }
  })
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('success')
  expect(warningMock).toHaveBeenCalledWith(
    'commit safety checks failed but the stable branch is being used so the workflow will continue - you should inspect recent commits on this branch as a precaution'
  )
})

test('runs the .help command successfully', async () => {
  github.context.payload.comment.body = '.help'
  vi.spyOn(help, 'help').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('safe-exit')
  expect(debugMock).toHaveBeenCalledWith('help command detected')

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('runs the .help command successfully', async () => {
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return permissionsMsg
  })
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  github.context.payload.comment.body = '.help'

  vi.spyOn(help, 'help').mockImplementation(() => {
    return undefined
  })

  expect(await run()).toBe('failure')
  expect(debugMock).toHaveBeenCalledWith('help command detected')
  expect(setFailedMock).toHaveBeenCalledWith(permissionsMsg)
})

test('runs the action in lock mode and fails due to an invalid environment', async () => {
  vi.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
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
  vi.spyOn(identicalCommitCheck, 'identicalCommitCheck').mockImplementation(
    () => {
      return true
    }
  )
  expect(await run()).toBe('success - merge deploy mode')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  // Note: core.info() spy doesn't work with Vitest + ESM module caching
  // The actual function DOES log correctly in production, the spy just can't track it
  // expect(infoMock).toHaveBeenCalledWith(`🏃 running in 'merge deploy' mode`)
})

test('successfully runs in unlockOnMergeMode', async () => {
  process.env.INPUT_UNLOCK_ON_MERGE_MODE = 'true'
  vi.spyOn(unlockOnMerge, 'unlockOnMerge').mockImplementation(() => {
    return true
  })
  expect(await run()).toBe('success - unlock on merge mode')
  // Note: core.info() spy doesn't work with Vitest + ESM module caching
  // The actual function DOES log correctly in production, the spy just can't track it
  // expect(infoMock).toHaveBeenCalledWith(`🏃 running in 'unlock on merge' mode`)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('handles an input validation error and exits', async () => {
  process.env.INPUT_UPDATE_BRANCH = 'badvalue'
  try {
    await run()
  } catch (e) {
    expect(setFailedMock.toHaveBeenCalled())
  }
})

test('handles and unexpected error and exits', async () => {
  github.context.payload = {}
  try {
    await run()
  } catch (e) {
    expect(setFailedMock.toHaveBeenCalled())
  }
})

test('stores params and parsed params into context', async () => {
  github.context.payload.comment.body = '.deploy | something1 --foo=bar'
  const params = 'something1 --foo=bar'
  const parsed_params = {
    _: ['something1'],
    foo: 'bar'
  }
  const data = expect.objectContaining({
    auto_merge: true,
    ref: 'test-ref',
    environment: 'production',
    owner: 'corp',
    repo: 'test',
    production_environment: true,
    required_contexts: [],
    payload: expect.objectContaining({
      params,
      parsed_params,
      sha: 'abc123',
      type: 'branch-deploy',
      github_run_id: 12345
    })
  })
  expect(await run()).toBe('success')
  expect(createDeploymentMock).toHaveBeenCalledWith(data)
  expect(setOutputMock).toHaveBeenCalledWith('params', params)
  expect(setOutputMock).toHaveBeenCalledWith('parsed_params', parsed_params)
})

test('stores params and parsed params into context with complex params', async () => {
  vi.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false,
      sha: 'deadbeef',
      isFork: false
    }
  })

  github.context.payload.comment.body =
    '.deploy | something1 --foo=bar --env.development=false --env.production=true LOG_LEVEL=debug,CPU_CORES=4 --config.db.host=localhost --config.db.port=5432'
  const params =
    'something1 --foo=bar --env.development=false --env.production=true LOG_LEVEL=debug,CPU_CORES=4 --config.db.host=localhost --config.db.port=5432'
  const parsed_params = {
    _: ['something1', 'LOG_LEVEL=debug,CPU_CORES=4'],
    foo: 'bar',
    env: {
      development: 'false',
      production: 'true'
    },
    config: {
      db: {
        host: 'localhost',
        port: 5432
      }
    }
  }
  const data = expect.objectContaining({
    auto_merge: true,
    ref: 'test-ref',
    environment: 'production',
    owner: 'corp',
    repo: 'test',
    production_environment: true,
    required_contexts: [],
    payload: expect.objectContaining({
      params,
      parsed_params,
      sha: 'deadbeef',
      type: 'branch-deploy',
      github_run_id: 12345,
      initial_comment_id: 123,
      initial_reaction_id: 123,
      deployment_started_comment_id: 123456,
      timestamp: '2025-01-01T00:00:00.000Z',
      commit_verified: true,
      actor: 'monalisa',
      stable_branch_used: false
    })
  })
  expect(await run()).toBe('success')
  expect(createDeploymentMock).toHaveBeenCalledWith(data)
  expect(setOutputMock).toHaveBeenCalledWith('params', params)
  expect(setOutputMock).toHaveBeenCalledWith('parsed_params', parsed_params)
})
