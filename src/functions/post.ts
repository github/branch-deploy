import * as core from '../actions-core.ts'
import {retry} from '@octokit/plugin-retry'
import * as github from '@actions/github'
import {context} from '@actions/github'

import {stringToArray} from './string-to-array.ts'
import {contextCheck} from './context-check.ts'
import {checkInput} from './check-input.ts'
import {postDeploy} from './post-deploy.ts'
import {COLORS} from './colors.ts'
import {VERSION} from '../version.ts'
import {
  getActionInput,
  getActionState,
  getBooleanActionInput
} from '../action-io.ts'
import {branchDeployContext, legacyApiError} from '../trust-boundaries.ts'
import type {RawPostDeployData} from '../types.ts'

export async function post(): Promise<void> {
  try {
    const token = getActionState('actionsToken')
    const bypass = getActionState('bypass') === 'true'
    const skip_completing = getBooleanActionInput('skip_completing')

    const data = {
      sha: getActionState('sha'),
      ref: getActionState('ref'),
      comment_id: getActionState('comment_id'),
      reaction_id: getActionState('reaction_id'),
      noop: getActionState('noop') === 'true',
      deployment_id: getActionState('deployment_id'),
      environment: getActionState('environment'),
      environment_url: checkInput(getActionState('environment_url')),
      approved_reviews_count: getActionState('approved_reviews_count'),
      review_decision: getActionState('review_decision'),
      status: getActionInput('status'),
      fork: getActionState('fork') === 'true',
      params: getActionState('params'),
      parsed_params: getActionState('parsed_params'),
      labels: {
        successful_deploy: stringToArray(
          getActionInput('successful_deploy_labels')
        ),
        successful_noop: stringToArray(
          getActionInput('successful_noop_labels')
        ),
        failed_deploy: stringToArray(getActionInput('failed_deploy_labels')),
        failed_noop: stringToArray(getActionInput('failed_noop_labels')),
        skip_successful_noop_labels_if_approved: getBooleanActionInput(
          'skip_successful_noop_labels_if_approved'
        ),
        skip_successful_deploy_labels_if_approved: getBooleanActionInput(
          'skip_successful_deploy_labels_if_approved'
        )
      },
      commit_verified: getActionState('commit_verified') === 'true',
      deployment_start_time: getActionState('deployment_start_time'),
      disable_lock: getActionState('disable_lock') === 'true',
      lock_ref_sha: getActionState('lock_ref_sha'),
      trusted_sha: getActionState('trusted_sha')
    } satisfies RawPostDeployData

    // If bypass is set, exit the workflow
    if (bypass) {
      core.warning(`⛔ ${COLORS.highlight}bypass${COLORS.reset} set, exiting`)
      return
    }

    // Check the context of the event to ensure it is valid, return if it is not
    const actionContext = branchDeployContext(context)
    if (!contextCheck(actionContext)) {
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

    await postDeploy(actionContext, octokit, data)

    return
  } catch (error) {
    const apiError = legacyApiError(error)
    core.error(apiError.stack)
    core.setFailed(apiError.message)
  }
}
