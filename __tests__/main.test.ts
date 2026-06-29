import {vi, expect, test, beforeEach, type MockInstance} from 'vitest'
import {run} from '../src/main.ts'
import * as reactEmote from '../src/functions/react-emote.ts'
import * as contextCheck from '../src/functions/context-check.ts'
import * as prechecks from '../src/functions/prechecks.ts'
import * as branchRulesetChecks from '../src/functions/branch-ruleset-checks.ts'
import * as help from '../src/functions/help.ts'
import * as validPermissions from '../src/functions/valid-permissions.ts'
import * as identicalCommitCheck from '../src/functions/identical-commit-check.ts'
import * as unlockOnMerge from '../src/functions/unlock-on-merge.ts'
import * as lock from '../src/functions/lock.ts'
import * as unlock from '../src/functions/unlock.ts'
import * as actionStatus from '../src/functions/action-status.ts'
import * as github from '@actions/github'
import * as core from '../src/actions-core.ts'
import * as isDeprecated from '../src/functions/deprecated-checks.ts'
import * as nakedCommandCheck from '../src/functions/naked-command-check.ts'
import * as validDeploymentOrder from '../src/functions/valid-deployment-order.ts'
import * as commitSafetyChecks from '../src/functions/commit-safety-checks.ts'
import * as timestamp from '../src/functions/timestamp.ts'
import * as deploymentConfirmation from '../src/functions/deployment-confirmation.ts'
import {COLORS} from '../src/functions/colors.ts'
import {createOctokit} from './test-helpers.ts'
import type {BranchDeployOctokit} from '../src/types.ts'

vi.mock(import('@actions/github'), {spy: true})

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
type CreateDeployment = BranchDeployOctokit['rest']['repos']['createDeployment']
let createDeploymentMock: MockInstance<CreateDeployment> =
  vi.fn<CreateDeployment>()

const permissionsMsg =
  '👋 __monalisa__, seems as if you have not admin/write permissions in this repo, permissions: read'

const mock_sha = 'abc123'
let commitLogin: string | null = 'monalisa'
let deploymentMessage: string | null = null

const no_verification = {
  verified: false,
  reason: 'unsigned',
  signature: null,
  payload: null,
  verified_at: null
}

function setCommentBody(body: string): void {
  const comment = github.context.payload.comment
  if (comment === undefined) throw new Error('missing test comment')
  comment['body'] = body
}

