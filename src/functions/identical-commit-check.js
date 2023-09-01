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
  const {data: repoData} = await octokit.rest.repos.get({
    owner,
    repo
  })
  const defaultBranchName = repoData.default_branch
  core.info(`default branch name: ${defaultBranchName}`)

  // get the latest commit on the default branch of the repo
  const {data: defaultBranchData} = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch: defaultBranchName
  })
  const defaultBranchCommitSha = defaultBranchData.commit.sha
  core.info(`default branch commit sha: ${defaultBranchCommitSha}`)

  // find the latest deployment with the payload type of branch-deploy
  const {data: deploymentsData} = await octokit.rest.repos.listDeployments({
    owner,
    repo,
    environment,
    sort: 'created_at',
    direction: 'desc',
    per_page: 100
  })
  // loop through all deployments and look for the latest deployment with the payload type of branch-deploy
  var latestDeploymentSha
  var createdAt
  var deploymentId
  for (const deployment of deploymentsData) {
    if (deployment.payload.type === 'branch-deploy') {
      latestDeploymentSha = deployment.sha
      createdAt = deployment.created_at
      deploymentId = deployment.id
      break
    }
  }

  core.info(`latest deployment sha: ${latestDeploymentSha}`)
  core.info('latest deployment with payload type of "branch-deploy"')
  core.info(`latest deployment sha: ${latestDeploymentSha}`)
  core.info(`latest deployment created at: ${createdAt}`)
  core.info(`latest deployment id: ${deploymentId}`)

  // get the merge commit that triggered the deployment
  const {data: deploymentData} = await octokit.rest.repos.getDeployment({
    owner,
    repo,
    deployment_id: deploymentId
  })
  const mergeCommitSha = deploymentData.sha
  core.info(`merge commit sha: ${mergeCommitSha}`)

  // manually compare the commit SHA of the merge commit with the SHA of the latest commit on the default branch
  const result = mergeCommitSha === defaultBranchCommitSha

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
