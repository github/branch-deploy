import * as core from '@actions/core'
import {vi, expect, test, beforeEach} from 'vitest'
import {help} from '../../src/functions/help.ts'
import * as actionStatus from '../../src/functions/action-status.ts'
import {
  createActionInputs,
  createIssueCommentContext,
  createOctokit
} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

const debugMock = vi.spyOn(core, 'debug')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
})

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
  await expect(
    help(octokit, context, 123, defaultInputs)
  ).resolves.toBeUndefined()

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )
  expect(debugMock).toHaveBeenCalledWith(
    expect.stringContaining(
      '`allowForks: true` - This Action will not run on forked repositories'
    )
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

  await expect(help(octokit, context, 123, inputs)).resolves.toBeUndefined()

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )
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

  await expect(help(octokit, context, 123, inputs)).resolves.toBeUndefined()

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/a specific deployment order by environment/)
  )

  const inputsSecond = {...inputs, update_branch: 'disabled'} as const
  await expect(
    help(octokit, context, 123, inputsSecond)
  ).resolves.toBeUndefined()

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )
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

  await expect(help(octokit, context, 123, inputs)).resolves.toBeUndefined()

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(
      /Deployments can be made to any environment in any order/
    )
  )

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/Unknown value for update_branch/)
  )
  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/not use security warnings/)
  )
  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(
      /will allow the deployments of pull requests that target a branch other than the default branch/
    )
  )
})

test('renders a custom string-valued checks input without mutating it', async () => {
  const inputs = createActionInputs({
    checks:
      unsafeInvalidValue<Parameters<typeof help>[3]['checks']>('custom-check')
  })

  await expect(help(octokit, context, 123, inputs)).resolves.toBeUndefined()
  expect(debugMock).toHaveBeenCalledWith(
    expect.stringContaining(
      'The following CI checks must pass before a deployment can be requested: `custom-check`'
    )
  )
})

test('preserves legacy rendering for the string-valued allowForks input', async () => {
  const inputs = createActionInputs({
    allowForks: unsafeInvalidValue<boolean>('true')
  })

  await expect(help(octokit, context, 123, inputs)).resolves.toBeUndefined()
  expect(debugMock).toHaveBeenCalledWith(
    expect.stringContaining(
      '`allowForks: true` - This Action will run on forked repositories'
    )
  )
})
