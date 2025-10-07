import * as core from '@actions/core'
import {vi, expect, test, beforeEach} from 'vitest'
import {help} from '../../src/functions/help.js'

const debugMock = vi.spyOn(core, 'debug')

beforeEach(() => {
  vi.clearAllMocks()
})

const context = {
  repo: {
    owner: 'corp',
    repo: 'test'
  },
  issue: {
    number: 1
  },
  payload: {
    comment: {
      id: 123
    }
  }
}
const octokit = {
  rest: {
    issues: {
      createComment: vi.fn().mockReturnValue({
        data: {}
      })
    },
    reactions: {
      deleteForIssueComment: vi.fn().mockReturnValue({
        data: {}
      }),
      createForIssueComment: vi.fn().mockReturnValue({
        data: {}
      })
    }
  }
}

const defaultInputs = {
  trigger: '.deploy',
  reaction: 'eyes',
  environment: 'production',
  stable_branch: 'main',
  noop_trigger: '.noop',
  lock_trigger: '.lock',
  production_environments: 'production',
  environment_targets: 'production,staging,development',
  unlock_trigger: '.unlock',
  help_trigger: '.help',
  lock_info_alias: '.wcid',
  global_lock_flag: '--global',
  update_branch: 'warn',
  outdated_mode: 'strict',
  required_contexts: 'false',
  allowForks: 'true',
  skipCi: '',
  skipReviews: '',
  draft_permitted_targets: '',
  admins: 'false',
  permissions: ['write', 'admin'],
  allow_sha_deployments: false,
  checks: 'all',
  commit_verification: true,
  ignored_checks: [],
  enforced_deployment_order: [],
  use_security_warnings: true,
  allow_non_default_target_branch_deployments: false,
  deployment_confirmation: false,
  deployment_confirmation_timeout: 60
}

test('successfully calls help with defaults', async () => {
  expect(await help(octokit, context, 123, defaultInputs))

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )
})

test('successfully calls help with non-defaults', async () => {
  const inputs = {
    trigger: '.deploy',
    reaction: 'eyes',
    environment: 'production',
    stable_branch: 'main',
    noop_trigger: '.noop',
    lock_trigger: '.lock',
    production_environments: 'production',
    environment_targets: 'production,staging,development',
    unlock_trigger: '.unlock',
    help_trigger: '.help',
    lock_info_alias: '.wcid',
    global_lock_flag: '--global',
    update_branch: 'force',
    outdated_mode: 'pr_base',
    required_contexts: 'cat',
    allowForks: 'false',
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
  }

  expect(await help(octokit, context, 123, inputs))

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )
})

test('successfully calls help with non-defaults again', async () => {
  const inputs = {
    trigger: '.deploy',
    reaction: 'eyes',
    environment: 'production',
    stable_branch: 'main',
    noop_trigger: '.noop',
    lock_trigger: '.lock',
    production_environments: 'production,production-eu,production-ap',
    environment_targets: 'production,staging,development',
    unlock_trigger: '.unlock',
    help_trigger: '.help',
    lock_info_alias: '.wcid',
    global_lock_flag: '--global',
    update_branch: 'force',
    outdated_mode: 'default_branch',
    required_contexts: 'cat',
    allowForks: 'false',
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
  }

  expect(await help(octokit, context, 123, inputs))

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/a specific deployment order by environment/)
  )

  var inputsSecond = inputs
  inputsSecond.update_branch = 'disabled'
  expect(await help(octokit, context, 123, inputsSecond))

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )
})

test('successfully calls help with non-defaults and unknown update_branch setting', async () => {
  const inputs = {
    trigger: '.deploy',
    reaction: 'eyes',
    environment: 'production',
    stable_branch: 'main',
    noop_trigger: '.noop',
    lock_trigger: '.lock',
    production_environments: 'production,production-eu,production-ap',
    environment_targets: 'production,staging,development',
    unlock_trigger: '.unlock',
    help_trigger: '.help',
    lock_info_alias: '.wcid',
    global_lock_flag: '--global',
    update_branch: 'bugzzz',
    outdated_mode: 'default_branch',
    required_contexts: 'cat',
    allowForks: 'false',
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
  }

  expect(await help(octokit, context, 123, inputs))

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
