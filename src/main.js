import * as core from '@actions/core'
import {triggerCheck} from './functions/trigger-check'
import {contextCheck} from './functions/context-check'
import {reactEmote} from './functions/react-emote'
import {actionStatus} from './functions/action-status'
import {postDeploy} from './functions/post-deploy'
import {createDeploymentStatus} from './functions/deployment'
import {prechecks} from './functions/prechecks'
import * as github from '@actions/github'
import {context} from '@actions/github'
import dedent from 'dedent-js'

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
    // Get the inputs for the alternate Action to post a post-deployment comment
    const post_deploy = core.getInput('post_deploy')
    const deployment_comment_id = core.getInput('deployment_comment_id')
    const deployment_status = core.getInput('deployment_status')
    const deployment_message = core.getInput('deployment_message')
    const deployment_result_ref = core.getInput('deployment_result_ref')
    const deployment_mode_noop = core.getInput('deployment_mode_noop')
    const deployment_id = core.getInput('deployment_id')
    const bypass = core.getInput('bypass')
    const dataRaw = core.getInput('data')

    // If the bypass param is used, exit the workflow
    if (bypass) {
      return
    }
    if (dataRaw) {
      const data = JSON.parse(dataRaw)
      if (data.bypass) {
        return
      }
    }

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      return
    }

    // Get variables from the event context
    const body = context.payload.comment.body
    const issue_number = context.payload.issue.number
    const {owner, repo} = context.repo

    // Create an octokit client
    const octokit = github.getOctokit(token)

    // Execute post-deployment comment logic if the action is running under that context
    if (
      (await postDeploy(
        context,
        octokit,
        post_deploy,
        dataRaw,
        deployment_comment_id,
        deployment_status,
        deployment_message,
        deployment_result_ref,
        deployment_mode_noop,
        deployment_id,
        environment
      )) === true
    ) {
      core.info('post_deploy logic completed')
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
      await actionStatus(
        context,
        octokit,
        reactRes.data.id,
        precheckResults.message
      )
      core.setFailed(precheckResults.message)
      return
    }

    // Set the output of the ref (branch)
    core.setOutput('ref', precheckResults.ref)
    // Set the output of the comment id which triggered this action
    core.setOutput('comment_id', reactRes.data.id)

    // Set outputs for noopMode
    var noop
    if (precheckResults.noopMode) {
      noop = 'true'
      core.setOutput('noop', noop)
      core.info('noop mode detected')
    } else {
      noop = 'false'
      core.setOutput('noop', noop)
    }

    // If noopMode is true, exit
    if (precheckResults.noopMode) {
      // Output the data object used for the post deploy step
      core.setOutput('data', {
        ref: precheckResults.ref,
        comment_id: reactRes.data.id,
        noop: noop
      })
      return
    }

    // Create a new deployment
    const {data: createDeploy} = await octokit.rest.repos.createDeployment({
      owner: owner,
      repo: repo,
      ref: precheckResults.ref
    })

    // If a merge to the base branch is required, let the user know and exit
    if (
      typeof createDeploy.id === 'undefined' &&
      createDeploy.message.includes('Auto-merged')
    ) {
      const mergeMessage = dedent(`
        ### ⚠️ Deployment Warning

        Message: ${createDeploy.message}

        > Deployment will not continue. Please try again once this branch is up-to-date with the base branch
        `)
      await actionStatus(context, octokit, reactRes.data.id, mergeMessage)
      core.warning(mergeMessage)
      // Output the data object to bypass the post deploy step since the deployment is not complete
      core.setOutput('data', {
        ref: precheckResults.ref,
        comment_id: reactRes.data.id,
        noop: noop,
        bypass: 'true',
        environment: environment
      })
      return
    }

    // Set the deployment status to in_progress
    await createDeploymentStatus(
      octokit,
      context,
      precheckResults.ref,
      'in_progress',
      createDeploy.id,
      environment
    )

    // Output the data object used for the post deploy step
    core.setOutput('data', {
      ref: precheckResults.ref,
      comment_id: reactRes.data.id,
      noop: noop,
      deployment_id: createDeploy.id,
      environment: environment
    })
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

// core.info(`context: ${JSON.stringify(context)}`)
