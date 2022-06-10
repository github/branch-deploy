import * as core from '@actions/core'
import {triggerCheck} from './functions/trigger-check'
import {contextCheck} from './functions/context-check'
import {reactEmote} from './functions/react-emote'
import {actionStatus} from './functions/action-status'
import {createDeploymentStatus} from './functions/deployment'
import {prechecks} from './functions/prechecks'
import {validPermissions} from './functions/valid-permissions'
import {lock} from './functions/lock'
import {post} from './functions/post'
import * as github from '@actions/github'
import {context} from '@actions/github'
import dedent from 'dedent-js'

// :returns: 'success', 'success - noop', 'failure', 'safe-exit', or raises an error
export async function run() {
  try {
    // Get the inputs for the branch-deploy Action
    const trigger = core.getInput('trigger')
    const reaction = core.getInput('reaction')
    const prefixOnly = core.getInput('prefix_only') === 'true'
    const token = core.getInput('github_token', {required: true})
    const environment = core.getInput('environment', {required: true})
    const stable_branch = core.getInput('stable_branch')
    const noop_trigger = core.getInput('noop_trigger')
    const lock_trigger = core.getInput('lock_trigger')
    const update_branch = core.getInput('update_branch')
    const required_contexts = core.getInput('required_contexts')

    // Set the state so that the post run logic will trigger
    core.saveState('isPost', 'true')
    core.saveState('actionsToken', token)
    core.saveState('environment', environment)

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      return 'safe-exit'
    }

    // Get variables from the event context
    const body = context.payload.comment.body.trim()
    const issue_number = context.payload.issue.number
    const {owner, repo} = context.repo

    // Create an octokit client
    const octokit = github.getOctokit(token)

    // Check if the comment is a trigger and what type of trigger it is
    const isDeploy = await triggerCheck(prefixOnly, body, trigger)
    const isLock = await triggerCheck(prefixOnly, body, lock_trigger)

    if (!isDeploy && !isLock) {
      core.saveState('bypass', 'true')
      core.setOutput('triggered', 'false')
      return 'safe-exit'
    } else if (isDeploy && isLock) {
      core.saveState('bypass', 'true')
      core.setOutput('triggered', 'false')
      core.setFailed('Command contains two triggers, only one is allowed')
      return 'safe-exit'
    } else if (isDeploy) {
      core.setOutput('triggered', 'true')
      core.setOutput('type', 'deploy')
    } else if (isLock) {
      core.setOutput('triggered', 'true')
      core.setOutput('type', 'lock')
    }

    // Add the reaction to the issue_comment which triggered the Action
    const reactRes = await reactEmote(reaction, context, octokit)
    core.setOutput('comment_id', context.payload.comment.id)
    core.saveState('comment_id', context.payload.comment.id)

    // If the command is a lock request, attempt to claim the lock - using a sticky lock
    if (isLock) {
      // Check to ensure the user has valid permissions
      const validPermissionsRes = await validPermissions(context, octokit)
      // If the user doesn't have valid permissions, return an error
      if (validPermissionsRes !== true) {
        await actionStatus(
          context,
          octokit,
          reactRes.data.id,
          validPermissionsRes
        )
        // Set the bypass state to true so that the post run logic will not run
        core.saveState('bypass', 'true')
        core.setFailed(validPermissionsRes)
        return 'failure'
      }

      // Get the ref to use with the lock request
      const pr = await octokit.rest.pulls.get({
        ...context.repo,
        pull_number: context.issue.number
      })

      // Send the lock request
      await lock(octokit, context, pr.data.head.ref, reason, reactRes.data.id, true)
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

    // Execute prechecks to ensure the Action can proceed
    const precheckResults = await prechecks(
      body,
      trigger,
      noop_trigger,
      update_branch,
      stable_branch,
      issue_number,
      context,
      octokit
    )
    core.setOutput('ref', precheckResults.ref)
    core.saveState('ref', precheckResults.ref)

    // If the prechecks failed, run the actionFailed function and return
    if (!precheckResults.status) {
      await actionStatus(
        context,
        octokit,
        reactRes.data.id,
        precheckResults.message
      )
      // Set the bypass state to true so that the post run logic will not run
      core.saveState('bypass', 'true')
      core.setFailed(precheckResults.message)
      return 'failure'
    }

    // Aquire the branch-deploy lock for non-sticky requests

    // Set outputs for noopMode
    var noop
    if (precheckResults.noopMode) {
      noop = 'true'
      core.setOutput('noop', noop)
      core.setOutput('continue', 'true')
      core.saveState('noop', noop)
      core.info('noop mode detected')
      // If noop mode is enabled, return
      return 'success - noop'
    } else {
      noop = 'false'
      core.setOutput('noop', noop)
      core.saveState('noop', noop)
    }

    // Get required_contexts for the deployment
    var requiredContexts = []
    if (
      required_contexts &&
      required_contexts !== '' &&
      required_contexts !== 'false'
    ) {
      requiredContexts = required_contexts.split(',').map(function (item) {
        return item.trim()
      })
    }

    // Create a new deployment
    const {data: createDeploy} = await octokit.rest.repos.createDeployment({
      owner: owner,
      repo: repo,
      ref: precheckResults.ref,
      required_contexts: requiredContexts
    })
    core.saveState('deployment_id', createDeploy.id)

    // If a merge to the base branch is required, let the user know and exit
    if (
      typeof createDeploy.id === 'undefined' &&
      createDeploy.message.includes('Auto-merged')
    ) {
      const mergeMessage = dedent(`
        ### ⚠️ Deployment Warning

        - Message: ${createDeploy.message}
        - Note: If you have required CI checks, you may need to manually push a commit to re-run them

        > Deployment will not continue. Please try again once this branch is up-to-date with the base branch
        `)
      await actionStatus(context, octokit, reactRes.data.id, mergeMessage)
      core.warning(mergeMessage)
      // Enable bypass for the post deploy step since the deployment is not complete
      core.saveState('bypass', 'true')
      return 'safe-exit'
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

    core.setOutput('continue', 'true')

    return 'success'
  } catch (error) {
    if (error instanceof Error) {
      core.saveState('bypass', 'true')
      core.setFailed(error.message)
    }
  }
}

/* istanbul ignore next */
if (core.getState('isPost') === 'true') {
  post()
} else {
  if (process.env.CI === 'true') {
    run()
  }
}
