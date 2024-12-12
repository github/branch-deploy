import {branchProtectionChecks} from '../../src/functions/branch-protection-checks'
import * as core from '@actions/core'
import {COLORS} from '../../src/functions/colors'

var context
var octokit
var data

// const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const infoMock = jest.spyOn(core, 'info').mockImplementation(() => {})

beforeEach(() => {
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
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
        getBranchProtection: jest.fn().mockReturnValueOnce([]),
        getBranchRules: jest.fn().mockReturnValueOnce([])
      }
    }
  }
})

test('finds that no branch protections or rulesets are defined', async () => {
  expect(await branchProtectionChecks(context, octokit, data)).toBeUndefined()
  expect(infoMock).toHaveBeenCalledWith(
    `👀 branch ${COLORS.highlight}protection${COLORS.reset}: []`
  )
})
