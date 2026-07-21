import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import * as github from '@actions/github'
import type {ActionInputKey, ActionStateKey} from '../../src/action-io.ts'
import {COLORS} from '../../src/functions/colors.ts'
import {createOctokit} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type ActionIo = typeof import('../../src/action-io.ts')
type ContextCheck = typeof import('../../src/functions/context-check.ts')
type PostDeploy = typeof import('../../src/functions/post-deploy.ts')

const errorMock = createMock<ActionsCore['error']>()
const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const setFailedMock = createMock<ActionsCore['setFailed']>()
const warningMock = createMock<ActionsCore['warning']>()
const getActionInputMock = createMock<ActionIo['getActionInput']>()
const getActionStateMock = createMock<ActionIo['getActionState']>()
const getBooleanActionInputMock =
  createMock<ActionIo['getBooleanActionInput']>()
const contextCheckMock = createMock<ContextCheck['contextCheck']>()
const postDeployMock = createMock<PostDeploy['postDeploy']>()
const getOctokitMock = createMock<typeof github.getOctokit>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  error: errorMock,
  info: infoMock,
  setFailed: setFailedMock,
  warning: warningMock
})
installModuleMock(mock, new URL('../../src/action-io.ts', import.meta.url), {
  getActionInput: getActionInputMock,
  getActionState: getActionStateMock,
  getBooleanActionInput: getBooleanActionInputMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/context-check.ts', import.meta.url),
  {contextCheck: contextCheckMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/post-deploy.ts', import.meta.url),
  {postDeploy: postDeployMock}
)
installModuleMock(mock, '@actions/github', {
  context: github.context,
  getOctokit: getOctokitMock
})

const {post} = await import('../../src/functions/post.ts')

const validBooleanInputs: Partial<Record<ActionInputKey, boolean>> = {
  skip_completing: false
}
const validInputs: Partial<Record<ActionInputKey, string>> = {
  status: 'success',
  successful_deploy_labels: '',
  successful_noop_labels: '',
  failed_deploy_labels: '',
  failed_noop_labels: '',
  skip_successful_noop_labels_if_approved: 'false',
  skip_successful_deploy_labels_if_approved: 'false'
}

const validStates: Record<ActionStateKey, string> = {
  actionsToken: 'test-token',
  bypass: 'false',
  sha: 'abc123',
  ref: 'test-ref',
  comment_id: '123',
  reaction_id: '12345',
  noop: 'false',
  deployment_id: '456',
  environment: 'production',
  approved_reviews_count: '1',
  environment_url: 'https://example.com',
  review_decision: 'APPROVED',
  fork: 'false',
  commit_verified: 'false',
  initial_comment_id: '123',
  isPost: 'true',
  lock_ref_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  trusted_sha: '0123456789abcdef0123456789abcdef01234567',
  params: 'LOG_LEVEL=debug --config.db.host=localhost --config.db.port=5432',
  parsed_params: JSON.stringify({
    config: {db: {host: 'localhost', port: 5432}},
    _: ['LOG_LEVEL=debug']
  }),
  deployment_start_time: '2024-01-01T00:00:00Z',
  disable_lock: 'false'
}

beforeEach(() => {
  for (const mockFunction of [
    errorMock,
    debugMock,
    infoMock,
    setFailedMock,
    warningMock,
    getActionInputMock,
    getActionStateMock,
    getBooleanActionInputMock,
    contextCheckMock,
    postDeployMock,
    getOctokitMock
  ]) {
    mockFunction.mock.resetCalls()
  }

  getBooleanActionInputMock.mock.mockImplementation(
    name => validBooleanInputs[name] ?? false
  )
  getActionInputMock.mock.mockImplementation(name => validInputs[name] ?? '')
  getActionStateMock.mock.mockImplementation(name => validStates[name])
  postDeployMock.mock.mockImplementation(() => Promise.resolve(undefined))
  contextCheckMock.mock.mockImplementation(() => true)
  getOctokitMock.mock.mockImplementation(() => createOctokit())
})

test('successfully runs post() Action logic', async () => {
  assert.strictEqual(await post(), undefined)
  assertCalledWith(
    infoMock,
    `🧑‍🚀 commit SHA: ${COLORS.highlight}${validStates.sha}${COLORS.reset}`
  )
  assert.strictEqual(
    postDeployMock.mock.calls.at(-1)?.arguments[2].disable_lock,
    false
  )
})

test('passes the saved disable_lock state to post deployment', async () => {
  getActionStateMock.mock.mockImplementation(name =>
    name === 'disable_lock' ? 'true' : validStates[name]
  )

  assert.strictEqual(await post(), undefined)
  assert.strictEqual(
    postDeployMock.mock.calls.at(-1)?.arguments[2].disable_lock,
    true
  )
})

test('passes the saved lock ref SHA to post deployment', async () => {
  assert.strictEqual(await post(), undefined)
  assert.strictEqual(
    postDeployMock.mock.calls.at(-1)?.arguments[2].lock_ref_sha,
    validStates.lock_ref_sha
  )
})

test('successfully runs post() Action logic when environment_url is not defined', async () => {
  getActionStateMock.mock.mockImplementation(name =>
    name === 'environment_url'
      ? unsafeInvalidValue<string>(null)
      : validStates[name]
  )

  assert.strictEqual(await post(), undefined)
  assertCalledWith(debugMock, 'environment_url not set, its value is null')
})

test('exits due to an invalid Actions context', async () => {
  contextCheckMock.mock.mockImplementation(() => false)

  assert.strictEqual(await post(), undefined)
})

test('exits due to a bypass being set', async () => {
  const bypassed: Partial<Record<ActionStateKey, string>> = {
    bypass: 'true'
  }
  getActionStateMock.mock.mockImplementation(
    name => bypassed[name] ?? validStates[name]
  )

  assert.strictEqual(await post(), undefined)
  assertCalledWith(
    warningMock,
    `⛔ ${COLORS.highlight}bypass${COLORS.reset} set, exiting`
  )
})

test('skips the process of completing a deployment', async () => {
  const skipped: Partial<Record<ActionInputKey, boolean>> = {
    skip_completing: true
  }
  getBooleanActionInputMock.mock.mockImplementation(
    name => skipped[name] ?? validBooleanInputs[name] ?? false
  )

  assert.strictEqual(await post(), undefined)
  assertCalledWith(
    infoMock,
    `⏩ ${COLORS.highlight}skip_completing${COLORS.reset} set, exiting`
  )
})

test('reports an error', async () => {
  getOctokitMock.mock.mockImplementation(() => {
    throw new Error('test error')
  })

  assert.strictEqual(await post(), undefined)
  assertCalledWith(setFailedMock, 'test error')
})
