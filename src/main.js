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
import {identicalCommitCheck} from './functions/identical-commit-check'
import {help} from './functions/help'
import {LOCK_METADATA} from './functions/lock-metadata'
import * as github from '@actions/github'
import {context} from '@actions/github'
import dedent from 'dedent-js'

// :returns: 'success', 'success - noop', 'success - merge deploy mode', 'failure', 'safe-exit', or raises an error
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
    const production_environment = core.getInput('production_environment')
    const environment_targets = core.getInput('environment_targets')
    const unlock_trigger = core.getInput('unlock_trigger')
    const help_trigger = core.getInput('help_trigger')
    const lock_info_alias = core.getInput('lock_info_alias')
    const global_lock_flag = core.getInput('global_lock_flag')
    const update_branch = core.getInput('update_branch')
    const required_contexts = core.getInput('required_contexts')
    const allowForks = core.getInput('allow_forks') === 'true'
    const skipCi = core.getInput('skip_ci')
    const skipReviews = core.getInput('skip_reviews')
    const mergeDeployMode = core.getInput('merge_deploy_mode') === 'true'
    const admins = core.getInput('admins')
    const environment_urls = core.getInput('environment_urls')

    // Create an octokit client
    const octokit = github.getOctokit(token)

    // Set the state so that the post run logic will trigger
    core.saveState('isPost', 'true')
    core.saveState('actionsToken', token)

    // If we are running in the merge deploy mode, run commit checks
    if (mergeDeployMode) {
      identicalCommitCheck(octokit, context, environment)
      // always bypass post run logic as they is an entirely alternate workflow from the core branch-deploy Action
      core.saveState('bypass', 'true')
      return 'success - merge deploy mode'
    }

    // Get the body of the IssueOps command
    const body = context.payload.comment.body.trim()

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      return 'safe-exit'
    }

    // Get variables from the event context
    const issue_number = context.payload.issue.number
    const {owner, repo} = context.repo

    // Check if the comment is a trigger and what type of trigger it is
    const isDeploy = await triggerCheck(prefixOnly, body, trigger)
    const isLock = await triggerCheck(prefixOnly, body, lock_trigger)
    const isUnlock = await triggerCheck(prefixOnly, body, unlock_trigger)
    const isHelp = await triggerCheck(prefixOnly, body, help_trigger)
    const isLockInfoAlias = await triggerCheck(
      prefixOnly,
      body,
      lock_info_alias
    )

    // Loop through all the triggers and check if there are multiple triggers
    // If multiple triggers are activated, exit (this is not allowed)
    var multipleTriggers = false
    for (const trigger of [
      isDeploy,
      isLock,
      isUnlock,
      isHelp,
      isLockInfoAlias
    ]) {
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

    if (!isDeploy && !isLock && !isUnlock && !isHelp && !isLockInfoAlias) {
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
    } else if (isHelp) {
      core.setOutput('type', 'help')
    } else if (isLockInfoAlias) {
      core.setOutput('type', 'lock-info-alias')
    }

    // If we made it this far, the action has been triggered in one manner or another
    core.setOutput('triggered', 'true')

    // Add the reaction to the issue_comment which triggered the Action
    const reactRes = await reactEmote(reaction, context, octokit)
    core.setOutput('comment_id', context.payload.comment.id)
    core.saveState('comment_id', context.payload.comment.id)
    core.setOutput('initial_reaction_id', reactRes.data.id)
    core.saveState('reaction_id', reactRes.data.id)
    core.setOutput('actor_handle', context.payload.comment.user.login)

    // If the command is a help request
    if (isHelp) {
      core.debug('help command detected')
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

      // rollup all the inputs into a single object
      const inputs = {
        trigger: trigger,
        reaction: reaction,
        prefixOnly: prefixOnly,
        environment: environment,
        stable_branch: stable_branch,
        noop_trigger: noop_trigger,
        lock_trigger: lock_trigger,
        production_environment: production_environment,
        environment_targets: environment_targets,
        unlock_trigger: unlock_trigger,
        global_lock_flag: global_lock_flag,
        help_trigger: help_trigger,
        lock_info_alias: lock_info_alias,
        update_branch: update_branch,
        required_contexts: required_contexts,
        allowForks: allowForks,
        skipCi: skipCi,
        skipReviews: skipReviews,
        admins: admins
      }

      // Run the help command and exit
      await help(octokit, context, reactRes.data.id, inputs)
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

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

      // Check if the environment being locked/unlocked is a valid environment
      const lockEnvTargetCheckObj = await environmentTargets(
        environment, // the default environment from the Actions inputs
        body, // the body of the comment
        lock_trigger,
        unlock_trigger,
        null, // the stable_branch is not used for lock/unlock
        context, // the context object
        octokit, // the octokit object
        reactRes.data.id,
        true // lockChecks set to true as this is for lock/unlock requests
      )

      // extract the environment target from the lockEnvTargetCheckObj
      const lockEnvTargetCheck = lockEnvTargetCheckObj.environment

      // If the environment targets are not valid, then exit
      if (!lockEnvTargetCheck) {
        core.debug('No valid environment targets found for lock/unlock request')
        return 'safe-exit'
      }

      // If it is a lock or lock info releated request
      if (isLock || isLockInfoAlias) {
        // If the lock request is only for details
        if (
          LOCK_METADATA.lockInfoFlags.some(
            substring => body.includes(substring) === true
          ) ||
          isLockInfoAlias === true
        ) {
          // Get the lock details from the lock file
          const lockResponse = await lock(
            octokit,
            context,
            null, // ref
            reactRes.data.id,
            null, // sticky
            null, // environment (we will find this in the lock function)
            true // details only flag
          )
          // extract values from the lock response
          const lockData = lockResponse.lockData
          const lockStatus = lockResponse.status

          // If a lock was found
          if (lockStatus !== null) {
            // Find the total time since the lock was created
            const totalTime = await timeDiff(
              lockData.created_at,
              new Date().toISOString()
            )

            // special comment for global deploy locks
            let globalMsg = ''
            let environmentMsg = `- __Environment__: \`${lockData.environment}\``
            let lockBranchName = `${lockData.environment}-${LOCK_METADATA.lockBranchSuffix}`
            if (lockData.global === true) {
              globalMsg = dedent(`

              This is a **global** deploy lock - All environments are currently locked

              `)
              environmentMsg = dedent(`
              - __Environments__: \`all\`
              - __Global__: \`true\`
              `)
              core.info('there is a global deployment lock on this repository')
              lockBranchName = LOCK_METADATA.globalLockBranch
            }

            // Format the lock details message
            const lockMessage = dedent(`
            ### Lock Details 🔒

            The deployment lock is currently claimed by __${lockData.created_by}__${globalMsg}

            - __Reason__: \`${lockData.reason}\`
            - __Branch__: \`${lockData.branch}\`
            - __Created At__: \`${lockData.created_at}\`
            - __Created By__: \`${lockData.created_by}\`
            - __Sticky__: \`${lockData.sticky}\`
            ${environmentMsg}
            - __Comment Link__: [click here](${lockData.link})
            - __Lock Link__: [click here](${process.env.GITHUB_SERVER_URL}/${owner}/${repo}/blob/${lockBranchName}/${LOCK_METADATA.lockFile})

            The current lock has been active for \`${totalTime}\`

            > If you need to release the lock, please comment \`${lockData.unlock_command}\`
            `)

            // Update the issue comment with the lock details
            await actionStatus(
              context,
              octokit,
              reactRes.data.id,
              lockMessage,
              true,
              true
            )
            core.info(
              `the deployment lock is currently claimed by __${lockData.created_by}__`
            )
          } else if (lockStatus === null) {
            // format the lock details message
            var lockCommand
            var lockTarget
            if (lockResponse.global) {
              lockTarget = 'global'
              lockCommand = `${lock_trigger} ${lockResponse.globalFlag}`
            } else {
              lockTarget = lockResponse.environment
              lockCommand = `${lock_trigger} ${lockTarget}`
            }

            const lockMessage = dedent(`
            ### Lock Details 🔒

            No active \`${lockTarget}\` deployment locks found for the \`${owner}/${repo}\` repository

            > If you need to create a \`${lockTarget}\` lock, please comment \`${lockCommand}\`
            `)

            await actionStatus(
              context,
              octokit,
              reactRes.data.id,
              lockMessage,
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
        await lock(
          octokit,
          context,
          pr.data.head.ref,
          reactRes.data.id,
          true, // sticky
          null, // environment (we will find this in the lock function)
          false // details only flag
        )
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
    const environmentObj = await environmentTargets(
      environment, // environment
      body, // comment body
      trigger, // trigger
      noop_trigger, // noop trigger
      stable_branch, // ref
      context, // context object
      octokit, // octokit object
      reactRes.data.id, // reaction id
      false, // lockChecks set to false as this is for a deployment
      environment_urls // environment_urls action input
    )

    // deconstruct the environment object to get the environment
    environment = environmentObj.environment

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
      skipCi,
      skipReviews,
      environment,
      context,
      octokit
    )
    core.setOutput('ref', precheckResults.ref)
    core.saveState('ref', precheckResults.ref)
    core.setOutput('sha', precheckResults.sha)

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
    const lockResponse = await lock(
      octokit,
      context,
      precheckResults.ref,
      reactRes.data.id,
      false, // sticky
      environment
    )

    // If the lock request fails, exit the Action
    if (lockResponse.status === false) {
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

    // Check if the environment is a production_environment
    var productionEnvironment = false
    if (environment === production_environment.trim()) {
      productionEnvironment = true
    }
    core.debug(`production_environment: ${productionEnvironment}`)

    // if update_branch is set to 'disabled', then set auto_merge to false, otherwise set it to true
    const auto_merge = update_branch === 'disabled' ? false : true

    // Create a new deployment
    const {data: createDeploy} = await octokit.rest.repos.createDeployment({
      owner: owner,
      repo: repo,
      ref: precheckResults.ref,
      auto_merge: auto_merge,
      required_contexts: requiredContexts,
      environment: environment,
      // description: "",
      // :description note: Short description of the deployment.
      production_environment: productionEnvironment,
      // :production_environment note: specifies if the given environment is one that end-users directly interact with. Default: true when environment is production and false otherwise.
      payload: {
        type: 'branch-deploy'
      }
    })
    core.setOutput('deployment_id', createDeploy.id)
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
