import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import {ERROR} from '../../src/functions/templates/error.ts'
import type {BranchRule} from '../../src/types.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  assertNotCalled,
  createMock,
  queueMockImplementation,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type BranchRulesetModule =
  typeof import('../../src/functions/branch-ruleset-checks.ts')

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const warningMock = createMock<ActionsCore['warning']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  info: infoMock,
  warning: warningMock
})

const {branchRulesetChecks} =
  await import('../../src/functions/branch-ruleset-checks.ts')

let context: Parameters<BranchRulesetModule['branchRulesetChecks']>[0]
let octokit: Parameters<BranchRulesetModule['branchRulesetChecks']>[1]
let data: Parameters<BranchRulesetModule['branchRulesetChecks']>[2]
let rulesets: BranchRule[]
const getBranchRulesMock =
  createMock<
    Parameters<
      BranchRulesetModule['branchRulesetChecks']
    >[1]['rest']['repos']['getBranchRules']
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
  debugMock.mock.resetCalls()
  infoMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  getBranchRulesMock.mock.resetCalls()

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

  getBranchRulesMock.mock.mockImplementation(() =>
    Promise.resolve({data: rulesets})
  )
  octokit = {
    rest: {
      repos: {
        getBranchRules: getBranchRulesMock
      }
    }
  }
})

test('finds that no branch protections or rulesets are defined', async () => {
  getBranchRulesMock.mock.mockImplementation(() => Promise.resolve({data: []}))
  assert.deepStrictEqual(await branchRulesetChecks(context, octokit, data), {
    success: false,
    failed_checks: ['missing_branch_rulesets']
  })
  assertCalledWith(
    warningMock,
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} are not defined for branch ${COLORS.highlight}${data.branch}${COLORS.reset}`
  )
})

test('exits early if the user has disabled security warnings', async () => {
  data = {...data, use_security_warnings: false}
  assert.deepStrictEqual(await branchRulesetChecks(context, octokit, data), {
    success: true
  })
  assertNotCalled(warningMock)
  assertNotCalled(infoMock)
})

test('finds that the branch ruleset is missing the deletion rule', async () => {
  rulesets = rulesets.filter(rule => rule.type !== 'deletion')

  assert.deepStrictEqual(await branchRulesetChecks(context, octokit, data), {
    success: false,
    failed_checks: ['missing_deletion']
  })
  assertCalledWith(
    warningMock,
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

  assert.deepStrictEqual(await branchRulesetChecks(context, octokit, data), {
    success: false,
    failed_checks: ['mismatch_pull_request_dismiss_stale_reviews_on_push']
  })
  assertCalledWith(
    warningMock,
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${data.branch}${COLORS.reset} contains a rule of type ${COLORS.highlight}pull_request${COLORS.reset} with a parameter ${COLORS.highlight}dismiss_stale_reviews_on_push${COLORS.reset} which does not match the suggested parameter`
  )
})

test('finds that all suggested branch rulesets are defined', async () => {
  rulesets = validRulesets()

  assert.deepStrictEqual(await branchRulesetChecks(context, octokit, data), {
    success: true,
    failed_checks: []
  })
  assertNotCalled(warningMock)
  assertCalledWith(
    infoMock,
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

  assert.deepStrictEqual(await branchRulesetChecks(context, octokit, data), {
    success: false,
    failed_checks: ['mismatch_pull_request_required_approving_review_count']
  })
  assertCalledWith(
    warningMock,
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

  assert.deepStrictEqual(await branchRulesetChecks(context, octokit, data), {
    success: true,
    failed_checks: []
  })
  assertNotCalled(warningMock)
  assertCalledWith(debugMock, 'required_approving_review_count is 4 - OK')
})

test('fails due to a 403 from the GitHub API due to a repository being private on the free tier without access to repo rulesets', async () => {
  queueMockImplementation(getBranchRulesMock, () =>
    Promise.reject(new ForbiddenError(ERROR.messages.upgrade_or_public.message))
  )
  assert.deepStrictEqual(await branchRulesetChecks(context, octokit, data), {
    success: false,
    failed_checks: ['upgrade_or_public_required']
  })
  assertCalledWith(debugMock, ERROR.messages.upgrade_or_public.help_text)
})

test('fails due to an unknown 403 from the GitHub API', async () => {
  const errorMessage = 'oh no, something went wrong - forbidden'
  queueMockImplementation(getBranchRulesMock, () =>
    Promise.reject(new ForbiddenError(errorMessage))
  )

  await assert.rejects(branchRulesetChecks(context, octokit, data), {
    message: errorMessage
  })
})
