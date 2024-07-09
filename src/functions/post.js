import * as core from '@actions/core'
import {octokitRetry} from '@octokit/plugin-retry'
import * as github from '@actions/github'
import {context} from '@actions/github'

import {stringToArray} from './string-to-array'
import {contextCheck} from './context-check'
import {checkInput} from './check-input'
import {postDeploy} from './post-deploy'
import {COLORS} from './colors'

export async function post() {
  try {
    const ref = core.getState('ref')
    const comment_id = core.getState('comment_id')
    const reaction_id = core.getState('reaction_id')
    const noop = core.getState('noop') === 'true'
    const deployment_id = core.getState('deployment_id')
    const environment = core.getState('environment')
    const environment_url = checkInput(core.getState('environment_url'))
    const approved_reviews_count = core.getState('approved_reviews_count')
    const token = core.getState('actionsToken')
    const bypass = core.getState('bypass') === 'true'
    const review_decision = core.getState('review_decision')
    const status = core.getInput('status')
    const skip_completing = core.getBooleanInput('skip_completing')
    const labels = {
      successful_deploy: stringToArray(
        core.getInput('successful_deploy_labels')
      ),
      successful_noop: stringToArray(core.getInput('successful_noop_labels')),
      failed_deploy: stringToArray(core.getInput('failed_deploy_labels')),
      failed_noop: stringToArray(core.getInput('failed_noop_labels')),
      skip_successful_noop_labels_if_approved: core.getBooleanInput(
        'skip_successful_noop_labels_if_approved'
      ),
      skip_successful_deploy_labels_if_approved: core.getBooleanInput(
        'skip_successful_deploy_labels_if_approved'
      )
    }

    // If bypass is set, exit the workflow
    if (bypass) {
      core.warning(`⛔ ${COLORS.highlight}bypass${COLORS.reset} set, exiting`)
      return
    }

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      return
    }

    // Skip the process of completing a deployment, return
    if (skip_completing) {
      core.info(
        `⏩ ${COLORS.highlight}skip_completing${COLORS.reset} set, exiting`
      )
      return
    }

    // Create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      additionalPlugins: [octokitRetry]
    })

    // Set the environment_url
    if (environment_url === null) {
      core.debug('environment_url not set, its value is null')
    }

    await postDeploy(
      context,
      octokit,
      comment_id,
      reaction_id,
      status,
      ref,
      noop,
      deployment_id,
      environment,
      environment_url,
      approved_reviews_count,
      labels,
      review_decision
    )

    return
  } catch (error) {
    core.error(error.stack)
    core.setFailed(error.message)
  }
}
