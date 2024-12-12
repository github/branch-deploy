import * as core from '@actions/core'
import {COLORS} from './colors'
import {API_HEADERS} from './api-headers'

export async function branchProtectionChecks(context, octokit, data) {
  const branch = data.branch
  const use_security_warnings = data?.use_security_warnings !== false

  const {data: branch_rules} = await octokit.rest.repos.getBranchRules({
    ...context.repo,
    branch,
    headers: API_HEADERS
  })

  core.debug(
    `branch ${COLORS.highlight}rulesets${COLORS.reset}: ${JSON.stringify(branch_rules)}`
  )

  var failed_checks = []

  // exit early if the user has disabled security warnings
  if (!use_security_warnings) {
    return {success: true}
  }

  // leave a warning if no rulesets are defined
  if (branch_rules.length === 0) {
    core.warning(
      `🔐 branch ${COLORS.highlight}rulesets${COLORS.reset} are not defined for branch ${COLORS.highlight}${branch}${COLORS.reset}`
    )
    failed_checks.push('missing_branch_rulesets')
  }

  if (failed_checks.length > 0) {
    core.warning(
      `😨 the following branch ruleset warnings were detected: ${failed_checks.join(', ')}`
    )
    core.warning(
      `💡 your branch ruleset setting may be insecure - please review the documentation: https://github.com/github/branch-deploy/blob/main/docs/branch-rulesets.md`
    )
  }

  // if there are no failed checks, log a success message
  if (failed_checks.length === 0) {
    core.info(`🔐 branch ruleset checks ${COLORS.success}passed${COLORS.reset}`)
  }

  return {success: failed_checks.length === 0, failed_checks: failed_checks}
}
