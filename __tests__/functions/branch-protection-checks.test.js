import {branchProtectionChecks} from '../../src/functions/branch-protection-checks'
import * as core from '@actions/core'
import {COLORS} from '../../src/functions/colors'

var context
var octokit
var data

// const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const warningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})
const infoMock = jest.spyOn(core, 'info').mockImplementation(() => {})

beforeEach(() => {
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.clearAllMocks()

  data = {
    branch: 'main'
  }

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    }
  }

  octokit = {
    rest: {
      repos: {
        getBranchRules: jest.fn().mockReturnValueOnce({data: []})
      }
    }
  }
})

test('finds that no branch protections or rulesets are defined', async () => {
  expect(await branchProtectionChecks(context, octokit, data)).toStrictEqual({
    success: false,
    failed_checks: ['missing_branch_rulesets']
  })
  expect(warningMock).toHaveBeenCalledWith(
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} are not defined for branch ${COLORS.highlight}${data.branch}${COLORS.reset}`
  )
})

test('exits early if the user has disabled security warnings', async () => {
  data.use_security_warnings = false
  expect(await branchProtectionChecks(context, octokit, data)).toStrictEqual({
    success: true
  })
  expect(warningMock).not.toHaveBeenCalled()
  expect(infoMock).not.toHaveBeenCalledWith(
    `🔐 branch ruleset checks ${COLORS.success}passed${COLORS.reset}`
  )
})
