import * as core from '@actions/core'
import * as github from '@actions/github'
import {context} from '@actions/github'
import {retry} from '@octokit/plugin-retry'
import dedent from 'dedent-js'

import {VERSION} from './version.js'
import {triggerCheck} from './functions/trigger-check.js'
import {contextCheck} from './functions/context-check.js'
import {nakedCommandCheck} from './functions/naked-command-check.js'
import {reactEmote} from './functions/react-emote.js'
import {environmentTargets} from './functions/environment-targets.js'
import {actionStatus} from './functions/action-status.js'
import {createDeploymentStatus} from './functions/deployment.js'
import {isDeprecated} from './functions/deprecated-checks.js'
import {prechecks} from './functions/prechecks.js'
import {branchRulesetChecks} from './functions/branch-ruleset-checks.js'
import {validPermissions} from './functions/valid-permissions.js'
import {lock} from './functions/lock.js'
import {unlock} from './functions/unlock.js'
import {post} from './functions/post.js'
import {timeDiff} from './functions/time-diff.js'
import {identicalCommitCheck} from './functions/identical-commit-check.js'
import {unlockOnClose} from './functions/unlock-on-close.js'
import {unlockOnMerge} from './functions/unlock-on-merge.js'
import {help} from './functions/help.js'
import {LOCK_METADATA} from './functions/lock-metadata.js'
import {COLORS} from './functions/colors.js'
import {getInputs} from './functions/inputs.js'
import {constructValidBranchName} from './functions/valid-branch-name.js'
import {validDeploymentOrder} from './functions/valid-deployment-order.js'
import {commitSafetyChecks} from './functions/commit-safety-checks.js'
import {API_HEADERS} from './functions/api-headers.js'
import {timestamp} from './functions/timestamp.js'
import {deploymentConfirmation} from './functions/deployment-confirmation.js'

