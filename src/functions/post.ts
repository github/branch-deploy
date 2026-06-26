import * as core from '@actions/core'
import {retry} from '@octokit/plugin-retry'
import * as github from '@actions/github'
import {context} from '@actions/github'

import {stringToArray} from './string-to-array.ts'
import {contextCheck} from './context-check.ts'
import {checkInput} from './check-input.ts'
import {postDeploy} from './post-deploy.ts'
import {COLORS} from './colors.ts'
import {VERSION} from '../version.ts'
import type {ApiError, BranchDeployContext} from '../types.ts'

export async function post() {
  try {
    const token = core.getState('actionsToken')
    const bypass = core.getState('bypass') === 'true'
    const skip_completing = core.getBooleanInput('skip_completing')

    const data = {
      sha: core.getState('sha'),
      ref: core.getState('ref'),
      comment_id: core.getState('comment_id'),
      reaction_id: core.getState('reaction_id'),
      noop: core.getState('noop') === 'true',
      deployment_id: core.getState('deployment_id'),
      environment: core.getState('environment'),
      environment_url: checkInput(core.getState('environment_url')),
      approved_reviews_count: core.getState('approved_reviews_count'),
      review_decision: core.getState('review_decision'),
      status: core.getInput('status'),
      fork: core.getState('fork') === 'true',
      params: core.getState('params'),
      parsed_params: core.getState('parsed_params'),
      labels: {
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
      },
      commit_verified: core.getState('commit_verified') === 'true',
      deployment_start_time: core.getState('deployment_start_time')
    }

    // If bypass is set, exit the workflow
    if (bypass) {
      core.warning(`⛔ ${COLORS.highlight}bypass${COLORS.reset} set, exiting`)
      return
    }

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context as unknown as BranchDeployContext))) {
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
      userAgent: `github/branch-deploy@${VERSION}`,
      additionalPlugins: [retry]
    })

    core.info(`🧑‍🚀 commit SHA: ${COLORS.highlight}${data.sha}${COLORS.reset}`)

    // Set the environment_url
    if (data.environment_url === null) {
      core.debug('environment_url not set, its value is null')
    }

    await postDeploy(context as unknown as BranchDeployContext, octokit, data)

    return
  } catch (error) {
    core.error((error as ApiError).stack)
    core.setFailed((error as ApiError).message)
  }
}
