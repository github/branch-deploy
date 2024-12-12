import * as core from '@actions/core'
import {COLORS} from './colors'
import {API_HEADERS} from './api-headers'
import {SUGGESTED_RULESETS} from './suggested-rulesets'

export async function branchRulesetChecks(context, octokit, data) {
  const branch = data.branch
  const use_security_warnings = data?.use_security_warnings !== false

  // exit early if the user has disabled security warnings
  if (!use_security_warnings) {
    return {success: true}
  }

  const {data: branch_rules} = await octokit.rest.repos.getBranchRules({
    ...context.repo,
    branch,
    headers: API_HEADERS
  })

  core.debug(
    `branch ${COLORS.highlight}rulesets${COLORS.reset}: ${JSON.stringify(branch_rules)}`
  )

  var failed_checks = []

  // leave a warning if no rulesets are defined
  if (branch_rules.length === 0) {
    core.warning(
      `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} are not defined for branch ${COLORS.highlight}${branch}${COLORS.reset}`
    )
    failed_checks.push('missing_branch_rulesets')
  } else {
    // loop through the suggested rulesets and check them against the branch rules
    SUGGESTED_RULESETS.forEach(suggested_rule => {
      const rule_type = suggested_rule.type
      const rule_parameters = suggested_rule.parameters

      const branch_rule = branch_rules.find(rule => rule.type === rule_type)

      if (!branch_rule) {
        core.warning(
          `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${branch}${COLORS.reset} is missing a rule of type ${COLORS.highlight}${rule_type}${COLORS.reset}`
        )
        failed_checks.push(`missing_${rule_type}`)
      } else if (rule_parameters) {
        Object.keys(rule_parameters).forEach(key => {
          if (branch_rule.parameters[key] !== rule_parameters[key]) {
            if (key === 'required_approving_review_count') {
              if (
                branch_rule.parameters['required_approving_review_count'] === 0
              ) {
                core.warning(
                  `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${branch}${COLORS.reset} contains the required_approving_review_count parameter but it is set to 0`
                )
                failed_checks.push(`mismatch_${rule_type}_${key}`)
              } else {
                core.debug(
                  `required_approving_review_count is ${branch_rule.parameters['required_approving_review_count']} - OK`
                )
              }
            } else {
              core.warning(
                `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} for branch ${COLORS.highlight}${branch}${COLORS.reset} contains a rule of type ${COLORS.highlight}${rule_type}${COLORS.reset} with a parameter ${COLORS.highlight}${key}${COLORS.reset} which does not match the suggested parameter`
              )
              failed_checks.push(`mismatch_${rule_type}_${key}`)
            }
          }
        })
      }
    })
  }

  if (failed_checks.length > 0) {
    core.warning(
      `😨 the following branch ruleset warnings were detected: ${failed_checks.join(', ')}`
    )
    core.warning(
      `📚 your branch ruleset settings may be insecure - please review the documentation: https://github.com/github/branch-deploy/blob/main/docs/branch-rulesets.md`
    )
  }

  // if there are no failed checks, log a success message
  if (failed_checks.length === 0) {
    core.info(`🔐 branch ruleset checks ${COLORS.success}passed${COLORS.reset}`)
  }

  return {success: failed_checks.length === 0, failed_checks: failed_checks}
}