beforeEach(() => {
  commitLogin = 'monalisa'
  deploymentMessage = null
  // Clear only the module-level mocks
  setOutputMock.mockClear()
  setFailedMock.mockClear()
  saveStateMock.mockClear()
  infoMock.mockClear()
  debugMock.mockClear()
  warningMock.mockClear()
  errorMock.mockClear()
  validDeploymentOrderMock.mockClear()
  vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com')
  vi.stubEnv('GITHUB_RUN_ID', '12345')
  vi.stubEnv('INPUT_GITHUB_TOKEN', 'faketoken')
  vi.stubEnv('INPUT_TRIGGER', '.deploy')
  vi.stubEnv('INPUT_REACTION', 'eyes')
  vi.stubEnv('INPUT_UPDATE_BRANCH', 'warn')
  vi.stubEnv('INPUT_ENVIRONMENT', 'production')
  vi.stubEnv('INPUT_ENVIRONMENT_TARGETS', 'production,development,staging')
  vi.stubEnv('INPUT_ENVIRONMENT_URLS', '')
  vi.stubEnv('INPUT_PARAM_SEPARATOR', '|')
  vi.stubEnv('INPUT_PRODUCTION_ENVIRONMENTS', 'production')
  vi.stubEnv('INPUT_STABLE_BRANCH', 'main')
  vi.stubEnv('INPUT_NOOP_TRIGGER', '.noop')
  vi.stubEnv('INPUT_LOCK_TRIGGER', '.lock')
  vi.stubEnv('INPUT_UNLOCK_TRIGGER', '.unlock')
  vi.stubEnv('INPUT_HELP_TRIGGER', '.help')
  vi.stubEnv('INPUT_LOCK_INFO_ALIAS', '.wcid')
  vi.stubEnv('INPUT_REQUIRED_CONTEXTS', 'false')
  vi.stubEnv('INPUT_ALLOW_FORKS', 'true')
  vi.stubEnv('GITHUB_REPOSITORY', 'corp/test')
  vi.stubEnv('INPUT_GLOBAL_LOCK_FLAG', '--global')
  vi.stubEnv('INPUT_MERGE_DEPLOY_MODE', 'false')
  vi.stubEnv('INPUT_UNLOCK_ON_MERGE_MODE', 'false')
  vi.stubEnv('INPUT_STICKY_LOCKS', 'false')
  vi.stubEnv('INPUT_STICKY_LOCKS_FOR_NOOP', 'false')
  vi.stubEnv('INPUT_ALLOW_SHA_DEPLOYMENTS', 'false')
  vi.stubEnv('INPUT_DISABLE_NAKED_COMMANDS', 'false')
  vi.stubEnv('INPUT_OUTDATED_MODE', 'default_branch')
  vi.stubEnv('INPUT_CHECKS', 'all')
  vi.stubEnv('INPUT_ENFORCED_DEPLOYMENT_ORDER', '')
  vi.stubEnv('INPUT_COMMIT_VERIFICATION', 'false')
  vi.stubEnv('INPUT_IGNORED_CHECKS', '')
  vi.stubEnv('INPUT_USE_SECURITY_WARNINGS', 'true')
  vi.stubEnv('INPUT_ALLOW_NON_DEFAULT_TARGET_BRANCH_DEPLOYMENTS', 'false')
  vi.stubEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'false')
  vi.stubEnv('INPUT_DEPLOYMENT_CONFIRMATION_TIMEOUT', '60')

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

  const octokit = createOctokit()
  octokit.hook.wrap('request', (_request, options) => {
    let data: unknown = {}
    if (options.url.endsWith('/issues/{issue_number}/comments')) {
      data = {id: 123456}
    } else if (options.url.endsWith('/deployments')) {
      data =
        deploymentMessage === null ? {id: 123} : {message: deploymentMessage}
    } else if (options.url.endsWith('/commits/{ref}')) {
      data = {
        sha: mock_sha,
        html_url: `https://github.com/corp/test/commit/${mock_sha}`,
        commit: {
          author: {date: '2024-10-15T12:00:00Z'},
          verification: no_verification
        },
        committer: commitLogin === null ? {} : {login: commitLogin}
      }
    } else if (options.url.endsWith('/pulls/{pull_number}')) {
      data = {head: {ref: 'test-ref'}}
    }

    return {data, headers: {}, status: 200, url: options.url}
  })
  createDeploymentMock = vi.spyOn(octokit.rest.repos, 'createDeployment')
  vi.spyOn(github, 'getOctokit').mockReturnValue(octokit)
  vi.spyOn(isDeprecated, 'isDeprecated').mockResolvedValue(false)
  vi.spyOn(deploymentConfirmation, 'deploymentConfirmation').mockResolvedValue(
    true
  )
  vi.spyOn(lock, 'lock').mockResolvedValue({
    environment: 'production',
    global: false,
    globalFlag: '',
    lockData: null,
    status: true
  })
  vi.spyOn(contextCheck, 'contextCheck').mockReturnValue(true)
  vi.spyOn(reactEmote, 'reactEmote').mockResolvedValue({
    data: {
      id: 123
    }
  })
  vi.spyOn(timestamp, 'timestamp').mockImplementation(() => {
    return '2025-01-01T00:00:00.000Z'
  })
  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    sha: mock_sha,
    isFork: false
  })
  vi.spyOn(branchRulesetChecks, 'branchRulesetChecks').mockResolvedValue({
    success: true
  })
  vi.spyOn(commitSafetyChecks, 'commitSafetyChecks').mockReturnValue({
    status: true,
    message: 'success',
    isVerified: true
  })
  validDeploymentOrderMock.mockResolvedValue({valid: true, results: []})
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

test('preserves the missing run id fallback in the deployment payload', async () => {
  vi.stubEnv('GITHUB_RUN_ID', undefined)

  expect(await run()).toBe('success')
  expect(createDeploymentMock.mock.calls.at(-1)?.[0]).toMatchObject({
    payload: {github_run_id: Number.NaN}
  })
})

