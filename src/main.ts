import * as core from '@actions/core'
import * as github from '@actions/github'
import {context} from '@actions/github'
import {retry} from '@octokit/plugin-retry'
import dedent from 'dedent-js'

import {VERSION} from './version.ts'
import {triggerCheck} from './functions/trigger-check.ts'
import {contextCheck} from './functions/context-check.ts'
import {nakedCommandCheck} from './functions/naked-command-check.ts'
import {reactEmote} from './functions/react-emote.ts'
import {environmentTargets} from './functions/environment-targets.ts'
import {actionStatus} from './functions/action-status.ts'
import {createDeploymentStatus} from './functions/deployment.ts'
import {isDeprecated} from './functions/deprecated-checks.ts'
import {prechecks} from './functions/prechecks.ts'
import {branchRulesetChecks} from './functions/branch-ruleset-checks.ts'
import {validPermissions} from './functions/valid-permissions.ts'
import {lock} from './functions/lock.ts'
import {unlock} from './functions/unlock.ts'
import {post} from './functions/post.ts'
import {timeDiff} from './functions/time-diff.ts'
import {identicalCommitCheck} from './functions/identical-commit-check.ts'
import {unlockOnMerge} from './functions/unlock-on-merge.ts'
import {help} from './functions/help.ts'
import {LOCK_METADATA} from './functions/lock-metadata.ts'
import {COLORS} from './functions/colors.ts'
import {getInputs} from './functions/inputs.ts'
import {constructValidBranchName} from './functions/valid-branch-name.ts'
import {validDeploymentOrder} from './functions/valid-deployment-order.ts'
import {commitSafetyChecks} from './functions/commit-safety-checks.ts'
import {API_HEADERS} from './functions/api-headers.ts'
import {timestamp} from './functions/timestamp.ts'
import {deploymentConfirmation} from './functions/deployment-confirmation.ts'
import {formatLockReason} from './functions/format-lock-reason.ts'
import {
  getActionInput,
  getActionState,
  saveActionState,
  setActionOutput
} from './action-io.ts'
import {
  branchDeployContext,
  createdDeployment,
  issueCommentContext,
  legacyApiError,
  legacyCommitterLogin,
  legacyDeploymentId,
  legacyLockData,
  legacyReactionResult,
  legacyStrictTrue,
  legacyTruthy
} from './trust-boundaries.ts'
import type {RunResult} from './types.ts'

