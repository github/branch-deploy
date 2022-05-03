import * as core from '@actions/core'
import {contextCheck} from './context-check'
import {postDeploy} from './post-deploy'
import * as github from '@actions/github'
import {context} from '@actions/github'

export async function post() {
  try {
    const ref = core.getState('ref')
    const comment_id = core.getState('comment_id')
    const noop = core.getState('noop')
    const deployment_id = core.getState('deployment_id')
    const environment = core.getState('environment')
    const token = core.getState('actionsToken')
    const bypass = core.getState('bypass')
    const job_status = core.getInput('job_status')

    // debug
    core.info(`job_status: ${job_status}`)

    // If bypass is set, exit the workflow
    if (bypass === 'true') {
      core.warning('bypass set, exiting')
      return
    }

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      return
    }

    // Create an octokit client
    const octokit = github.getOctokit(token)

    await postDeploy(
      context,
      octokit,
      comment_id,
      'success', // hardcoded for now
      'success', // hardcoded for now
      ref,
      noop,
      deployment_id,
      environment
    )

    return
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