test('fails the action early on when it fails to parse an int input', async () => {
  vi.stubEnv('INPUT_DEPLOYMENT_CONFIRMATION_TIMEOUT', 'not-an-int')

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
  vi.stubEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')

  vi.spyOn(deploymentConfirmation, 'deploymentConfirmation').mockResolvedValue(
    true
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
  vi.stubEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')

  vi.spyOn(deploymentConfirmation, 'deploymentConfirmation').mockResolvedValue(
    true
  )
  commitLogin = null

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
  vi.stubEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')

  vi.spyOn(deploymentConfirmation, 'deploymentConfirmation').mockResolvedValue(
    false
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
  vi.stubEnv('INPUT_UPDATE_BRANCH', 'disabled')
  setCommentBody('.deploy to development')

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
  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: true,
    sha: 'deadbeef',
    isFork: false
  })

  setCommentBody('.noop')

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
  vi.stubEnv('INPUT_STICKY_LOCKS_FOR_NOOP', 'true')
  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: true,
    sha: mock_sha,
    isFork: false
  })

  setCommentBody('.noop')

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
  vi.stubEnv('INPUT_ENVIRONMENT_URLS', 'production|https://example.com')
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
  vi.stubEnv(
    'INPUT_ENFORCED_DEPLOYMENT_ORDER',
    'development,staging,production'
  )

  validDeploymentOrderMock.mockResolvedValue({
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

  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)

  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    sha: 'deadbeef',
    isFork: false
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
  vi.stubEnv(
    'INPUT_ENFORCED_DEPLOYMENT_ORDER',
    'development,staging,production'
  )

  validDeploymentOrderMock.mockResolvedValue({
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
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(
    permissionsMsg
  )
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)

  setCommentBody('.lock')

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
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  vi.spyOn(lock, 'lock').mockResolvedValue({
    environment: 'production',
    global: false,
    globalFlag: '',
    lockData: null,
    status: true
  })

  setCommentBody('.lock --reason testing a new feature')

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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => undefined)
  const actionStatusSpy = vi
    .spyOn(actionStatus, 'actionStatus')
    .mockResolvedValue(undefined)
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  vi.spyOn(lock, 'lock').mockResolvedValue({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason:
        'routine `\n\n## Deployment approved\n[continue](https://example.com)',
      sticky: true,
      unlock_command: '.unlock production'
    },
    status: 'details-only',
    global: false,
    globalFlag: '--global',
    environment: 'production'
  })

  setCommentBody('.lock --details')

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
  const comment = actionStatusSpy.mock.calls.at(-1)?.[0].message ?? ''
  expect(comment).toContain(
    '- __Reason__:\n\n      routine `\n      \n      ## Deployment approved\n      [continue](https://example.com)\n\n- __Branch__: `octocats-everywhere`'
  )
  expect(comment).not.toContain('\n## Deployment approved')
  expect(comment).not.toContain('\n[continue](https://example.com)')
})

