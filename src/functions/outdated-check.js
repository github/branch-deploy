import * as core from '@actions/core'
import {COLORS} from './colors'
import {API_HEADERS} from './api-headers'

// Helper function to check to see if the PR branch is outdated in anyway based on the Action's configuration
//
// outdated_mode can be: pr_base, default_branch, or strict (default)
//
// :param context: The context of the Action
// :param octokit: An authenticated instance of the GitHub client
// :param data: An object containing all of the data needed for this function
// :return: A boolean value indicating if the PR branch is outdated or not
export async function isOutdated(context, octokit, data) {
  core.debug(`outdated_mode: ${data.outdated_mode}`)

  // Helper function to compare two branches
  // :param baseBranch: The base branch to compare against
  // :param prBranch: The PR branch to compare
  // :return: An object containing a boolean value indicating if the PR branch is behind the base branch or not, and a string containing the name of the branch that is behind
  async function compareBranches(baseBranch, prBranch) {
    // if the mergeStateStatus is BEHIND, then we know the PR is behind the base branch
    // in this case we can skip the commit comparison
    if (data.mergeStateStatus === 'BEHIND') {
      core.debug(`mergeStateStatus is BEHIND - exiting isOutdated logic early`)
      return {outdated: true, branch: baseBranch.data.name}
    }

    const compare = await octokit.rest.repos.compareCommits({
      ...context.repo,
      base: baseBranch.data.commit.sha,
      head: prBranch.data.head.sha,
      headers: API_HEADERS
    })

    if (compare.data.behind_by > 0) {
      const commits = compare.data.behind_by === 1 ? 'commit' : 'commits'
      core.warning(
        `The PR branch is behind the base branch by ${COLORS.highlight}${compare.data.behind_by} ${commits}${COLORS.reset}`
      )
      return {outdated: true, branch: baseBranch.data.name}
    } else {
      core.debug(`The PR branch is not behind the base branch - OK`)
      return {outdated: false, branch: baseBranch.data.name}
    }
  }

  // Check based on the outdated_mode
  // pr_base: compare the PR branch to the base branch it is targeting
  // default_branch: compare the PR branch to the default branch of the repo (aka the "stable" branch)
  // strict: compare the PR branch to both the base branch and the default branch (default mode)
  switch (data.outdated_mode) {
    case 'pr_base':
      core.debug(`checking isOutdated with pr_base mode`)
      return await compareBranches(data.baseBranch, data.pr)
    case 'default_branch':
      core.debug(`checking isOutdated with default_branch mode`)
      return await compareBranches(data.stableBaseBranch, data.pr)
    case 'strict': {
      core.debug(`checking isOutdated with strict mode`)
      const isBehindBaseBranch = await compareBranches(data.baseBranch, data.pr)
      const isBehindStableBaseBranch = await compareBranches(
        data.stableBaseBranch,
        data.pr
      )

      // Return the first branch that is behind (if any)
      if (isBehindBaseBranch.outdated === true) {
        return isBehindBaseBranch
      } else if (isBehindStableBaseBranch.outdated === true) {
        return isBehindStableBaseBranch
      } else {
        // If neither branch is behind, then the PR is not outdated
        return {
          outdated: false,
          branch: `${data.baseBranch.data.name}|${data.stableBaseBranch.data.name}`
        }
      }
    }
  }
}
