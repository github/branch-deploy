import * as core from '@actions/core'
import {COLORS} from './colors'
import {API_HEADERS} from './api-headers'

export async function branchProtectionChecks(context, octokit, data) {
  const branch = data.branch

  const branch_rules = await octokit.rest.repos.getBranchRules({
    ...context.repo,
    branch,
    headers: API_HEADERS
  })

  core.info(
    `👀 branch ${COLORS.highlight}rulesets${COLORS.reset}: ${JSON.stringify(branch_rules)}`
  )
}