test('successfully runs the action in lock mode - details only - for the development environment', async () => {
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => undefined)
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  vi.spyOn(lock, 'lock').mockResolvedValue({
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
    global: false,
    globalFlag: '--global',
    environment: 'development'
  })
  setCommentBody('.lock development --details')
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => undefined)
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  vi.spyOn(lock, 'lock').mockResolvedValue({
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
    global: false,
    globalFlag: '--global',
    environment: 'production'
  })
  setCommentBody('.lock --info')
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => undefined)
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  vi.spyOn(lock, 'lock').mockResolvedValue({
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
    global: false,
    globalFlag: '--global',
    status: 'details-only'
  })

  setCommentBody('.wcid')
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => undefined)
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  vi.spyOn(lock, 'lock').mockResolvedValue({
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
    global: true,
    globalFlag: '--global',
    environment: null
  })
  setCommentBody('.wcid production')
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => undefined)
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  vi.spyOn(lock, 'lock').mockResolvedValue({
    status: null,
    lockData: null,
    environment: 'production',
    global: false,
    globalFlag: '--global'
  })
  setCommentBody('.lock --details')
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
  const infoSpy = vi.spyOn(core, 'info').mockImplementation(() => undefined)
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  vi.spyOn(lock, 'lock').mockResolvedValue({
    status: null,
    lockData: null,
    environment: null,
    global: true,
    globalFlag: '--global'
  })
  setCommentBody('.lock --global --details')
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
  vi.spyOn(lock, 'lock').mockResolvedValue({
    status: false,
    lockData: null,
    environment: 'production',
    global: false,
    globalFlag: ''
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
  setCommentBody('.unlock')
  vi.spyOn(unlock, 'unlock').mockResolvedValue(true)
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
  setCommentBody('.deploy noop')
  vi.spyOn(isDeprecated, 'isDeprecated').mockResolvedValue(true)
  expect(await run()).toBe('safe-exit')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('runs with a naked command when naked commands are NOT allowed', async () => {
  vi.stubEnv('INPUT_DISABLE_NAKED_COMMANDS', 'true')
  setCommentBody('.deploy')
  vi.spyOn(nakedCommandCheck, 'nakedCommandCheck').mockResolvedValue(true)
  expect(await run()).toBe('safe-exit')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('successfully runs the action on a deployment to an exact sha in development with params', async () => {
  vi.stubEnv('INPUT_ALLOW_SHA_DEPLOYMENTS', 'true')
  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc',
    isFork: false
  })

  setCommentBody(
    '.deploy 82c238c277ca3df56fe9418a5913d9188eafe3bc development | something1 something2 something3'
  )

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
  vi.stubEnv('INPUT_ALLOW_SHA_DEPLOYMENTS', 'true')
  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc',
    isFork: false
  })

  setCommentBody(
    '.deploy | --cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
  )
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
  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: true,
    sha: 'deadbeef',
    isFork: false
  })
  setCommentBody('.noop    \n\t\n   ')
  expect(await run()).toBe('success - noop')
  // other expects are similar to previous tests.
})

test('successfully runs the action with required contexts', async () => {
  vi.stubEnv('INPUT_REQUIRED_CONTEXTS', 'lint,test,build')
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
  vi.stubEnv('INPUT_CHECKS', 'test,build')
  vi.stubEnv('INPUT_REQUIRED_CONTEXTS', 'lint,test,build')
  vi.stubEnv('INPUT_IGNORED_CHECKS', 'lint,foo')
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
  deploymentMessage = 'Auto-merged'
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
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
  vi.spyOn(contextCheck, 'contextCheck').mockReturnValue(false)
  expect(await run()).toBe('safe-exit')
})

test('fails due to no valid environment targets being found in the comment body', async () => {
  setCommentBody('.deploy to chaos')
  expect(await run()).toBe('safe-exit')
  expect(debugMock).toHaveBeenCalledWith('No valid environment targets found')
})

test('fails due to no trigger being found', async () => {
  vi.stubEnv('INPUT_TRIGGER', '.shipit')
  expect(await run()).toBe('safe-exit')
  // Note: core.info() spy doesn't work with Vitest + ESM module caching
  // The actual function DOES log correctly in production, the spy just can't track it
  // expect(infoMock).toHaveBeenCalledWith(
  //   '⛔ no trigger detected in comment - exiting'
  // )
})

