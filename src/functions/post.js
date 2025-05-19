const core = require('@actions/core')
const github = require('@actions/github')
const {context} = require('@actions/github')

const {stringToArray} = require('./string-to-array')
const {contextCheck} = require('./context-check')
const {checkInput} = require('./check-input')
const {postDeploy} = require('./post-deploy')
const {COLORS} = require('./colors')
const {VERSION} = require('../version')

// Initialize as null and load dynamically if needed
let retry = null

async function post() {
  try {
    // Load ESM modules dynamically if needed
    if (!retry) {
      try {
        // Try to load directly (works in tests with jest transform)
        const retryModule = require('@octokit/plugin-retry')
        retry = retryModule.retry
      } catch (e) {
        // Handle ESM module loading
        try {
          const retryModule = await import('@octokit/plugin-retry')
          retry = retryModule.retry
        } catch (error) {
          core.warning(`Error loading ESM plugin: ${error.message}`)
        }
      }
    }

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

    // If we couldn't load the plugin with require, use dynamic imports
    if (!retry) {
      try {
        const {retry: dynamicRetry} = await import('@octokit/plugin-retry')
        retry = dynamicRetry
      } catch (error) {
        core.warning(`Error loading ESM plugin: ${error.message}`)
      }
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

    await postDeploy(context, octokit, data)

    return
  } catch (error) {
    core.error(error.stack)
    core.setFailed(error.message)
  }
}

module.exports = { post }
