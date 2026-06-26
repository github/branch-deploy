import {branchRulesetChecks} from '../../src/functions/branch-ruleset-checks.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import * as core from '@actions/core'
import {COLORS} from '../../src/functions/colors.ts'
import {ERROR} from '../../src/functions/templates/error.ts'
import type {BranchRule} from '../../src/types.ts'
import {createContext} from '../test-helpers.ts'

const debugMock = vi.spyOn(core, 'debug')
const infoMock = vi.spyOn(core, 'info')
const warningMock = vi.spyOn(core, 'warning')

let context: Parameters<typeof branchRulesetChecks>[0]
let octokit: Parameters<typeof branchRulesetChecks>[1]
let data: Parameters<typeof branchRulesetChecks>[2]
let rulesets: BranchRule[]
const getBranchRulesMock =
  vi.fn<
    Parameters<typeof branchRulesetChecks>[1]['rest']['repos']['getBranchRules']
  >()
type PullRequestRule = Extract<BranchRule, {type: 'pull_request'}>

class ForbiddenError extends Error {
  declare status: number

  constructor(message: string) {
    super(message)
    this.status = 403
  }
}

function pullRequestRule(
  overrides: Partial<PullRequestRule['parameters']> = {}
): PullRequestRule {
  return {
    type: 'pull_request',
    parameters: {
      required_approving_review_count: 1,
      dismiss_stale_reviews_on_push: true,
      require_code_owner_review: true,
      require_last_push_approval: false,
      required_review_thread_resolution: false,
      allowed_merge_methods: ['merge', 'squash', 'rebase'],
      ...overrides
    }
  }
}

function validRulesets(): BranchRule[] {
  return [
    {type: 'deletion'},
    {type: 'non_fast_forward'},
    pullRequestRule(),
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        do_not_enforce_on_create: false,
        required_status_checks: []
      }
    },
    {
      type: 'required_deployments',
      parameters: {required_deployment_environments: []}
    }
  ]
}

beforeEach(() => {
  vi.clearAllMocks()

  data = {
    branch: 'main'
  }

  rulesets = validRulesets()

  context = createContext({
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    }
  })

  getBranchRulesMock.mockResolvedValue({data: rulesets})
  octokit = {
    rest: {
      repos: {
        getBranchRules: getBranchRulesMock
      }
    }
  }
})

test('finds that no branch protections or rulesets are defined', async () => {
  getBranchRulesMock.mockResolvedValue({data: []})
  expect(await branchRulesetChecks(context, octokit, data)).toStrictEqual({
    success: false,
    failed_checks: ['missing_branch_rulesets']
  })
  expect(warningMock).toHaveBeenCalledWith(
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} are not defined for branch ${COLORS.highlight}${data.branch}${COLORS.reset}`
  )
})

test('exits early if the user has disabled security warnings', async () => {
  data = {...data, use_security_warnings: false}
  expect(await branchRulesetChecks(context, octokit, data)).toStrictEqual({
    success: true
  })
  expect(warningMock).not.toHaveBeenCalled()
  expect(infoMock).not.toHaveBeenCalledWith(
    `🔐 branch ruleset checks ${COLORS.success}passed${COLORS.reset}`
  )
})

test('finds that the branch ruleset is missing the deletion rule', async () => {
  rulesets = rulesets.filter(rule => rule.type !== 'deletion')

  getBranchRulesMock.mockResolvedValue({data: rulesets})

  expect(await branchRulesetChecks(context, octokit, data)).toStrictEqual({
    success: false,
    failed_checks: ['missing_deletion']
  })
  expect(warningMock).toHaveBeenCalledWith(
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${data.branch}${COLORS.reset} is missing a rule of type ${COLORS.highlight}deletion${COLORS.reset}`
  )
})

test('finds that the branch ruleset is missing the dismiss_stale_reviews_on_push parameter on the pull_request rule', async () => {
  rulesets = rulesets.map((rule): BranchRule => {
    if (rule.type === 'pull_request') {
      return pullRequestRule({dismiss_stale_reviews_on_push: false})
    }
    return rule
  })

  getBranchRulesMock.mockResolvedValue({data: rulesets})

  expect(await branchRulesetChecks(context, octokit, data)).toStrictEqual({
    success: false,
    failed_checks: ['mismatch_pull_request_dismiss_stale_reviews_on_push']
  })
  expect(warningMock).toHaveBeenCalledWith(
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${data.branch}${COLORS.reset} contains a rule of type ${COLORS.highlight}pull_request${COLORS.reset} with a parameter ${COLORS.highlight}dismiss_stale_reviews_on_push${COLORS.reset} which does not match the suggested parameter`
  )
})

test('finds that all suggested branch rulesets are defined', async () => {
  rulesets = validRulesets()
  getBranchRulesMock.mockResolvedValue({data: rulesets})

  expect(await branchRulesetChecks(context, octokit, data)).toStrictEqual({
    success: true,
    failed_checks: []
  })
  expect(warningMock).not.toHaveBeenCalled()
  expect(infoMock).toHaveBeenCalledWith(
    `🔐 branch ruleset checks ${COLORS.success}passed${COLORS.reset}`
  )
})

test('finds that all suggested branch rulesets are defined but required reviews is set to 0', async () => {
  rulesets = validRulesets()

  rulesets = rulesets.map((rule): BranchRule => {
    if (rule.type === 'pull_request') {
      return pullRequestRule({required_approving_review_count: 0})
    }
    return rule
  })

  getBranchRulesMock.mockResolvedValue({data: rulesets})

  expect(await branchRulesetChecks(context, octokit, data)).toStrictEqual({
    success: false,
    failed_checks: ['mismatch_pull_request_required_approving_review_count']
  })
  expect(warningMock).toHaveBeenCalledWith(
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${data.branch}${COLORS.reset} contains the required_approving_review_count parameter but it is set to 0`
  )
})

test('should still pass even with many required reviewers', async () => {
  rulesets = validRulesets()

  rulesets = rulesets.map((rule): BranchRule => {
    if (rule.type === 'pull_request') {
      return pullRequestRule({required_approving_review_count: 4})
    }
    return rule
  })

  getBranchRulesMock.mockResolvedValue({data: rulesets})

  expect(await branchRulesetChecks(context, octokit, data)).toStrictEqual({
    success: true,
    failed_checks: []
  })
  expect(warningMock).not.toHaveBeenCalled()
  expect(debugMock).toHaveBeenCalledWith(
    `required_approving_review_count is 4 - OK`
  )
})

test('fails due to a 403 from the GitHub API due to a repository being private on the free tier without access to repo rulesets', async () => {
  getBranchRulesMock.mockRejectedValueOnce(
    new ForbiddenError(ERROR.messages.upgrade_or_public.message)
  )
  expect(await branchRulesetChecks(context, octokit, data)).toStrictEqual({
    success: false,
    failed_checks: ['upgrade_or_public_required']
  })
  expect(debugMock).toHaveBeenCalledWith(
    ERROR.messages.upgrade_or_public.help_text
  )
})

test('fails due to an unknown 403 from the GitHub API', async () => {
  const errorMessage = 'oh no, something went wrong - forbidden'
  getBranchRulesMock.mockRejectedValueOnce(new ForbiddenError(errorMessage))

  await expect(branchRulesetChecks(context, octokit, data)).rejects.toThrow(
    errorMessage
  )
})