// :returns: 'success', 'success - noop', 'success - merge deploy mode', 'failure', 'safe-exit', 'success - unlock on merge mode' or raises an error
export async function run(): Promise<RunResult> {
  try {
    core.info(`🛸 github/branch-deploy ${COLORS.info}${VERSION}${COLORS.reset}`)
    core.debug(`context: ${JSON.stringify(context)}`)

    // Get the inputs for the branch-deploy Action
    const token = getActionInput('github_token', {required: true})

    // get all the Actions inputs and roll up them into a single object
    const inputs = getInputs()

    // Create an octokit client with the retry plugin
    const octokit = github.getOctokit(token, {
      userAgent: `github/branch-deploy@${VERSION}`,
      additionalPlugins: [retry]
    })

    // Set the state so that the post run logic will trigger
    saveActionState('isPost', 'true')
    saveActionState('actionsToken', token)

    // setup the environment variable which is dynamically set throughout the Action
    let environment = inputs.environment

    // If we are running in the 'unlock on merge' mode, run auto-unlock logic
    if (inputs.unlockOnMergeMode) {
      core.info(`🏃 running in 'unlock on merge' mode`)
      await unlockOnMerge(octokit, context, inputs.environment_targets)
      saveActionState('bypass', 'true')
      return 'success - unlock on merge mode'
    }

    // If we are running in the merge deploy mode, run commit checks
    if (inputs.mergeDeployMode) {
      core.info(`🏃 running in 'merge deploy' mode`)
      await identicalCommitCheck(octokit, context, environment)
      // always bypass post run logic as they is an entirely alternate workflow from the core branch-deploy Action
      saveActionState('bypass', 'true')
      return 'success - merge deploy mode'
    }

    // Get the body of the IssueOps command
    const actionContext = branchDeployContext(context)
    const issueComment = issueCommentContext(actionContext)
    const body = issueComment.payload.comment.body.trim()

    // Check the context of the event to ensure it is valid, return if it is not
    if (!contextCheck(context)) {
      saveActionState('bypass', 'true')
      return 'safe-exit'
    }

    // deprecated command/input checks
    if (await isDeprecated(body, octokit, context)) {
      saveActionState('bypass', 'true')
      return 'safe-exit'
    }

    if (
      inputs.disable_naked_commands &&
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
      ))
    ) {
      saveActionState('bypass', 'true')
      return 'safe-exit'
    }

    // Get variables from the event context
    const issue_number = issueComment.payload.issue.number
    const {owner, repo} = context.repo

    // set helpful outputs that can be used in other Actions / steps
    setActionOutput('comment_body', body)
    setActionOutput('issue_number', issue_number)

    // check if the comment is a trigger and what type of trigger it is
    const isDeploy = triggerCheck(body, inputs.trigger)
    const isNoopDeploy = triggerCheck(body, inputs.noop_trigger)
    const isLock = triggerCheck(body, inputs.lock_trigger)
    const isUnlock = triggerCheck(body, inputs.unlock_trigger)
    const isHelp = triggerCheck(body, inputs.help_trigger)
    const isLockInfoAlias = triggerCheck(body, inputs.lock_info_alias)

    if (isDeploy || isNoopDeploy) {
      setActionOutput('type', 'deploy')
    } else if (isLock) {
      setActionOutput('type', 'lock')
    } else if (isUnlock) {
      setActionOutput('type', 'unlock')
    } else if (isHelp) {
      setActionOutput('type', 'help')
    } else if (isLockInfoAlias) {
      setActionOutput('type', 'lock-info-alias')
    } else {
      // if no trigger is detected, exit here
      saveActionState('bypass', 'true')
      setActionOutput('triggered', 'false')
      core.info('⛔ no trigger detected in comment - exiting')
      return 'safe-exit'
    }

    // If we made it this far, the action has been triggered in one manner or another
    setActionOutput('triggered', 'true')

    // Add the reaction to the issue_comment which triggered the Action
    const reactRes = legacyReactionResult(
      await reactEmote(inputs.reaction, actionContext, octokit)
    )
    setActionOutput('comment_id', issueComment.payload.comment.id)
    saveActionState('comment_id', issueComment.payload.comment.id)
    setActionOutput('initial_reaction_id', reactRes.data.id)
    saveActionState('reaction_id', reactRes.data.id)
    setActionOutput('actor_handle', issueComment.payload.comment.user.login)

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
        await actionStatus({
          context: actionContext,
          octokit,
          reactionId: reactRes.data.id,
          message: validPermissionsRes
        })
        // Set the bypass state to true so that the post run logic will not run
        saveActionState('bypass', 'true')
        core.setFailed(validPermissionsRes)
        return 'failure'
      }

      // Run the help command and exit
      await help(octokit, context, reactRes.data.id, inputs)
      saveActionState('bypass', 'true')
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
        await actionStatus({
          context: actionContext,
          octokit,
          reactionId: reactRes.data.id,
          message: validPermissionsRes
        })
        // Set the bypass state to true so that the post run logic will not run
        saveActionState('bypass', 'true')
        core.setFailed(validPermissionsRes)
        return 'failure'
      }

      // Check if the environment being locked/unlocked is a valid environment
      const lockEnvTargetCheckObj = await environmentTargets({
        mode: 'lock',
        environment,
        body,
        trigger: inputs.lock_trigger,
        alternateTrigger: inputs.unlock_trigger,
        context: actionContext,
        octokit,
        reactionId: reactRes.data.id
      })

      // extract the environment target from the lockEnvTargetCheckObj
      const lockEnvTargetCheck = lockEnvTargetCheckObj.environment

      // If the environment targets are not valid, then exit
      if (lockEnvTargetCheck === false) {
        core.debug('No valid environment targets found for lock/unlock request')
        return 'safe-exit'
      }

      // If it is a lock or lock info releated request
      if (isLock || isLockInfoAlias) {
        // If the lock request is only for details
        if (
          LOCK_METADATA.lockInfoFlags.some(substring =>
            body.includes(substring)
          ) ||
          isLockInfoAlias
        ) {
          core.debug('detailsOnly lock request detected')
          // Get the lock details from the lock file
          const lockResponse = await lock({
            octokit,
            context: actionContext,
            ref: null,
            reactionId: reactRes.data.id,
            sticky: null,
            environment: null,
            mode: {type: 'details', postDeployStep: false},
            leaveComment: true
          })
          // extract values from the lock response
          const lockData = legacyLockData(lockResponse.lockData)
          const lockStatus = lockResponse.status

          // If a lock was found
          if (lockStatus !== null) {
            // Find the total time since the lock was created
            const totalTime = timeDiff(
              lockData.created_at,
              new Date().toISOString()
            )

            // special comment for global deploy locks
            let globalMsg = ''
            let environmentMsg = `- __Environment__: \`${String(lockData.environment)}\``
            let lockBranchName = `${String(constructValidBranchName(lockData.environment))}-${LOCK_METADATA.lockBranchSuffix}`
            if (legacyStrictTrue(lockData.global)) {
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
            const lockMessageHeader = dedent(`
            ### Lock Details 🔒

            The deployment lock is currently claimed by __${lockData.created_by}__${globalMsg}
            `)

            const lockMessageDetails = dedent(`
            - __Branch__: \`${String(lockData.branch)}\`
            - __Created At__: \`${lockData.created_at}\`
            - __Created By__: \`${lockData.created_by}\`
            - __Sticky__: \`${String(lockData.sticky)}\`
            ${environmentMsg}
            - __Comment Link__: [click here](${lockData.link})
            - __Lock Link__: [click here](${String(process.env['GITHUB_SERVER_URL'])}/${owner}/${repo}/blob/${lockBranchName}/${LOCK_METADATA.lockFile})

            The current lock has been active for \`${totalTime}\`

            > If you need to release the lock, please comment \`${lockData.unlock_command}\`
            `)
            const lockMessage = [
              lockMessageHeader,
              formatLockReason(lockData.reason),
              lockMessageDetails
            ].join('\n\n')

            // Update the issue comment with the lock details
            await actionStatus({
              context: actionContext,
              octokit,
              reactionId: reactRes.data.id,
              message: lockMessage,
              result: 'alternate-success'
            })
            core.info(
              `🔒 the deployment lock is currently claimed by ${COLORS.highlight}${lockData.created_by}`
            )
          } else {
            // format the lock details message
            let lockCommand: string
            let lockTarget: string | null
            if (lockResponse.global) {
              lockTarget = 'global'
              lockCommand = `${inputs.lock_trigger} ${lockResponse.globalFlag}`
            } else {
              lockTarget = lockResponse.environment
              lockCommand = `${inputs.lock_trigger} ${String(lockTarget)}`
            }

            const lockMessage = dedent(`
            ### Lock Details 🔒

            No active \`${String(lockTarget)}\` deployment locks found for the \`${owner}/${repo}\` repository

            > If you need to create a \`${String(lockTarget)}\` lock, please comment \`${lockCommand}\`
            `)

            await actionStatus({
              context: actionContext,
              octokit,
              reactionId: reactRes.data.id,
              message: lockMessage,
              result: 'alternate-success'
            })
            core.info('✅ no active deployment locks found')
          }

          // Exit the action since we are done after obtaining only the lock details with --details
          saveActionState('bypass', 'true')
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
        await lock({
          octokit,
          context: actionContext,
          ref: pr.data.head.ref,
          reactionId: reactRes.data.id,
          sticky: true,
          environment: null,
          mode: {type: 'acquire', postDeployStep: false},
          leaveComment: true
        })
        saveActionState('bypass', 'true')
        return 'safe-exit'
      } else {
        // if it isn't a lock or lock info command, it must be an unlock command
        core.debug('running unlock command logic')
        await unlock({
          octokit,
          context: actionContext,
          reactionId: reactRes.data.id,
          target: {type: 'context'},
          mode: 'interactive'
        })
        saveActionState('bypass', 'true')
        return 'safe-exit'
      }
    }

    // Check if the default environment is being overwritten by an explicit environment
    const environmentObj = await environmentTargets({
      mode: 'deployment',
      environment,
      body,
      trigger: inputs.trigger,
      alternateTrigger: inputs.noop_trigger,
      stableBranch: inputs.stable_branch,
      context: actionContext,
      octokit,
      reactionId: reactRes.data.id,
      environmentUrls: inputs.environment_urls,
      paramSeparator: inputs.param_separator
    })

    // convert the environmentObj to a json string and debug log it
    core.debug(`environmentObj: ${JSON.stringify(environmentObj)}`)

    // If the environment targets are not valid, then exit
    if (environmentObj.environment === false) {
      core.debug('No valid environment targets found')
      return 'safe-exit'
    }

    if (!legacyTruthy(environmentObj.environment)) {
      core.debug('No valid environment targets found')
      return 'safe-exit'
    }

    // deconstruct the environment object to get the environment
    environment = environmentObj.environment

    // deconstruct the environment object to get the stable_branch_used value
    const stableBranchUsed = environmentObj.environmentObj.stable_branch_used

    // Final params computed by environment
    const params = environmentObj.environmentObj.params
    const parsed_params = environmentObj.environmentObj.parsed_params

    core.info(`🌍 environment: ${COLORS.highlight}${environment}`)
    saveActionState('environment', environment)
    setActionOutput('environment', environment)

    const data = {
      environment: environment,
      environmentObj: environmentObj.environmentObj,
      issue_number: issue_number,
      inputs: inputs
    }

    // Execute prechecks to ensure the Action can proceed
    const precheckResults = await prechecks(actionContext, octokit, data)
    setActionOutput('ref', precheckResults.ref)
    saveActionState('ref', precheckResults.ref)
    setActionOutput('sha', precheckResults.sha)
    saveActionState('sha', precheckResults.sha)
    core.debug(`precheckResults.sha: ${String(precheckResults.sha)}`)

    // If the prechecks failed, run the actionStatus function and return
    // note: if we don't pass in the 'success' bool, actionStatus will default to failure mode
    if (!precheckResults.status) {
      await actionStatus({
        context: actionContext,
        octokit,
        reactionId: reactRes.data.id,
        message: precheckResults.message
      })
      // Set the bypass state to true so that the post run logic will not run
      saveActionState('bypass', 'true')
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

    const committer = legacyCommitterLogin(commitData)
    const commit_html_url = commitData.data.html_url

    if (committer === null || committer === undefined) {
      core.warning(
        '⚠️ could not find the login of the committer - https://github.com/github/branch-deploy/issues/379'
      )
    }

    // Run commit safety checks
    const commitSafetyCheckResults = commitSafetyChecks(context, {
      commit: commitData.data.commit,
      sha: commitData.data.sha,
      inputs: inputs
    })

    // If the commitSafetyCheckResults failed, run the actionStatus function and return
    // note: if we don't pass in the 'success' bool, actionStatus will default to failure mode
    if (!commitSafetyCheckResults.status && !stableBranchUsed) {
      await actionStatus({
        context: actionContext,
        octokit,
        reactionId: reactRes.data.id,
        message: commitSafetyCheckResults.message
      })
      // Set the bypass state to true so that the post run logic will not run
      saveActionState('bypass', 'true')
      core.setFailed(commitSafetyCheckResults.message)
      return 'failure'
    } else if (!commitSafetyCheckResults.status && stableBranchUsed) {
      core.warning(
        'commit safety checks failed but the stable branch is being used so the workflow will continue - you should inspect recent commits on this branch as a precaution'
      )
    }

    // check for enforced deployment order if the input was provided and we are NOT deploying to the stable branch
    if (inputs.enforced_deployment_order.length > 0 && !stableBranchUsed) {
      const deploymentOrderResults = await validDeploymentOrder(
        octokit,
        context,
        inputs.enforced_deployment_order,
        environment,
        precheckResults.sha
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

        await actionStatus({
          context: actionContext,
          octokit,
          reactionId: reactRes.data.id,
          message: enforced_deployment_order_failure_message
        })
        // Set the bypass state to true so that the post run logic will not run
        saveActionState('bypass', 'true')
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
    let stickyLocks: boolean
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
    const leaveComment = !stickyLocks ? true : false

    core.debug(`🔒 stickyLocks: ${stickyLocks}`)
    core.debug(`💬 leaveComment: ${leaveComment}`)

    // Aquire the branch-deploy lock
    const lockResponse = await lock({
      octokit,
      context: actionContext,
      ref: precheckResults.ref,
      reactionId: reactRes.data.id,
      sticky: stickyLocks,
      environment,
      mode: {type: 'acquire', postDeployStep: false},
      leaveComment
    })

    // If the lock request fails, exit the Action
    if (lockResponse.status === false) {
      return 'safe-exit'
    }

    const github_run_id = parseInt(process.env['GITHUB_RUN_ID'] ?? '')

    // Add a comment to the PR letting the user know that a deployment has been started
    // Format the success message
    const deploymentType = precheckResults.noopMode
      ? 'noop'
      : environmentObj.environmentObj.sha !== null
        ? 'sha'
        : 'branch'
    const log_url = `${String(process.env['GITHUB_SERVER_URL'])}/${context.repo.owner}/${context.repo.repo}/actions/runs/${github_run_id}`

    // if the deployment_confirmation is set to 'true', then we will prompt the user to confirm the deployment
    if (inputs.deployment_confirmation) {
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
      if (deploymentConfirmed) {
        core.debug(
          `deploymentConfirmation() was successful - continuing with the deployment`
        )
      } else {
        // Set the bypass state to true so that the post run logic will not run
        saveActionState('bypass', 'true')
        core.debug(`❌ deployment not confirmed - exiting`)
        return 'failure'
      }
    }

    // this is the timestamp that we consider the deployment to have "started" at for logging and auditing purposes
    // it is not the exact time the deployment started, but it is very close
    const deployment_start_time = timestamp()
    core.debug(`deployment_start_time: ${deployment_start_time}`)
    saveActionState('deployment_start_time', deployment_start_time)

    const environmentUrlJson =
      environmentObj.environmentUrl !== null &&
      environmentObj.environmentUrl !== ''
        ? `"${environmentObj.environmentUrl}"`
        : 'null'
    const paramsJson = params !== null && params !== '' ? `"${params}"` : 'null'
    const parsedParamsJson =
      parsed_params !== null ? JSON.stringify(parsed_params) : 'null'

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
          "url": ${environmentUrlJson}
        },
        "deployment": {
          "timestamp": "${deployment_start_time}",
          "logs": "${log_url}"
        },
        "git": {
          "branch": "${precheckResults.ref}",
          "commit": "${precheckResults.sha}",
          "verified": ${commitSafetyCheckResults.isVerified},
          "committer": "${String(committer)}",
          "html_url": "${commit_html_url}"
        },
        "context": {
          "actor": "${context.actor}",
          "noop": ${precheckResults.noopMode},
          "fork": ${precheckResults.isFork},
          "comment": {
            "created_at": "${issueComment.payload.comment.created_at}",
            "updated_at": "${issueComment.payload.comment.updated_at}",
            "body": "${body}",
            "html_url": "${issueComment.payload.comment.html_url}"
          }
        },
        "parameters": {
          "raw": ${paramsJson},
          "parsed": ${parsedParamsJson}
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
    setActionOutput('initial_comment_id', deploymentStartedComment.data.id)
    saveActionState('initial_comment_id', deploymentStartedComment.data.id)

    // Set outputs for noopMode
    if (precheckResults.noopMode) {
      setActionOutput('noop', precheckResults.noopMode)
      setActionOutput('continue', 'true')
      saveActionState('noop', precheckResults.noopMode)

      core.info(
        `🧑‍🚀 commit sha to noop: ${COLORS.highlight}${precheckResults.sha}${COLORS.reset}`
      )
      core.info(`🚀 ${COLORS.success}deployment started!${COLORS.reset} (noop)`)

      // If noop mode is enabled, return here
      return 'success - noop'
    } else {
      setActionOutput('noop', precheckResults.noopMode)
      saveActionState('noop', precheckResults.noopMode)
    }

    // Get required_contexts for the deployment
    let requiredContexts: string[] = []
    if (
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
      environmentObj.environmentObj.sha !== null
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
      initial_comment_id: issueComment.payload.comment.id,
      initial_reaction_id: reactRes.data.id,
      deployment_started_comment_id: deploymentStartedComment.data.id,
      timestamp: deployment_start_time,
      commit_verified: commitSafetyCheckResults.isVerified,
      actor: context.actor,
      stable_branch_used: stableBranchUsed
    }

    // Create a new deployment
    const createDeploymentResponse = await octokit.rest.repos.createDeployment({
      owner: owner,
      repo: repo,
      ref: precheckResults.ref,
      auto_merge: auto_merge,
      required_contexts: requiredContexts,
      environment: environment,
      // description: "",
      // :description note: Short description of the deployment.
      production_environment: isProductionEnvironment,
      // :production_environment note: specifies if the given environment is one that end-users directly interact with. Default: true when environment is production and false otherwise.
      payload: payload,
      headers: API_HEADERS
    })
    const createDeploy = createdDeployment(createDeploymentResponse.data)
    setActionOutput('deployment_id', createDeploy.id)
    saveActionState('deployment_id', createDeploy.id)

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
      await actionStatus({
        context: actionContext,
        octokit,
        reactionId: reactRes.data.id,
        message: mergeMessage
      })
      core.warning(mergeMessage)
      // Enable bypass for the post deploy step since the deployment is not complete
      saveActionState('bypass', 'true')
      return 'safe-exit'
    }

    // Debug log information about the deployment that was just created
    core.info(
      `📓 deployment id: ${COLORS.highlight}${String(createDeploy.id)}${COLORS.reset}`
    )
    core.debug(`deployment.url: ${String(createDeploy.url)}`)
    core.debug(`deployment.created_at: ${String(createDeploy.created_at)}`)
    core.debug(`deployment.updated_at: ${String(createDeploy.updated_at)}`)
    core.debug(`deployment.statuses_url: ${String(createDeploy.statuses_url)}`)

    // Set the deployment status to in_progress
    await createDeploymentStatus(
      octokit,
      context,
      precheckResults.ref,
      'in_progress',
      legacyDeploymentId(createDeploy.id),
      environment,
      environmentObj.environmentUrl // environment_url (can be null)
    )

    core.info(
      `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${precheckResults.sha}${COLORS.reset}`
    )
    core.info(`🚀 ${COLORS.success}deployment started!${COLORS.reset}`)
    setActionOutput('continue', 'true')
    return 'success'
  } catch (error) {
    saveActionState('bypass', 'true')
    const apiError = legacyApiError(error)
    core.error(apiError.stack)
    core.setFailed(apiError.message)
    return undefined
  }
}

/* istanbul ignore next */
if (getActionState('isPost') === 'true') {
  void post()
} else {
  /* istanbul ignore next */
  if (
    process.env['CI'] === 'true' &&
    process.env['BRANCH_DEPLOY_VITEST_TEST'] !== 'true'
  ) {
    void run()
  }
}
