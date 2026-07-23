import * as core from '../actions-core.ts'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {saveActionState, setActionOutput} from '../action-io.ts'
import {latestBranchDeployDeployment} from './deployment.ts'
import type {DeploymentGraphqlOctokit} from './deployment.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

type GetRepositoryMethod = BranchDeployOctokit['rest']['repos']['get']
type GetRepositoryParameters = Parameters<GetRepositoryMethod>[0]
type FullGetRepositoryResponse = Awaited<ReturnType<GetRepositoryMethod>>
type GetBranchMethod = BranchDeployOctokit['rest']['repos']['getBranch']
type GetBranchParameters = Parameters<GetBranchMethod>[0]
type FullGetBranchResponse = Awaited<ReturnType<GetBranchMethod>>
type GetCommitMethod = BranchDeployOctokit['rest']['repos']['getCommit']
type GetCommitParameters = Parameters<GetCommitMethod>[0]
type FullGetCommitResponse = Awaited<ReturnType<GetCommitMethod>>

export interface IdenticalCommitOctokit extends DeploymentGraphqlOctokit {
  readonly rest: {
    readonly repos: {
      readonly get: (parameters?: GetRepositoryParameters) => Promise<{
        readonly data: Pick<FullGetRepositoryResponse['data'], 'default_branch'>
      }>
      readonly getBranch: (parameters?: GetBranchParameters) => Promise<{
        readonly data: {
          readonly commit: Pick<
            FullGetBranchResponse['data']['commit'],
            'sha'
          > & {
            readonly commit: {
              readonly tree: Pick<
                FullGetBranchResponse['data']['commit']['commit']['tree'],
                'sha'
              >
            }
          }
        }
      }>
      readonly getCommit: (parameters?: GetCommitParameters) => Promise<{
        readonly data: {
          readonly commit: {
            readonly tree: Pick<
              FullGetCommitResponse['data']['commit']['tree'],
              'sha'
            >
          }
        }
      }>
    }
  }
}

// Helper function to check if the current deployment's ref is identical to the merge commit
// :param octokit: the authenticated octokit instance
// :param context: the context object
// :param environment: the environment to check
// :return: true if the current deployment's ref is identical to the merge commit, false otherwise
export async function identicalCommitCheck(
  octokit: IdenticalCommitOctokit,
  context: BranchDeployContext,
  environment: string
): Promise<boolean> {
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

  const latestDeployment = await latestBranchDeployDeployment(
    octokit,
    context,
    environment
  )
  let latestDeploymentTreeSha: string | undefined
  let createdAt: string | undefined
  let deploymentId: string | undefined
  if (latestDeployment?.state === 'ACTIVE') {
    createdAt = latestDeployment.createdAt
    deploymentId = latestDeployment.id
    const commitData = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: latestDeployment.commit.oid,
      headers: API_HEADERS
    })
    latestDeploymentTreeSha = commitData.data.commit.tree.sha
  } else if (latestDeployment !== null) {
    core.debug(
      `latest branch-deploy deployment is ${latestDeployment.state} - skipping...`
    )
  }

  core.info(
    `🌲 latest default ${COLORS.info}branch${COLORS.reset} tree sha: ${COLORS.info}${defaultBranchTreeSha}${COLORS.reset}`
  )
  core.info(
    `🌲 latest ${COLORS.info}deployment${COLORS.reset} tree sha:     ${COLORS.info}${String(latestDeploymentTreeSha)}${COLORS.reset}`
  )
  core.debug('💡 latest deployment with payload type of "branch-deploy"')
  core.debug(`🕛 latest deployment created at: ${String(createdAt)}`)
  core.debug(`🧮 latest deployment id: ${String(deploymentId)}`)

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
    setActionOutput('continue', 'false')
    setActionOutput('environment', environment)
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
    setActionOutput('continue', 'true')
    setActionOutput('environment', environment)
    setActionOutput('sha', latestDefaultBranchCommitSha)
    saveActionState('sha', latestDefaultBranchCommitSha)
  }

  return result
}
