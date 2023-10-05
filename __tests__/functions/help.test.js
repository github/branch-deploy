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
  required_contexts: 'false',
  allowForks: 'true',
  skipCi: '',
  skipReviews: '',
  draft_permitted_targets: '',
  admins: 'false',
  permissions: ['write', 'admin', 'maintain'],
  allow_sha_deployments: false
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
    required_contexts: 'cat',
    allowForks: 'false',
    skipCi: 'development',
    skipReviews: 'development',
    draft_permitted_targets: 'development',
    admins: 'monalisa',
    permissions: ['write', 'admin', 'maintain'],
    allow_sha_deployments: true
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
    required_contexts: 'cat',
    allowForks: 'false',
    skipCi: 'development',
    skipReviews: 'development',
    draft_permitted_targets: 'development',
    admins: 'monalisa',
    permissions: ['write', 'admin', 'maintain'],
    allow_sha_deployments: false
  }

  expect(await help(octokit, context, 123, inputs))

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )

  var inputsSecond = inputs
  inputsSecond.update_branch = 'disabled'
  expect(await help(octokit, context, 123, inputsSecond))

  expect(debugMock).toHaveBeenCalledWith(
    expect.stringMatching(/## 📚 Branch Deployment Help/)
  )
})