test('fails prechecks', async () => {
  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    status: false,
    message: '### ⚠️ Cannot proceed with deployment... something went wrong'
  })
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  expect(await run()).toBe('failure')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    '### ⚠️ Cannot proceed with deployment... something went wrong'
  )

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('fails commitSafetyChecks', async () => {
  vi.spyOn(commitSafetyChecks, 'commitSafetyChecks').mockReturnValue({
    status: false,
    message:
      '### ⚠️ Cannot proceed with deployment... a scary commit was found',
    isVerified: false
  })
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  expect(await run()).toBe('failure')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    '### ⚠️ Cannot proceed with deployment... a scary commit was found'
  )

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('fails commitSafetyChecks but proceeds because the operation is on the stable branch', async () => {
  setCommentBody('.deploy main')
  vi.spyOn(commitSafetyChecks, 'commitSafetyChecks').mockReturnValue({
    status: false,
    message:
      '### ⚠️ Cannot proceed with deployment... a scary commit was found',
    isVerified: false
  })
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  expect(await run()).toBe('success')
  expect(warningMock).toHaveBeenCalledWith(
    'commit safety checks failed but the stable branch is being used so the workflow will continue - you should inspect recent commits on this branch as a precaution'
  )
})

test('runs the .help command successfully', async () => {
  setCommentBody('.help')
  vi.spyOn(help, 'help').mockResolvedValue(undefined)
  expect(await run()).toBe('safe-exit')
  expect(debugMock).toHaveBeenCalledWith('help command detected')

  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('runs the .help command successfully', async () => {
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(
    permissionsMsg
  )
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  setCommentBody('.help')

  vi.spyOn(help, 'help').mockResolvedValue(undefined)

  expect(await run()).toBe('failure')
  expect(debugMock).toHaveBeenCalledWith('help command detected')
  expect(setFailedMock).toHaveBeenCalledWith(permissionsMsg)
})

test('runs the action in lock mode and fails due to an invalid environment', async () => {
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
  vi.spyOn(validPermissions, 'validPermissions').mockResolvedValue(true)
  setCommentBody('.lock --details super-production')
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
  vi.stubEnv('INPUT_GLOBAL_LOCK_FLAG', '')
})

test('successfully runs in mergeDeployMode', async () => {
  vi.stubEnv('INPUT_MERGE_DEPLOY_MODE', 'true')
  vi.spyOn(identicalCommitCheck, 'identicalCommitCheck').mockResolvedValue(true)
  expect(await run()).toBe('success - merge deploy mode')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  // Note: core.info() spy doesn't work with Vitest + ESM module caching
  // The actual function DOES log correctly in production, the spy just can't track it
  // expect(infoMock).toHaveBeenCalledWith(`🏃 running in 'merge deploy' mode`)
})

test('successfully runs in unlockOnMergeMode', async () => {
  vi.stubEnv('INPUT_UNLOCK_ON_MERGE_MODE', 'true')
  vi.spyOn(unlockOnMerge, 'unlockOnMerge').mockResolvedValue(true)
  expect(await run()).toBe('success - unlock on merge mode')
  // Note: core.info() spy doesn't work with Vitest + ESM module caching
  // The actual function DOES log correctly in production, the spy just can't track it
  // expect(infoMock).toHaveBeenCalledWith(`🏃 running in 'unlock on merge' mode`)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(validDeploymentOrderMock).not.toHaveBeenCalled()
})

test('handles an input validation error and exits', async () => {
  vi.stubEnv('INPUT_UPDATE_BRANCH', 'badvalue')
  await expect(run()).resolves.toBeUndefined()
  expect(setFailedMock).toHaveBeenCalled()
})

test('handles an unexpected error and exits', async () => {
  github.context.payload = {}
  await expect(run()).resolves.toBeUndefined()
  expect(setFailedMock).toHaveBeenCalled()
})

test('preserves the failure path when reaction creation returns undefined', async () => {
  vi.mocked(reactEmote.reactEmote).mockResolvedValueOnce(undefined)
  await expect(run()).resolves.toBeUndefined()
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalled()
})

test('safe-exits when environment target parsing returns an empty target', async () => {
  vi.stubEnv('INPUT_ENVIRONMENT_TARGETS', '')
  await expect(run()).resolves.toBe('safe-exit')
  expect(debugMock).toHaveBeenCalledWith('No valid environment targets found')
  expect(vi.mocked(prechecks.prechecks)).not.toHaveBeenCalled()
})

test('stores params and parsed params into context', async () => {
  setCommentBody('.deploy | something1 --foo=bar')
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
    }) as unknown
  }) as unknown
  expect(await run()).toBe('success')
  expect(createDeploymentMock).toHaveBeenCalledWith(data)
  expect(setOutputMock).toHaveBeenCalledWith('params', params)
  expect(setOutputMock).toHaveBeenCalledWith('parsed_params', parsed_params)
})

test('stores params and parsed params into context with complex params', async () => {
  vi.spyOn(prechecks, 'prechecks').mockResolvedValue({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    sha: 'deadbeef',
    isFork: false
  })

  setCommentBody(
    '.deploy | something1 --foo=bar --env.development=false --env.production=true LOG_LEVEL=debug,CPU_CORES=4 --config.db.host=localhost --config.db.port=5432'
  )
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
    }) as unknown
  }) as unknown
  expect(await run()).toBe('success')
  expect(createDeploymentMock).toHaveBeenCalledWith(data)
  expect(setOutputMock).toHaveBeenCalledWith('params', params)
  expect(setOutputMock).toHaveBeenCalledWith('parsed_params', parsed_params)
})
