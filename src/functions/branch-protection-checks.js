import * as core from '@actions/core'
import {COLORS} from './colors'
import {API_HEADERS} from './api-headers'

export async function branchProtectionChecks(context, octokit, data) {
  const branch = data.branch

  const branch_protection = await octokit.rest.repos.getBranchProtection({
    ...context.repo,
    branch,
    headers: API_HEADERS
  })

  const branch_rules = await octokit.rest.repos.getBranchRules({
    ...context.repo,
    branch,
    headers: API_HEADERS
  })

  core.info(
    `👀 branch ${COLORS.highlight}protection${COLORS.reset}: ${JSON.stringify(branch_protection)}`
  )
  core.info(
    `👀 branch ${COLORS.highlight}rules${COLORS.reset}: ${JSON.stringify(branch_rules)}`
  )
}