// :returns: 'success', 'success - noop', 'success - merge deploy mode', 'failure', 'safe-exit', 'success - unlock on merge mode' or raises an error
export async function run() {
  try {
    core.info(`🛸 github/branch-deploy ${COLORS.info}${VERSION}${COLORS.reset}`)
    core.debug(`context: ${JSON.stringify(context)}`)

    // Get the inputs for the branch-deploy Action
    const token = core.getInput('github_token', {required: true})

    // get all the Actions inputs and roll up them into a single object
    const inputs = getInputs()

    // Create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      userAgent: `github/branch-deploy@${VERSION}`,
      additionalPlugins: [retry]
    })

    // Set the state so that the post run logic will trigger
    core.saveState('isPost', 'true')
    core.saveState('actionsToken', token)

    // setup the environment variable which is dynamically set throughout the Action
    var environment = inputs.environment

    // If we are running in the 'unlock on merge' mode, run auto-unlock logic
    if (inputs.unlockOnMergeMode) {
      core.info(`🏃 running in 'unlock on merge' mode`)
      await unlockOnMerge(octokit, context, inputs.environment_targets)
      core.saveState('bypass', 'true')
      return 'success - unlock on merge mode'
    }

    // If we are running in the 'unlock on close' mode, run auto-unlock logic
    if (inputs.unlockOnCloseMode) {
      core.info(`🏃 running in 'unlock on close' mode`)
      await unlockOnClose(octokit, context, inputs.environment_targets)
      core.saveState('bypass', 'true')
      return 'success - unlock on close mode'
    }

    // If we are running in the merge deploy mode, run commit checks
    if (inputs.mergeDeployMode) {
      core.info(`🏃 running in 'merge deploy' mode`)
      await identicalCommitCheck(octokit, context, environment)
      // always bypass post run logic as they is an entirely alternate workflow from the core branch-deploy Action
      core.saveState('bypass', 'true')
      return 'success - merge deploy mode'
    }

    // Get the body of the IssueOps command
    const body = context.payload.comment.body.trim()

    // Check the context of the event to ensure it is valid, return if it is not
    if (!(await contextCheck(context))) {
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

    // deprecated command/input checks
    if ((await isDeprecated(body, octokit, context)) === true) {
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

    if (
      inputs.disable_naked_commands === true &&
      (await nakedCommandCheck(
        body,
        inputs.param_separator,
        [
          inputs.trigger,
          inputs.noop_trigger,
          inputs.lock_trigger,
          inputs.unlock_trigger,
          inputs.lock_info_alias
        ],
        octokit,
        context
      )) === true
    ) {
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

    // Get variables from the event context
    const issue_number = context.payload.issue.number
    const {owner, repo} = context.repo

    // set helpful outputs that can be used in other Actions / steps
    core.setOutput('comment_body', body)
    core.setOutput('issue_number', issue_number)

    // check if the comment is a trigger and what type of trigger it is
    const isDeploy = await triggerCheck(body, inputs.trigger)
    const isNoopDeploy = await triggerCheck(body, inputs.noop_trigger)
    const isLock = await triggerCheck(body, inputs.lock_trigger)
    const isUnlock = await triggerCheck(body, inputs.unlock_trigger)
    const isHelp = await triggerCheck(body, inputs.help_trigger)
    const isLockInfoAlias = await triggerCheck(body, inputs.lock_info_alias)

    if (isDeploy || isNoopDeploy) {
      core.setOutput('type', 'deploy')
    } else if (isLock) {
      core.setOutput('type', 'lock')
    } else if (isUnlock) {
      core.setOutput('type', 'unlock')
    } else if (isHelp) {
      core.setOutput('type', 'help')
    } else if (isLockInfoAlias) {
      core.setOutput('type', 'lock-info-alias')
    } else {
      // if no trigger is detected, exit here
      core.saveState('bypass', 'true')
      core.setOutput('triggered', 'false')
      core.info('⛔ no trigger detected in comment - exiting')
      return 'safe-exit'
    }

    // If we made it this far, the action has been triggered in one manner or another
    core.setOutput('triggered', 'true')

    // Add the reaction to the issue_comment which triggered the Action
    const reactRes = await reactEmote(inputs.reaction, context, octokit)
    core.setOutput('comment_id', context.payload.comment.id)
    core.saveState('comment_id', context.payload.comment.id)
    core.setOutput('initial_reaction_id', reactRes.data.id)
    core.saveState('reaction_id', reactRes.data.id)
    core.setOutput('actor_handle', context.payload.comment.user.login)

    // If the command is a help request
    if (isHelp) {
      core.debug('help command detected')
      // Check to ensure the user has valid permissions
      const validPermissionsRes = await validPermissions(
        octokit,
        context,
        inputs.permissions
      )
      // If the user doesn't have valid permissions, return an error
      if (validPermissionsRes !== true) {
        await actionStatus(
          context,
          octokit,
          reactRes.data.id, // original reaction id
          validPermissionsRes // the message
        )
        // Set the bypass state to true so that the post run logic will not run
        core.saveState('bypass', 'true')
        core.setFailed(validPermissionsRes)
        return 'failure'
      }

      // Run the help command and exit
      await help(octokit, context, reactRes.data.id, inputs)
      core.saveState('bypass', 'true')
      return 'safe-exit'
    }

    // If the command is a lock/unlock request
    if (isLock || isUnlock || isLockInfoAlias) {
      // Check to ensure the user has valid permissions
      const validPermissionsRes = await validPermissions(
        octokit,
        context,
        inputs.permissions
      )
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
        inputs.lock_trigger, // the lock_trigger
        inputs.unlock_trigger, // the unlock_trigger
        null, // the stable_branch is not used for lock/unlock
        context, // the context object
        octokit, // the octokit object
        reactRes.data.id, // the reaction id
        true, // lockChecks set to true as this is for lock/unlock requests
        null, // environment_url is not used for lock/unlock
        null // param_separator is not used for lock/unlock
      )

      // extract the environment target from the lockEnvTargetCheckObj
      const lockEnvTargetCheck = lockEnvTargetCheckObj.environment

      // If the environment targets are not valid, then exit
      if (!lockEnvTargetCheck) {
        core.debug('No valid environment targets found for lock/unlock request')
        return 'safe-exit'
      }

      // If it is a lock or lock info related request
      if (isLock || isLockInfoAlias) {
        // If the lock request is only for details
        if (
          LOCK_METADATA.lockInfoFlags.some(
            substring => body.includes(substring) === true
          ) ||
          isLockInfoAlias === true
        ) {
          core.debug('detailsOnly lock request detected')
          // Get the lock details from the lock file
          const lockResponse = await lock(
            octokit,
            context,
            null, // ref
            reactRes.data.id,
            null, // sticky
            null, // environment (we will find this in the lock function - important)
            true, // details only flag
            false, // postDeployStep
            true, // leaveComment
            null // task (not applicable for details only)
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
            let lockBranchName = `${constructValidBranchName(lockData.environment)}-${LOCK_METADATA.lockBranchSuffix}`
            if (lockData.global === true) {
              globalMsg = dedent(`

              This is a **global** deploy lock - All environments are currently locked

              `)
              environmentMsg = dedent(`
              - __Environments__: \`all\`
              - __Global__: \`true\`
              `)
              core.info(
                `🌏 there is a ${COLORS.highlight}global${COLORS.reset} deployment lock on this repository`
              )
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
              reactRes.data.id, // original reaction id
              lockMessage, // message
              true, // success bool
              true // use the 'alt reaction' bool
            )
            core.info(
              `🔒 the deployment lock is currently claimed by ${COLORS.highlight}${lockData.created_by}`
            )
          } else {
            // format the lock details message
            var lockCommand
            var lockTarget
            if (lockResponse.global) {
              lockTarget = 'global'
              lockCommand = `${inputs.lock_trigger} ${lockResponse.globalFlag}`
            } else {
              lockTarget = lockResponse.environment
              lockCommand = `${inputs.lock_trigger} ${lockTarget}`
            }

            const lockMessage = dedent(`
            ### Lock Details 🔒

            No active \`${lockTarget}\` deployment locks found for the \`${owner}/${repo}\` repository

            > If you need to create a \`${lockTarget}\` lock, please comment \`${lockCommand}\`
            `)

            await actionStatus(
              context,
              octokit,
              reactRes.data.id, // original reaction id
              lockMessage, // message
              true, // success bool
              true // use the 'alt reaction' bool
            )
            core.info('✅ no active deployment locks found')
          }

          // Exit the action since we are done after obtaining only the lock details with --details
          core.saveState('bypass', 'true')
          return 'safe-exit'
        }

        // If the request is a lock request, attempt to claim the lock with a sticky request with the logic below

        // Get the ref to use with the lock request
        const pr = await octokit.rest.pulls.get({
          ...context.repo,
          pull_number: context.issue.number,
          headers: API_HEADERS
        })

        // Send the lock request
        await lock(
          octokit,
          context,
          pr.data.head.ref,
          reactRes.data.id,
          true, // sticky
          null, // environment (we will find this in the lock function)
          false, // details only flag
          false, // postDeployStep
          true, // leaveComment
          null // task (not applicable for sticky locks)
        )
        core.saveState('bypass', 'true')
        return 'safe-exit'
      } else {
        // if it isn't a lock or lock info command, it must be an unlock command
        core.debug('running unlock command logic')
        await unlock(octokit, context, reactRes.data.id)
        core.saveState('bypass', 'true')
        return 'safe-exit'
      }
    }

    // At this point, it must be a 'deploy' or 'noopDeploy' request
    // Check if the default environment is being overwritten by an explicit environment
    const environmentObj = await environmentTargets(
      environment, // environment
      body, // comment body
      inputs.trigger, // trigger
      inputs.noop_trigger, // noop trigger
      inputs.stable_branch, // ref
      context, // context object
      octokit, // octokit object
      reactRes.data.id, // reaction id
      false, // lockChecks set to false as this is for a deployment
      inputs.environment_urls, // environment_urls action input
      inputs.param_separator // param_separator action input
    )

    // convert the environmentObj to a json string and debug log it
    core.debug(`environmentObj: ${JSON.stringify(environmentObj)}`)

    // deconstruct the environment object to get the environment
    environment = environmentObj.environment

    // deconstruct the environment object to get the stable_branch_used value
    const stableBranchUsed = environmentObj.environmentObj.stable_branch_used

    // Final params computed by environment
    const params = environmentObj.environmentObj.params
    const parsed_params = environmentObj.environmentObj.parsed_params

    // Extract task from parsed environment object
    const task = environmentObj.environmentObj.task

    // Validate task against allowed tasks if task support is enabled
    if (task !== null && task !== undefined) {
      if (inputs.deployment_task === '') {
        // Task support is disabled
        const message = dedent(`
          ### ⚠️ Task Support Not Enabled

          You specified \`--task ${task}\` but task support is not enabled.

          To enable task support, set the \`deployment_task\` input to either:
          - \`"all"\` to allow any task name
          - A comma-separated list of allowed tasks (e.g., \`"frontend,backend,api"\`)
        `)
        await actionStatus(context, octokit, reactRes.data.id, message)
        core.saveState('bypass', 'true')
        core.setFailed(
          `Task support not enabled but --task ${task} was specified`
        )
        return 'failure'
      } else if (
        inputs.deployment_task !== 'all' &&
        !inputs.deployment_task.includes(task)
      ) {
        // Task is not in the allowed list
        const allowedTasks =
          typeof inputs.deployment_task === 'string'
            ? inputs.deployment_task
            : inputs.deployment_task.join(', ')
        const message = dedent(`
          ### ⚠️ Invalid Task

          The task \`${task}\` is not in the list of allowed tasks.

          Allowed tasks: \`${allowedTasks}\`
        `)
        await actionStatus(context, octokit, reactRes.data.id, message)
        core.saveState('bypass', 'true')
        core.setFailed(
          `Task ${task} is not in the allowed list: ${allowedTasks}`
        )
        return 'failure'
      }
    }

    // If the environment targets are not valid, then exit
    if (!environment) {
      core.debug('No valid environment targets found')
      return 'safe-exit'
    }

    core.info(`🌍 environment: ${COLORS.highlight}${environment}`)
    core.saveState('environment', environment)
    core.setOutput('environment', environment)

    const data = {
      environment: environment,
      environmentObj: environmentObj.environmentObj,
      issue_number: issue_number,
      inputs: inputs
    }

    // Execute prechecks to ensure the Action can proceed
    const precheckResults = await prechecks(context, octokit, data)
    core.setOutput('ref', precheckResults.ref)
    core.saveState('ref', precheckResults.ref)
    core.setOutput('sha', precheckResults.sha)
    core.saveState('sha', precheckResults.sha)
    core.debug(`precheckResults.sha: ${precheckResults.sha}`)

    // If the prechecks failed, run the actionStatus function and return
    // note: if we don't pass in the 'success' bool, actionStatus will default to failure mode
    if (!precheckResults.status) {
      await actionStatus(
        context,
        octokit,
        reactRes.data.id, // original reaction id
        precheckResults.message // message
      )
      // Set the bypass state to true so that the post run logic will not run
      core.saveState('bypass', 'true')
      core.setFailed(precheckResults.message)
      return 'failure'
    }

    // run branch ruleset checks
    await branchRulesetChecks(context, octokit, {
      branch: inputs.stable_branch,
      use_security_warnings: inputs.use_security_warnings
    })

    // fetch commit data from the API
    const commitData = await octokit.rest.repos.getCommit({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: precheckResults.sha, // exact SHAs can be used here in the ref parameter (which is what we want)
      headers: API_HEADERS
    })

    const committer = commitData.data?.committer?.login
    const commit_html_url = commitData.data.html_url

    if (committer === null || committer === undefined) {
      core.warning(
        '⚠️ could not find the login of the committer - https://github.com/github/branch-deploy/issues/379'
      )
    }

    // Run commit safety checks
    const commitSafetyCheckResults = await commitSafetyChecks(context, {
      commit: commitData.data.commit,
      sha: commitData.data.sha,
      inputs: inputs
    })

    // If the commitSafetyCheckResults failed, run the actionStatus function and return
    // note: if we don't pass in the 'success' bool, actionStatus will default to failure mode
    if (!commitSafetyCheckResults.status && stableBranchUsed !== true) {
      await actionStatus(
        context,
        octokit,
        reactRes.data.id, // original reaction id
        commitSafetyCheckResults.message // message
      )
      // Set the bypass state to true so that the post run logic will not run
      core.saveState('bypass', 'true')
      core.setFailed(commitSafetyCheckResults.message)
      return 'failure'
    } else if (!commitSafetyCheckResults.status && stableBranchUsed === true) {
      core.warning(
        'commit safety checks failed but the stable branch is being used so the workflow will continue - you should inspect recent commits on this branch as a precaution'
      )
    }

    // check for enforced deployment order if the input was provided and we are NOT deploying to the stable branch
    if (
      inputs.enforced_deployment_order.length > 0 &&
      stableBranchUsed !== true
    ) {
      const deploymentOrderResults = await validDeploymentOrder(
        octokit,
        context,
        inputs.enforced_deployment_order,
        environment,
        precheckResults.sha,
        task || null
      )

      if (!deploymentOrderResults.valid) {
        // construct a colorized list of the previous environments that do not have active deployments
        const combined_environments = deploymentOrderResults.results
          .map(result => {
            const color = result.active ? COLORS.success : COLORS.error
            return `${color}${result.environment}${COLORS.reset}`
          })
          .join(',')

        // construct a markdown message with checks or x's for each environment in an ordered list
        const combined_environments_markdown = deploymentOrderResults.results
          .map(result => {
            const emoji = result.active ? '🟢' : '🔴'
            return `- ${emoji} **${result.environment}**`
          })
          .join('\n')

        // format the error message
        const enforced_deployment_order_failure_message = dedent(`
            ### 🚦 Invalid Deployment Order

            The deployment to \`${environment}\` cannot be proceed as the following environments need successful deployments first:

            ${combined_environments_markdown}
          `)

        await actionStatus(
          context,
          octokit,
          reactRes.data.id, // original reaction id
          enforced_deployment_order_failure_message // message
        )
        // Set the bypass state to true so that the post run logic will not run
        core.saveState('bypass', 'true')
        core.setFailed(
          `🚦 deployment order checks failed as not all previous environments have active deployments: ${combined_environments}`
        )

        return 'failure'
      }
    }

    // conditionally handle how we want to apply locks on deployments
    core.info(
      `🍯 sticky_locks: ${COLORS.highlight}${inputs.sticky_locks}${COLORS.reset}`
    )
    core.info(
      `🍯 sticky_locks_for_noop: ${COLORS.highlight}${inputs.sticky_locks_for_noop}${COLORS.reset}`
    )
    var stickyLocks
    // if sticky_locks is true, then we will use the sticky_locks logic
    // if sticky_locks_for_noop is also true, then we will also use the sticky_locks logic for noop deployments
    // if sticky_locks is false, then no sticky locks will be applied and only non-sticky locks will be used
    // if sticky_locks is true but sticky_locks_for_noop is false, then we will only use sticky locks on non-noop deployments
    if (precheckResults.noopMode) {
      if (inputs.sticky_locks_for_noop) {
        stickyLocks = true
      } else {
        stickyLocks = false
      }
      core.debug(`🔒 noop mode detected and using stickyLocks: ${stickyLocks}`)
    } else {
      stickyLocks = inputs.sticky_locks
    }

    // if we are using sticky_locks in deployments, don't leave a comment as this is inferred by the user
    const leaveComment = stickyLocks === false ? true : false

    core.debug(`🔒 stickyLocks: ${stickyLocks}`)
    core.debug(`💬 leaveComment: ${leaveComment}`)

    // Aquire the branch-deploy lock
    const lockResponse = await lock(
      octokit,
      context,
      precheckResults.ref,
      reactRes.data.id,
      stickyLocks, // sticky / hubot style locks - true/false depending on the input
      environment, // environment
      null, // details only flag
      false, // postDeployStep
      leaveComment, // leaveComment - true/false depending on the input
      task || null, // task for concurrent deployments
      issue_number
    )

    // If the lock request fails, exit the Action
    if (lockResponse.status === false) {
      return 'safe-exit'
    }

    const github_run_id = parseInt(process.env.GITHUB_RUN_ID)

    // Add a comment to the PR letting the user know that a deployment has been started
    // Format the success message
    var deploymentType
    if (precheckResults.noopMode) {
      deploymentType = 'noop'
    } else {
      deploymentType =
        environmentObj.environmentObj.sha !== null ? 'sha' : 'branch'
    }
    const log_url = `${process.env.GITHUB_SERVER_URL}/${context.repo.owner}/${context.repo.repo}/actions/runs/${github_run_id}`

    // if the deployment_confirmation is set to 'true', then we will prompt the user to confirm the deployment
    if (inputs.deployment_confirmation === true) {
      const deploymentConfirmed = await deploymentConfirmation(
        context,
        octokit,
        {
          sha: precheckResults.sha,
          ref: precheckResults.ref,
          deploymentType: deploymentType,
          environment: environment,
          environmentUrl: environmentObj.environmentUrl,
          deployment_confirmation_timeout:
            inputs.deployment_confirmation_timeout,
          isVerified: commitSafetyCheckResults.isVerified,
          log_url: log_url,
          body: body,
          params: params,
          parsed_params: parsed_params,
          github_run_id: github_run_id,
          noopMode: precheckResults.noopMode,
          isFork: precheckResults.isFork,
          committer: committer,
          commit_html_url: commit_html_url
        }
      )
      if (deploymentConfirmed === true) {
        core.debug(
          `deploymentConfirmation() was successful - continuing with the deployment`
        )
      } else {
        // Set the bypass state to true so that the post run logic will not run
        core.saveState('bypass', 'true')
        core.debug(`❌ deployment not confirmed - exiting`)
        return 'failure'
      }
    }

    // this is the timestamp that we consider the deployment to have "started" at for logging and auditing purposes
    // it is not the exact time the deployment started, but it is very close
    const deployment_start_time = timestamp()
    core.debug(`deployment_start_time: ${deployment_start_time}`)
    core.saveState('deployment_start_time', deployment_start_time)

    const commentBody = dedent(`
      ### Deployment Triggered 🚀

      __${
        context.actor
      }__, started a __${deploymentType}__ deployment to __${environment}__ (${deploymentType}: \`${precheckResults.ref}\`)

      You can watch the progress [here](${log_url}) 🔗

      <details><summary>Details</summary>

      <!--- pre-deploy-metadata-start -->

      \`\`\`json
      {
        "type": "${deploymentType.toLowerCase()}",
        "environment": {
          "name": "${environment}",
          "url": ${environmentObj.environmentUrl ? `"${environmentObj.environmentUrl}"` : null}
        },
        "deployment": {
          "timestamp": "${deployment_start_time}",
          "logs": "${log_url}"
        },
        "git": {
          "branch": "${precheckResults.ref}",
          "commit": "${precheckResults.sha}",
          "verified": ${commitSafetyCheckResults.isVerified},
          "committer": "${committer}",
          "html_url": "${commit_html_url}"
        },
        "context": {
          "actor": "${context.actor}",
          "noop": ${precheckResults.noopMode},
          "fork": ${precheckResults.isFork},
          "comment": {
            "created_at": "${context.payload.comment.created_at}",
            "updated_at": "${context.payload.comment.updated_at}",
            "body": "${body}",
            "html_url": "${context.payload.comment.html_url}"
          }
        },
        "parameters": {
          "raw": ${params ? `"${params}"` : null},
          "parsed": ${parsed_params ? `${JSON.stringify(parsed_params)}` : null}
        }
      }
      \`\`\`

      <!--- pre-deploy-metadata-end -->

      </details>
    `)

    // Make a comment on the PR
    const deploymentStartedComment = await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: context.issue.number,
      body: commentBody,
      headers: API_HEADERS
    })

    // Set output for initial comment id
    core.setOutput('initial_comment_id', deploymentStartedComment.data.id)
    core.saveState('initial_comment_id', deploymentStartedComment.data.id)

    // Set outputs for noopMode
    if (precheckResults.noopMode) {
      core.setOutput('noop', precheckResults.noopMode)
      core.setOutput('continue', 'true')
      core.saveState('noop', precheckResults.noopMode)

      core.info(
        `🧑‍🚀 commit sha to noop: ${COLORS.highlight}${precheckResults.sha}${COLORS.reset}`
      )
      core.info(`🚀 ${COLORS.success}deployment started!${COLORS.reset} (noop)`)

      // If noop mode is enabled, return here
      return 'success - noop'
    } else {
      core.setOutput('noop', precheckResults.noopMode)
      core.saveState('noop', precheckResults.noopMode)
    }

    // Get required_contexts for the deployment
    var requiredContexts = []
    if (
      inputs.required_contexts &&
      inputs.required_contexts !== '' &&
      inputs.required_contexts !== 'false'
    ) {
      requiredContexts = inputs.required_contexts
        .split(',')
        .map(function (item) {
          return item.trim()
        })
    }

    // Check if the environment is a production environment
    const isProductionEnvironment =
      inputs.production_environments.includes(environment)
    core.debug(`production_environment: ${isProductionEnvironment}`)

    // if environmentObj.environmentObj.sha is not null, set auto_merge to false,
    // otherwise if update_branch is set to 'disabled', then set auto_merge to false, otherwise set it to true
    // this is important as we cannot reliably merge into the base branch if we are using a SHA
    const auto_merge =
      environmentObj.environmentObj.sha !== null &&
      environmentObj.environmentObj.sha !== undefined
        ? false
        : inputs.update_branch === 'disabled'
          ? false
          : true

    // Construct the deployment payload that will be sent to the GitHub API during the deployment creation
    const payload = {
      type: 'branch-deploy',
      sha: precheckResults.sha,
      params: params,
      parsed_params: parsed_params,
      github_run_id: github_run_id,
      initial_comment_id: context.payload.comment.id,
      initial_reaction_id: reactRes.data.id,
      deployment_started_comment_id: deploymentStartedComment.data.id,
      timestamp: deployment_start_time,
      commit_verified: commitSafetyCheckResults.isVerified,
      actor: context.actor,
      stable_branch_used: stableBranchUsed
    }

    // Determine task parameter for concurrent deployments
    const deployment_task = task || 'deploy' // Default to 'deploy' for backwards compatibility
    const auto_inactive = task ? false : true // Don't auto-inactive when using tasks

    // Create a new deployment
    const {data: createDeploy} = await octokit.rest.repos.createDeployment({
      owner: owner,
      repo: repo,
      ref: precheckResults.ref,
      auto_merge: auto_merge,
      auto_inactive: auto_inactive,
      required_contexts: requiredContexts,
      environment: environment,
      task: deployment_task,
      // description: "",
      // :description note: Short description of the deployment.
      production_environment: isProductionEnvironment,
      // :production_environment note: specifies if the given environment is one that end-users directly interact with. Default: true when environment is production and false otherwise.
      payload: payload,
      headers: API_HEADERS
    })
    core.setOutput('deployment_id', createDeploy.id)
    core.saveState('deployment_id', createDeploy.id)
    core.setOutput('deployment_task', deployment_task)
    core.saveState('deployment_task', deployment_task)

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

    // Debug log information about the deployment that was just created
    core.info(
      `📓 deployment id: ${COLORS.highlight}${createDeploy.id}${COLORS.reset}`
    )
    core.debug(`deployment.url: ${createDeploy.url}`)
    core.debug(`deployment.created_at: ${createDeploy.created_at}`)
    core.debug(`deployment.updated_at: ${createDeploy.updated_at}`)
    core.debug(`deployment.statuses_url: ${createDeploy.statuses_url}`)

    // Set the deployment status to in_progress
    await createDeploymentStatus(
      octokit,
      context,
      precheckResults.ref,
      'in_progress',
      createDeploy.id,
      environment,
      environmentObj.environmentUrl // environment_url (can be null)
    )

    core.info(
      `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${precheckResults.sha}${COLORS.reset}`
    )
    core.info(`🚀 ${COLORS.success}deployment started!${COLORS.reset}`)
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
  /* istanbul ignore next */
  if (
    process.env.CI === 'true' &&
    process.env.BRANCH_DEPLOY_VITEST_TEST !== 'true'
  ) {
    run()
  }
}
