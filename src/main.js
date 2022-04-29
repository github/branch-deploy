import * as core from '@actions/core'
import {triggerCheck} from './functions/trigger-check'
import {contextCheck} from './functions/context-check'
import {reactEmote} from './functions/react-emote'
import {actionFailed} from './functions/action-failed'
import {prechecks} from './functions/prechecks'
import * as github from '@actions/github'
import {context} from '@actions/github'

async function run() {
  try {
    // Get the inputs for the branch-deploy Action
    const trigger = core.getInput('trigger')
    const reaction = core.getInput('reaction')
    const prefixOnly = core.getInput('prefix_only') === 'true'
    const token = core.getInput('github_token', {required: true})
    const environment = core.getInput('environment', {required: true})
    const stable_branch = core.getInput('stable_branch')
    const noop_trigger = core.getInput('noop_trigger')

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      return
    }

    // Get variables from the event context
    const body = context.payload.comment.body
    const issue_number = context.payload.issue.number

    // Check if the comment body contains the trigger, exit if it doesn't return true
    if (!(await triggerCheck(prefixOnly, body, trigger))) {
      return
    }

    // Create an octokit client
    const octokit = github.getOctokit(token)

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
      actionFailed(context, octokit, reactRes.data.id, precheckResults.message)
      core.setFailed(precheckResults.message)
      return
    }

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
