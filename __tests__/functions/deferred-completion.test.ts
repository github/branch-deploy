import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import type {IssueCommentContext} from '../../src/types.ts'
import {createCompletionContext} from '../result-mode-fixtures.ts'
import {
  assertCalledWith,
  assertNotCalled,
  createMock,
  installModuleMock,
  stubEnv
} from '../node-test-helpers.ts'

const actualCore = await import('../../src/actions-core.ts')
const warningMock = createMock<typeof actualCore.warning>()
const setOutputMock = createMock<typeof actualCore.setOutput>()
installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  ...actualCore,
  warning: warningMock,
  setOutput: setOutputMock
})

const {
  completionSettings,
  deferredCompletionMetadata,
  deferredCompletionRequested,
  publishCompletionContext
} = await import('../../src/functions/deferred-completion.ts')
const {MAX_COMPLETION_CONTEXT_BYTES, parseCompletionContext} =
  await import('../../src/functions/result-context.ts')

const context: IssueCommentContext = {
  actor: 'octocat',
  eventName: 'issue_comment',
  repo: {owner: 'octocat', repo: 'example'},
  runId: 1200,
  issue: {number: 7},
  payload: {
    issue: {number: 7, pull_request: {}},
    comment: {
      id: 20,
      body: '.deploy',
      created_at: '2026-01-02T03:04:05.000Z',
      updated_at: '2026-01-02T03:04:05.000Z',
      html_url: 'https://github.com/octocat/example/pull/7#issuecomment-20',
      user: {login: 'octocat'}
    }
  }
}

const request = {
  context,
  trustedSha: '1'.repeat(40),
  lockRefSha: '2'.repeat(40),
  disableLock: false
}

beforeEach(testContext => {
  if (!('after' in testContext)) throw new TypeError('Expected a test context')
  warningMock.mock.resetCalls()
  setOutputMock.mock.resetCalls()
  stubEnv(testContext, 'INPUT_SKIP_COMPLETING', 'true')
  stubEnv(testContext, 'GITHUB_RUN_ATTEMPT', '1')
})

for (const value of ['true', 'True', 'TRUE']) {
  test(`recognizes the existing true spelling ${value}`, testContext => {
    stubEnv(testContext, 'INPUT_SKIP_COMPLETING', value)
    assert.strictEqual(deferredCompletionRequested(), true)
  })
}

for (const value of ['', 'false', 'False', 'FALSE', 'invalid', '1']) {
  test(`leaves non-true skip_completing input ${JSON.stringify(value)} alone`, testContext => {
    stubEnv(testContext, 'INPUT_SKIP_COMPLETING', value)
    assert.strictEqual(deferredCompletionRequested(), false)
    assert.strictEqual(deferredCompletionMetadata(request), null)
    assertNotCalled(warningMock)
  })
}

test('captures only the original operation identity and lock reference', () => {
  assert.deepStrictEqual(deferredCompletionMetadata(request), {
    schema_version: 1,
    repository: 'octocat/example',
    run_id: 1200,
    run_attempt: 1,
    issue_number: 7,
    trigger_comment_id: 20,
    trusted_sha: '1'.repeat(40),
    lock_ref_sha: '2'.repeat(40),
    disable_lock: false
  })
})

test('supports a deferred operation without a lock', () => {
  const metadata = deferredCompletionMetadata({
    ...request,
    lockRefSha: undefined,
    disableLock: true
  })
  assert.strictEqual(metadata?.disable_lock, true)
  assert.strictEqual(metadata.lock_ref_sha, null)
})

for (const value of [undefined, '', '0', '-1', '1.5', 'invalid']) {
  test(`keeps manual completion working when the attempt is ${String(value)}`, testContext => {
    stubEnv(testContext, 'GITHUB_RUN_ATTEMPT', value)
    assert.strictEqual(deferredCompletionMetadata(request), null)
    assertCalledWith(
      warningMock,
      'completion context is unavailable; complete this deployment manually'
    )
  })
}

test('keeps manual completion working without a trusted workflow SHA', () => {
  assert.strictEqual(
    deferredCompletionMetadata({...request, trustedSha: undefined}),
    null
  )
  assertCalledWith(
    warningMock,
    'completion context is unavailable; complete this deployment manually'
  )
})

test('copies completion settings without validating them before the legacy post hook', testContext => {
  const settings = {
    deploy_message_path: 'custom-result.md',
    environment_url_in_comment: 'invalid',
    successful_deploy_labels: 'deployed',
    failed_deploy_labels: 'deploy-failed',
    successful_noop_labels: 'noop-complete',
    failed_noop_labels: 'noop-failed',
    skip_successful_noop_labels_if_approved: 'invalid',
    skip_successful_deploy_labels_if_approved: 'invalid'
  }
  for (const [key, value] of Object.entries(settings)) {
    stubEnv(testContext, `INPUT_${key.toUpperCase()}`, value)
  }
  assert.deepStrictEqual(completionSettings(), settings)
  assertNotCalled(warningMock)
})

test('publishes a ready context that the receiver can validate', () => {
  const ready = createCompletionContext()
  publishCompletionContext(ready)
  const call = setOutputMock.mock.calls.at(-1)
  assert.ok(call !== undefined)
  assert.strictEqual(call.arguments[0], 'context')
  assert.strictEqual(typeof call.arguments[1], 'string')
  assert.deepStrictEqual(
    parseCompletionContext(String(call.arguments[1])),
    ready
  )
  assertNotCalled(warningMock)
})

test('omits oversized context without breaking existing manual completion', () => {
  publishCompletionContext(
    createCompletionContext({params: 'x'.repeat(MAX_COMPLETION_CONTEXT_BYTES)})
  )
  assertNotCalled(setOutputMock)
  assertCalledWith(
    warningMock,
    'completion context is too large; complete this deployment manually'
  )
})
