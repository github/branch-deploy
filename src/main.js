import * as core from '@actions/core'
import {triggerCheck} from './functions/trigger-check'
import {contextCheck} from './functions/context-check'
import {reactEmote} from './functions/react-emote'
import {environmentTargets} from './functions/environment-targets'
import {actionStatus} from './functions/action-status'
import {createDeploymentStatus} from './functions/deployment'
import {prechecks} from './functions/prechecks'
import {validPermissions} from './functions/valid-permissions'
import {lock} from './functions/lock'
import {unlock} from './functions/unlock'
import {post} from './functions/post'
import {timeDiff} from './functions/time-diff'
import * as github from '@actions/github'
import {context} from '@actions/github'
import dedent from 'dedent-js'

// Lock constants
const LOCK_BRANCH = 'branch-deploy-lock'
const LOCK_FILE = 'lock.json'
const BASE_URL = 'https://github.com'

// Lock info flags
const LOCK_INFO_FLAGS = ['--info', '--i', '-i', '-d', '--details', '--d']

// :returns: 'success', 'success - noop', 'failure', 'safe-exit', or raises an error
export async function run() {
  try {
    // Get the inputs for the branch-deploy Action
    const trigger = core.getInput('trigger')
    const reaction = core.getInput('reaction')
    const prefixOnly = core.getInput('prefix_only') === 'true'
    const token = core.getInput('github_token', {required: true})
    var environment = core.getInput('environment', {required: true})
    const stable_branch = core.getInput('stable_branch')
    const noop_trigger = core.getInput('noop_trigger')
    const lock_trigger = core.getInput('lock_trigger')
    const unlock_trigger = core.getInput('unlock_trigger')
    const lock_info_alias = core.getInput('lock_info_alias')
    const update_branch = core.getInput('update_branch')
    const required_contexts = core.getInput('required_contexts')
    const allowForks = core.getInput('allow_forks') === 'true'

    // Set the state so that the post run logic will trigger
    core.saveState('isPost', 'true')
    core.saveState('actionsToken', token)

    // Get the body of the IssueOps command
    const body = context.payload.comment.body.trim()

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      return 'safe-exit'
    }

    // Get variables from the event context
    const issue_number = context.payload.issue.number
    const {owner, repo} = context.repo

    // Create an octokit client
    const octokit = github.getOctokit(token)

    // Check if the comment is a trigger and what type of trigger it is
    const isDeploy = await triggerCheck(prefixOnly, body, trigger)
    const isLock = await triggerCheck(prefixOnly, body, lock_trigger)
    const isUnlock = await triggerCheck(prefixOnly, body, unlock_trigger)
    const isLockInfoAlias = await triggerCheck(
      prefixOnly,
      body,
      lock_info_alias
    )

    // Loop through all the triggers and check if there are multiple triggers
    // If multiple triggers are activated, exit (this is not allowed)
    var multipleTriggers = false
    for (const trigger of [isDeploy, isLock, isUnlock, isLockInfoAlias]) {
      if (trigger) {
        if (multipleTriggers) {
          core.saveState('bypass', 'true')
          core.setOutput('triggered', 'false')
          core.info(`body: ${body}`)
          core.setFailed(
            'IssueOps message contains multiple commands, only one is allowed'
          )
          return 'failure'
        }
        multipleTriggers = true
      }
    }

    if (!isDeploy && !isLock && !isUnlock && !isLockInfoAlias) {
      // If the comment does not activate any triggers, exit
      core.saveState('bypass', 'true')
      core.setOutput('triggered', 'false')
      core.debug('No trigger found')
      return 'safe-exit'
    } else if (isDeploy) {
      core.setOutput('type', 'deploy')
    } else if (isLock) {
      core.setOutput('type', 'lock')
    } else if (isUnlock) {
      core.setOutput('type', 'unlock')
    } else if (isLockInfoAlias) {
      core.setOutput('type', 'lock-info-alias')
    }

    // If we made it this far, the action has been triggered in one manner or another
    core.setOutput('triggered', 'true')

    // Add the reaction to the issue_comment which triggered the Action
    const reactRes = await reactEmote(reaction, context, octokit)
    core.setOutput('comment_id', context.payload.comment.id)
    core.saveState('comment_id', context.payload.comment.id)
    core.saveState('reaction_id', reactRes.data.id)

    // If the command is a lock/unlock request
    if (isLock || isUnlock || isLockInfoAlias) {
      // Check to ensure the user has valid permissions
      const validPermissionsRes = await validPermissions(octokit, context)
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

      // If it is a lock or lock info releated request
      if (isLock || isLockInfoAlias) {
        // If the lock request is only for details
        if (
          LOCK_INFO_FLAGS.some(
            substring => body.includes(substring) === true
          ) ||
          isLockInfoAlias === true
        ) {
          // Get the lock details from the lock file
          const lockData = await lock(
            octokit,
            context,
            null,
            reactRes.data.id,
            null,
            true
          )

          // If a lock was found
          if (lockData !== null) {
            // Find the total time since the lock was created
            const totalTime = await timeDiff(
              lockData.created_at,
              new Date().toISOString()
            )

            // Format the lock details message
            const lockMessage = dedent(`
            ### Lock Details 🔒

            The deployment lock is currently claimed by __${lockData.created_by}__
        
            - __Reason__: \`${lockData.reason}\`
            - __Branch__: \`${lockData.branch}\`
            - __Created At__: \`${lockData.created_at}\`
            - __Created By__: \`${lockData.created_by}\`
            - __Sticky__: \`${lockData.sticky}\`
            - __Comment Link__: [click here](${lockData.link})
            - __Lock Link__: [click here](${BASE_URL}/${owner}/${repo}/blob/${LOCK_BRANCH}/${LOCK_FILE})
        
            The current lock has been active for \`${totalTime}\`
        
            > If you need to release the lock, please comment \`${unlock_trigger}\`
            `)

            // Update the issue comment with the lock details
            await actionStatus(
              context,
              octokit,
              reactRes.data.id,
              // eslint-disable-next-line no-regex-spaces
              lockMessage.replace(new RegExp('    ', 'g'), ''),
              true,
              true
            )
            core.info(
              `the deployment lock is currently claimed by __${lockData.created_by}__`
            )
          } else if (lockData === null) {
            const lockMessage = dedent(`
            ### Lock Details 🔒
        
            No active deployment locks found for the \`${owner}/${repo}\` repository
        
            > If you need to create a lock, please comment \`${lock_trigger}\`
            `)

            await actionStatus(
              context,
              octokit,
              reactRes.data.id,
              // eslint-disable-next-line no-regex-spaces
              lockMessage.replace(new RegExp('    ', 'g'), ''),
              true,
              true
            )
            core.info('no active deployment locks found')
          }

          // Exit the action since we are done after obtaining only the lock details with --details
          core.saveState('bypass', 'true')
          return 'safe-exit'
        }

        // If the request is a lock request, attempt to claim the lock with a sticky request with the logic below

        // Get the ref to use with the lock request
        const pr = await octokit.rest.pulls.get({
          ...context.repo,
          pull_number: context.issue.number
        })

        // Send the lock request
        const sticky = true
        await lock(octokit, context, pr.data.head.ref, reactRes.data.id, sticky)
        core.saveState('bypass', 'true')
        return 'safe-exit'
      }

      // If the request is an unlock request, attempt to release the lock
      if (isUnlock) {
        await unlock(octokit, context, reactRes.data.id)
        core.saveState('bypass', 'true')
        return 'safe-exit'
      }
    }

    // Check if the default environment is being overwritten by an explicit environment
    environment = await environmentTargets(
      environment,
      body,
      trigger,
      noop_trigger,
      stable_branch,
      context,
      octokit,
      reactRes.data.id
    )

    // If the environment targets are not valid, then exit
    if (!environment) {
      core.debug('No valid environment targets found')
      return 'safe-exit'
    }

    core.info(`environment: ${environment}`)
    core.saveState('environment', environment)
    core.setOutput('environment', environment)

    // Execute prechecks to ensure the Action can proceed
    const precheckResults = await prechecks(
      body,
      trigger,
      noop_trigger,
      update_branch,
      stable_branch,
      issue_number,
      allowForks,
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
    // If the lock request fails, exit the Action
    const sticky = false
    if (
      !(await lock(
        octokit,
        context,
        precheckResults.ref,
        reactRes.data.id,
        sticky
      ))
    ) {
      return 'safe-exit'
    }

    // Add a comment to the PR letting the user know that a deployment has been started
    // Format the success message
    var deploymentType
    if (precheckResults.noopMode) {
      deploymentType = 'noop'
    } else {
      deploymentType = 'branch'
    }
    const log_url = `${process.env.GITHUB_SERVER_URL}/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
    const commentBody = dedent(`
      ### Deployment Triggered 🚀

      __${context.actor}__, started a __${deploymentType}__ deployment to __${environment}__

      You can watch the progress [here](${log_url}) 🔗

      > __Branch__: \`${precheckResults.ref}\`
    `)

    // Make a comment on the PR
    await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: context.issue.number,
      body: commentBody
    })

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
    core.saveState('bypass', 'true')
    core.error(error.stack)
    core.setFailed(error.message)
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
