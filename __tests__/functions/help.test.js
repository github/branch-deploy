import * as core from '@actions/core'
import {help} from '../../src/functions/help'
import * as actionStatus from '../../src/functions/action-status'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    },
    payload: {
        pull_request: {
            head: {
                ref: 'test'
            }
        }
    }
  }
const octokit = {}

const defaultInputs = {
    trigger: ".deploy",
    reaction: "eyes",
    prefixOnly: "true",
    environment: "production",
    stable_branch: "main",
    noop_trigger: "noop",
    lock_trigger: ".lock",
    production_environment: "production",
    environment_targets: "production,staging,development",
    unlock_trigger: ".unlock",
    help_trigger: ".help",
    lock_info_alias: ".wcid",
    update_branch: "warn",
    required_contexts: "",
    allowForks: "true",
    skipCi: "",
    skipReviews: "",
    admins: "false"
  }

beforeEach(() => {
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

test('successfully calls help', async () => {
  expect(await help(octokit, context, 123, defaultInputs))
  expect(debugMock).toHaveBeenCalledWith('help')
})
