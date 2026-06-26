import * as core from '@actions/core'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

// Helper function to check if the current deployment's ref is identical to the merge commit
// :param octokit: the authenticated octokit instance
// :param context: the context object
// :param environment: the environment to check
// :return: true if the current deployment's ref is identical to the merge commit, false otherwise
export async function identicalCommitCheck(
  octokit: BranchDeployOctokit,
  context: BranchDeployContext,
  environment: string
) {
  // get the owner and the repo from the context
  const {owner, repo} = context.repo

  // find the default branch
  const {data: repoData} = await octokit.rest.repos.get({
    owner,
    repo,
    headers: API_HEADERS
  })
  const defaultBranchName = repoData.default_branch
  core.debug(`default branch name: ${defaultBranchName}`)

  // get the latest commit on the default branch of the repo
  const {data: defaultBranchData} = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch: defaultBranchName,
    headers: API_HEADERS
  })
  const defaultBranchTreeSha = defaultBranchData.commit.commit.tree.sha
  core.debug(`default branch tree sha: ${defaultBranchTreeSha}`)

  const latestDefaultBranchCommitSha = defaultBranchData.commit.sha
  core.info(
    `📍 latest commit sha on ${COLORS.highlight}${defaultBranchName}${COLORS.reset}: ${COLORS.info}${latestDefaultBranchCommitSha}${COLORS.reset}`
  )

  // find the latest deployment with the payload type of branch-deploy
  const {data: deploymentsData} = await octokit.rest.repos.listDeployments({
    owner,
    repo,
    environment,
    sort: 'created_at',
    direction: 'desc',
    per_page: 100,
    headers: API_HEADERS
  })
  // loop through all deployments and look for the latest deployment with the payload type of branch-deploy
  var latestDeploymentTreeSha
  var createdAt
  var deploymentId
  for (const deployment of deploymentsData) {
    if ((deployment.payload as {type?: string}).type === 'branch-deploy') {
      latestDeploymentTreeSha = deployment.sha
      createdAt = deployment.created_at
      deploymentId = deployment.id

      // get the tree sha of the latest deployment
      const commitData = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: latestDeploymentTreeSha,
        headers: API_HEADERS
      })
      latestDeploymentTreeSha = commitData.data.commit.tree.sha
      break
    } else {
      core.debug(
        `deployment.payload.type is not of the branch-deploy type: ${(deployment.payload as {type?: string}).type} - skipping...`
      )
      continue
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
    // if the latest deployment sha is not identical to the latest commit on the default branch then we need to create a new deployment
    // this deployment should use the latest commit on the default branch to ensure that the repository is deployed at its latest state
    // a scenario where this might occur is if the default branch is force-pushed and you need to start a new deployment from the latest commit on the default branch
    core.info(
      `💡 the latest deployment tree sha is ${COLORS.highlight}not${COLORS.reset} equal to the default branch tree sha`
    )
    core.info(
      `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${latestDefaultBranchCommitSha}${COLORS.reset}`
    )
    core.info(
      `🚀 a ${COLORS.success}new deployment${COLORS.reset} will be created based on your configuration`
    )
    core.setOutput('continue', 'true')
    core.setOutput('environment', environment)
    core.setOutput('sha', latestDefaultBranchCommitSha)
    core.saveState('sha', latestDefaultBranchCommitSha)
  }

  return result
}
