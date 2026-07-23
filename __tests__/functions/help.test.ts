import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {
  createActionInputs,
  createIssueCommentContext,
  createOctokit
} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'
import {createMock, installModuleMock} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type ActionStatus = typeof import('../../src/functions/action-status.ts')

const debugMock = createMock<ActionsCore['debug']>()
const actionStatusMock = createMock<ActionStatus['actionStatus']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/action-status.ts', import.meta.url),
  {actionStatus: actionStatusMock}
)

const {help} = await import('../../src/functions/help.ts')

beforeEach(() => {
  debugMock.mock.resetCalls()
  actionStatusMock.mock.resetCalls()
  actionStatusMock.mock.mockImplementation(() => Promise.resolve(undefined))
})

function assertDebugMatches(pattern: RegExp): void {
  assert.ok(
    debugMock.mock.calls.some(call => pattern.test(call.arguments[0])),
    `expected a debug call matching ${pattern.source}`
  )
}

function assertDebugIncludes(expected: string): void {
  assert.ok(
    debugMock.mock.calls.some(call => call.arguments[0].includes(expected)),
    `expected a debug call containing ${expected}`
  )
}

const context = createIssueCommentContext({
  repo: {
    owner: 'corp',
    repo: 'test'
  },
  issue: {
    number: 1
  },
  payload: {
    comment: {id: 123}
  }
})
const octokit = createOctokit()

const defaultInputs = createActionInputs({
  commit_verification: true,
  outdated_mode: 'strict'
})

test('successfully calls help with defaults', async () => {
  assert.strictEqual(
    await help(octokit, context, 123, defaultInputs),
    undefined
  )

  assertDebugMatches(/## 📚 Branch Deployment Help/)
  assertDebugIncludes(
    '`allowForks: false` - This Action will not run on forked repositories'
  )
  assertDebugIncludes(
    '`disable_lock: false` - This Action will use deployment locks'
  )
})

test('explains disabled locking in help output', async () => {
  const inputs = createActionInputs({disable_lock: true})

  assert.strictEqual(await help(octokit, context, 123, inputs), undefined)
  assertDebugIncludes(
    '> Deployment locking is disabled. Lock-related commands only report that no lock state is changed.'
  )
  assertDebugIncludes(
    '`disable_lock: true` - This Action will skip deployment lock acquisition and completion'
  )
})

test('successfully calls help with non-defaults', async () => {
  const inputs = createActionInputs({
    trigger: '.deploy',
    reaction: 'eyes',
    environment: 'production',
    stable_branch: 'main',
    noop_trigger: '.noop',
    lock_trigger: '.lock',
    production_environments: ['production'],
    environment_targets: 'production,staging,development',
    unlock_trigger: '.unlock',
    help_trigger: '.help',
    lock_info_alias: '.wcid',
    global_lock_flag: '--global',
    update_branch: 'force',
    outdated_mode: 'pr_base',
    required_contexts: 'cat',
    allowForks: false,
    skipCi: 'development',
    skipReviews: 'development',
    draft_permitted_targets: 'development',
    admins: 'monalisa',
    permissions: ['write', 'admin'],
    allow_sha_deployments: true,
    checks: ['test,build,security'],
    ignored_checks: ['lint', 'format'],
    commit_verification: false,
    enforced_deployment_order: [],
    use_security_warnings: false,
    allow_non_default_target_branch_deployments: false,
    deployment_confirmation: true
  })

  assert.strictEqual(await help(octokit, context, 123, inputs), undefined)

  assertDebugMatches(/## 📚 Branch Deployment Help/)
})

test('successfully calls help with non-defaults again', async () => {
  const inputs = createActionInputs({
    trigger: '.deploy',
    reaction: 'eyes',
    environment: 'production',
    stable_branch: 'main',
    noop_trigger: '.noop',
    lock_trigger: '.lock',
    production_environments: ['production', 'production-eu', 'production-ap'],
    environment_targets: 'production,staging,development',
    unlock_trigger: '.unlock',
    help_trigger: '.help',
    lock_info_alias: '.wcid',
    global_lock_flag: '--global',
    update_branch: 'force',
    outdated_mode: 'default_branch',
    required_contexts: 'cat',
    allowForks: false,
    skipCi: 'development',
    skipReviews: 'development',
    draft_permitted_targets: 'development',
    admins: 'monalisa',
    permissions: ['write', 'admin'],
    allow_sha_deployments: false,
    checks: 'required',
    ignored_checks: ['lint'],
    commit_verification: false,
    enforced_deployment_order: ['development', 'staging', 'production'],
    use_security_warnings: false,
    allow_non_default_target_branch_deployments: false
  })

  assert.strictEqual(await help(octokit, context, 123, inputs), undefined)

  assertDebugMatches(/## 📚 Branch Deployment Help/)

  assertDebugMatches(/a specific deployment order by environment/)

  const inputsSecond = {...inputs, update_branch: 'disabled'} as const
  assert.strictEqual(await help(octokit, context, 123, inputsSecond), undefined)

  assertDebugMatches(/## 📚 Branch Deployment Help/)
})

test('successfully calls help with non-defaults and unknown update_branch setting', async () => {
  const inputs = createActionInputs({
    trigger: '.deploy',
    reaction: 'eyes',
    environment: 'production',
    stable_branch: 'main',
    noop_trigger: '.noop',
    lock_trigger: '.lock',
    production_environments: ['production', 'production-eu', 'production-ap'],
    environment_targets: 'production,staging,development',
    unlock_trigger: '.unlock',
    help_trigger: '.help',
    lock_info_alias: '.wcid',
    global_lock_flag: '--global',
    update_branch:
      unsafeInvalidValue<Parameters<typeof help>[3]['update_branch']>('bugzzz'),
    outdated_mode: 'default_branch',
    required_contexts: 'cat',
    allowForks: false,
    skipCi: 'development',
    skipReviews: 'development',
    draft_permitted_targets: 'development',
    admins: 'monalisa',
    permissions: ['write', 'admin'],
    allow_sha_deployments: false,
    checks: 'required',
    ignored_checks: ['lint'],
    enforced_deployment_order: [],
    use_security_warnings: false,
    allow_non_default_target_branch_deployments: true
  })

  assert.strictEqual(await help(octokit, context, 123, inputs), undefined)

  assertDebugMatches(/## 📚 Branch Deployment Help/)

  assertDebugMatches(/Deployments can be made to any environment in any order/)

  assertDebugMatches(/Unknown value for update_branch/)
  assertDebugMatches(/not use security warnings/)
  assertDebugMatches(
    /will allow the deployments of pull requests that target a branch other than the default branch/
  )
})

test('renders a custom string-valued checks input without mutating it', async () => {
  const inputs = createActionInputs({
    checks:
      unsafeInvalidValue<Parameters<typeof help>[3]['checks']>('custom-check')
  })

  assert.strictEqual(await help(octokit, context, 123, inputs), undefined)
  assertDebugIncludes(
    'The following CI checks must pass before a deployment can be requested: `custom-check`'
  )
})

test('preserves legacy rendering for the string-valued allowForks input', async () => {
  const inputs = createActionInputs({
    allowForks: unsafeInvalidValue<boolean>('true')
  })

  assert.strictEqual(await help(octokit, context, 123, inputs), undefined)
  assertDebugIncludes(
    '`allowForks: true` - This Action will run on forked repositories'
  )
})
