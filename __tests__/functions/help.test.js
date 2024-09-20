import * as core from '@actions/core'
import {help} from '../../src/functions/help'
import * as actionStatus from '../../src/functions/action-status'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

const context = {
  repo: {
    owner: 'corp',
    repo: 'test'
  },
  issue: {
    number: 1
  }
}
const octokit = {}

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
  permissions: ['write', 'admin', 'maintain'],
  allow_sha_deployments: false,
  checks: 'all',
  enforced_deployment_order: []
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
    permissions: ['write', 'admin', 'maintain'],
    allow_sha_deployments: true,
    checks: 'all',
    enforced_deployment_order: []
  }

  expect(await help(octokit, context, 123, inputs))

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
    permissions: ['write', 'admin', 'maintain'],
    allow_sha_deployments: false,
    checks: 'required',
    enforced_deployment_order: ['development', 'staging', 'production']
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
    permissions: ['write', 'admin', 'maintain'],
    allow_sha_deployments: false,
    checks: 'required',
    enforced_deployment_order: []
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
})
