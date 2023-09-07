import * as core from '@actions/core'
import {COLORS} from './colors'

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
  core.debug(`default branch name: ${defaultBranchName}`)

  // get the latest commit on the default branch of the repo
  const {data: defaultBranchData} = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch: defaultBranchName
  })
  const defaultBranchTreeSha = defaultBranchData.commit.commit.tree.sha
  core.debug(`default branch tree sha: ${defaultBranchTreeSha}`)

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
  var latestDeploymentTreeSha
  var createdAt
  var deploymentId
  for (const deployment of deploymentsData) {
    if (deployment.payload.type === 'branch-deploy') {
      latestDeploymentTreeSha = deployment.sha
      createdAt = deployment.created_at
      deploymentId = deployment.id

      // get the tree sha of the latest deployment
      const commitData = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: latestDeploymentTreeSha
      })
      latestDeploymentTreeSha = commitData.data.commit.tree.sha
      break
    }
  }

  core.info(
    `🌲 latest default ${COLORS.info}branch${COLORS.reset} tree sha: ${COLORS.info}${defaultBranchTreeSha}${COLORS.reset}`
  )
  core.info(
    `🌲 latest ${COLORS.info}deployment${COLORS.reset} tree sha:     ${COLORS.info}${latestDeploymentTreeSha}${COLORS.reset}`
  )
  core.debug('💡 latest deployment with payload type of "branch-deploy"')
  core.debug(`🕛 latest deployment created at: ${createdAt}`)
  core.debug(`🧮 latest deployment id: ${deploymentId}`)

  // if the latest deployment sha is identical to the latest commit on the default branch then return true
  const result = latestDeploymentTreeSha === defaultBranchTreeSha

  if (result) {
    core.info(
      `🟰 the latest deployment tree sha is ${COLORS.highlight}equal${COLORS.reset} to the default branch tree sha`
    )
    core.info(
      `🌲 identical commit trees will ${COLORS.highlight}not${COLORS.reset} be re-deployed based on your configuration`
    )
    core.info(
      `✅ deployments for the ${COLORS.highlight}${environment}${COLORS.reset} environment are ${COLORS.success}up to date${COLORS.reset}`
    )
    core.setOutput('continue', 'false')
    core.setOutput('environment', environment)
  } else {
    core.info(
      `💡 the latest deployment tree sha is ${COLORS.highlight}not${COLORS.reset} equal to the default branch tree sha`
    )
    core.info(
      `🚀 a ${COLORS.success}new deployment${COLORS.reset} will be created based on your configuration`
    )
    core.setOutput('continue', 'true')
    core.setOutput('environment', environment)
  }

  return result
}
