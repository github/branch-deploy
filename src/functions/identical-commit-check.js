import * as core from '@actions/core'

// Helper function to check if the current deployment's ref is identical to the merge commit
// :param octokit: the authenticated octokit instance
// :param context: the context object
// :param environment: the environment to check
// :return: true if the current deployment's ref is identical to the merge commit, false otherwise
export async function identicalCommitCheck(octokit, context, environment) {
  // get the owner and the repo from the context
  const {owner, repo} = context.repo

  // find the default branch
  const {data: repoData} = await octokit.repos.get({
    owner,
    repo
  })
  const defaultBranchName = repoData.default_branch
  core.debug(`default branch name: ${defaultBranchName}`)

  // get the latest commit on the default branch of the repo
  const {data: defaultBranchData} = await octokit.repos.getBranch({
    owner,
    repo,
    branch: defaultBranchName
  })
  const defaultBranchCommitSha = defaultBranchData.commit.sha
  core.debug(`default branch commit sha: ${defaultBranchCommitSha}`)

  // find the latest deployment and get its sha
  const {data: deployments} = await octokit.repos.listDeployments({
    owner,
    repo,
    environment,
    per_page: 1
  })
  const latestDeploymentSha = deployments[0].sha
  core.debug(`latest deployment sha: ${latestDeploymentSha}`)

  // compare the latest deployment sha with the latest commit on the default branch
  const {data: compareData} = await octokit.repos.compareCommits({
    owner,
    repo,
    base: defaultBranchCommitSha,
    head: latestDeploymentSha
  })

  // if the latest deployment sha is identical to the latest commit on the default branch then return true
  const result = compareData.status === 'identical'

  if (result) {
    core.info('latest deployment sha is identical to the latest commit sha')
    core.info(
      'identical commits will not be deployed again based on your configuration'
    )
    core.setOutput('continue', 'false')
    core.setOutput('environment', environment)
  } else {
    core.info(
      'latest deployment is not identical to the latest commit on the default branch'
    )
    core.info('a new deployment will be created based on your configuration')
    core.setOutput('continue', 'true')
    core.setOutput('environment', environment)
  }

  return result
}
