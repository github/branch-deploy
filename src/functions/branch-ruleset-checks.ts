import * as core from '@actions/core'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {SUGGESTED_RULESETS} from './suggested-rulesets.ts'
import {ERROR} from './templates/error.ts'
import type {
  ApiError,
  BranchDeployContext,
  BranchDeployOctokit,
  BranchRule,
  RuleParameters
} from '../types.ts'

export async function branchRulesetChecks(
  context: BranchDeployContext,
  octokit: BranchDeployOctokit,
  data: {branch: string; use_security_warnings?: boolean}
) {
  const branch = data.branch
  const useSecurityWarnings = data?.use_security_warnings !== false

  // Exit early if the user has disabled security warnings
  if (!useSecurityWarnings) {
    return {success: true}
  }

  try {
    const {data: branchRules} = (await octokit.rest.repos.getBranchRules({
      ...context.repo,
      branch,
      headers: API_HEADERS
    })) as {data: BranchRule[]}

    core.debug(
      `branch ${COLORS.highlight}rulesets${COLORS.reset}: ${JSON.stringify(branchRules)}`
    )

    const failed_checks: string[] = []

    // Leave a warning if no rulesets are defined
    if (branchRules.length === 0) {
      core.warning(
        `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} are not defined for branch ${COLORS.highlight}${branch}${COLORS.reset}`
      )
      failed_checks.push('missing_branch_rulesets')
    } else {
      // Loop through the suggested rulesets and check them against the branch rules
      SUGGESTED_RULESETS.forEach(suggestedRule => {
        const {type: ruleType, parameters: ruleParameters} = suggestedRule

        const branchRule = branchRules.find(rule => rule.type === ruleType)

        if (!branchRule) {
          logMissingRule(branch, ruleType, failed_checks)
        } else if (ruleParameters) {
          checkRuleParameters(
            branch,
            ruleType,
            ruleParameters,
            branchRule,
            failed_checks
          )
        }
      })
    }

    logWarnings(failed_checks)

    // If there are no failed checks, log a success message
    if (failed_checks.length === 0) {
      core.info(
        `🔐 branch ruleset checks ${COLORS.success}passed${COLORS.reset}`
      )
    }

    return {success: failed_checks.length === 0, failed_checks}
  } catch (error) {
    if (
      (error as ApiError).status === ERROR.messages.upgrade_or_public.status &&
      (error as ApiError).message.includes(
        ERROR.messages.upgrade_or_public.message
      )
    ) {
      core.debug(ERROR.messages.upgrade_or_public.help_text)
      return {success: false, failed_checks: ['upgrade_or_public_required']}
    } else {
      throw error
    }
  }
}

function logMissingRule(
  branch: string,
  ruleType: string,
  failed_checks: string[]
) {
  core.warning(
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${branch}${COLORS.reset} is missing a rule of type ${COLORS.highlight}${ruleType}${COLORS.reset}`
  )
  failed_checks.push(`missing_${ruleType}`)
}

function checkRuleParameters(
  branch: string,
  ruleType: string,
  ruleParameters: RuleParameters,
  branchRule: BranchRule,
  failed_checks: string[]
) {
  Object.keys(ruleParameters).forEach(key => {
    if (branchRule.parameters[key] !== ruleParameters[key]) {
      if (key === 'required_approving_review_count') {
        handleReviewCountMismatch(branch, ruleType, branchRule, failed_checks)
      } else {
        logParameterMismatch(branch, ruleType, key, failed_checks)
      }
    }
  })
}

function handleReviewCountMismatch(
  branch: string,
  ruleType: string,
  branchRule: BranchRule,
  failed_checks: string[]
) {
  if (branchRule.parameters['required_approving_review_count'] === 0) {
    core.warning(
      `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${branch}${COLORS.reset} contains the required_approving_review_count parameter but it is set to 0`
    )
    failed_checks.push(`mismatch_${ruleType}_required_approving_review_count`)
  } else {
    core.debug(
      `required_approving_review_count is ${branchRule.parameters['required_approving_review_count']} - OK`
    )
  }
}

function logParameterMismatch(
  branch: string,
  ruleType: string,
  key: string,
  failed_checks: string[]
) {
  core.warning(
    `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${branch}${COLORS.reset} contains a rule of type ${COLORS.highlight}${ruleType}${COLORS.reset} with a parameter ${COLORS.highlight}${key}${COLORS.reset} which does not match the suggested parameter`
  )
  failed_checks.push(`mismatch_${ruleType}_${key}`)
}

function logWarnings(failed_checks: string[]) {
  if (failed_checks.length > 0) {
    core.warning(
      `😨 the following branch ruleset warnings were detected: ${failed_checks.join(', ')}`
    )
    core.warning(
      `📚 your branch ruleset settings may be insecure - please review the documentation: https://github.com/github/branch-deploy/blob/main/docs/branch-rulesets.md`
    )
  }
}
