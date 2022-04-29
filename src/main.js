import * as core from '@actions/core'
import { triggerCheck } from './functions/trigger-check'
import { contextCheck } from './functions/context-check'
import { reactEmote } from './functions/react-emote'
import { actionStatus } from './functions/action-status'
import { postDeployComment } from './functions/post-deploy-comment'
import { prechecks } from './functions/prechecks'
import * as github from '@actions/github'
import { context } from '@actions/github'

async function run() {
  try {
    // Get the inputs for the branch-deploy Action
    const trigger = core.getInput('trigger')
    const reaction = core.getInput('reaction')
    const prefixOnly = core.getInput('prefix_only') === 'true'
    const token = core.getInput('github_token', { required: true })
    const environment = core.getInput('environment', { required: true })
    const stable_branch = core.getInput('stable_branch')
    const noop_trigger = core.getInput('noop_trigger')
    // Get the inputs for the alternate Action to post a post-deployment comment
    const deployment_comment_id = core.getInput('deployment_comment_id')
    const deployment_status = core.getInput('deployment_status')
    const deployment_message = core.getInput('deployment_message')
    const deployment_result_ref = core.getInput('deployment_result_ref')
    const deployment_mode_noop = core.getInput('deployment_mode_noop')

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      return
    }

    // Get variables from the event context
    const body = context.payload.comment.body
    const issue_number = context.payload.issue.number

    // Create an octokit client
    const octokit = github.getOctokit(token)

    // Execute post-deployment comment logic if the action is running under that context
    if (postDeployComment(context,
      octokit,
      deployment_comment_id,
      deployment_status,
      deployment_message,
      deployment_result_ref,
      deployment_mode_noop)) {
      core.info('post deploy comment logic executed... exiting')
      return
    }

    // Check if the comment body contains the trigger, exit if it doesn't return true
    if (!(await triggerCheck(prefixOnly, body, trigger))) {
      return
    }

    // Add the reaction to the issue_comment as we begin to start the deployment
    const reactRes = await reactEmote(reaction, context, octokit)

    // Execute prechecks to ensure the deployment can proceed
    const precheckResults = await prechecks(
      body,
      trigger,
      noop_trigger,
      stable_branch,
      issue_number,
      context,
      octokit
    )

    // If the prechecks failed, run the actionFailed function and return
    if (!precheckResults.status) {
      actionStatus(context, octokit, reactRes.data.id, precheckResults.message)
      core.setFailed(precheckResults.message)
      return
    }

    // Set the output of the ref
    core.setOutput('ref', precheckResults.ref)
    // Set the output of the comment id which triggered this action
    core.setOutput('comment_id', reactRes.data.id)

    // If the operation is a noop deployment, return
    if (precheckResults.noopMode) {
      core.setOutput('noop', 'true')
      core.info('noop mode detected')
      return
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

// core.info(`context: ${JSON.stringify(context)}`)
