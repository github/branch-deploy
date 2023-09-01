import * as core from '@actions/core'

// Helper function to if a new deployment should be created or not
// This function runs in the context of a merged pull request, or a push to the default branch
// If we are running in the context of a merged pull request, we will check to see if the latest deployment, was created from the pull request that was merged, and that the deployment is not out of date or behind in anyway. If the deployment is fully up-to-date, we will not trigger a new deployment as it would be identical to the latest deployment and a waste of compute resources.
// Alternatively, if we are running in the context of a direct push to the default branch (not associated with a PR), then we will always trigger a new deployment
// :param octokit: the authenticated octokit instance
// :param context: the context object
// :param environment: the environment to check
// :return: true if the latest deployment is up-to-date, false if a new deployment should be created
export async function identicalCommitCheck(octokit, context, environment) {
  // get the owner and the repo from the context
  const {owner, repo} = context.repo

  // get the latest commit SHA for the default branch
  const {data: branchData} = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch:
      context.payload?.pull_request?.base?.ref ||
      context.ref.replace('refs/heads/', '')
  })
  const latestCommitSha = branchData.commit.sha

  // get the latest deployment SHA for the environment
  const {data: deploymentsData} = await octokit.rest.repos.listDeployments({
    owner,
    repo,
    environment,
    per_page: 1
  })
  const latestDeploymentSha = deploymentsData[0]?.sha

  // get the latest previous deployment SHA for the environment
  const {data: previousDeploymentsData} =
    await octokit.rest.repos.listDeployments({
      owner,
      repo,
      environment,
      per_page: 1,
      page: 2
    })
  const latestPreviousDeploymentSha = previousDeploymentsData[0]?.sha

  // compare the latest commit SHA and the latest previous deployment SHA
  const {data: compareData} = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base:
      latestPreviousDeploymentSha ||
      latestDeploymentSha ||
      context.payload?.pull_request?.head?.sha ||
      branchData.commit.sha,
    head: latestCommitSha
  })

  if (compareData.status === 'identical') {
    core.info('latest deployment sha is identical to the latest commit sha')
    core.setOutput('continue', 'false')
    core.setOutput('environment', environment)
    return true
  } else {
    core.info('a new deployment will be created based on your configuration')
    core.setOutput('continue', 'true')
    core.setOutput('environment', environment)
    return false
  }
}
