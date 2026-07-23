import * as core from './actions-core.ts'
import * as github from '@actions/github'
import {context} from '@actions/github'
import {retry} from '@octokit/plugin-retry'

import {VERSION} from './version.ts'
import {actionStatus} from './functions/action-status.ts'
import {COLORS} from './functions/colors.ts'
import {contextCheck} from './functions/context-check.ts'
import {runDeploymentOperation} from './functions/deployment-operation.ts'
import {runDirectOperation} from './functions/direct-operation.ts'
import {help} from './functions/help.ts'
import {identicalCommitCheck} from './functions/identical-commit-check.ts'
import {getInputs} from './functions/inputs.ts'
import {analyzeIssueCommand} from './functions/issue-command.ts'
import {isDeprecated} from './functions/deprecated-checks.ts'
import {nakedCommandCheck} from './functions/naked-command-check.ts'
import {post} from './functions/post.ts'
import {reactEmote} from './functions/react-emote.ts'
import {unlockOnMerge} from './functions/unlock-on-merge.ts'
import {validPermissions} from './functions/valid-permissions.ts'
import {finishOperation} from './operation-result.ts'
import {
  getActionInput,
  getActionState,
  saveActionState,
  setActionOutput
} from './action-io.ts'
import {
  branchDeployContext,
  issueCommentContext,
  legacyApiError
} from './trust-boundaries.ts'
import type {Operation, OperationOutcome, RunResult} from './types.ts'

function finish(outcome: OperationOutcome): RunResult {
  if (outcome.error !== undefined) {
    const error = legacyApiError(outcome.error)
    core.error(error.stack)
    core.setFailed(error.message)
  }
  return finishOperation(outcome.runResult, {
    schema_version: 1,
    decision: outcome.decision,
    reason_code: outcome.reasonCode,
    operation: outcome.operation,
    deployment_type: outcome.deploymentType ?? null,
    environment: outcome.environment ?? null,
    ref: outcome.ref ?? null,
    sha: outcome.sha ?? null,
    deployment_id: outcome.deploymentId ?? null
  })
}

function terminal(
  operation: Operation,
  outcome: Omit<OperationOutcome, 'operation'>
): RunResult {
  return finish({...outcome, operation})
}

// :returns: 'success', 'success - noop', 'success - merge deploy mode', 'failure', 'safe-exit', 'success - unlock on merge mode' or raises an error
export async function run(): Promise<RunResult> {
  let operation: Operation = 'none'
  try {
    core.info(`🛸 github/branch-deploy ${COLORS.info}${VERSION}${COLORS.reset}`)
    core.debug(`context: ${JSON.stringify(context)}`)

    const token = getActionInput('github_token', {required: true})
    const inputs = getInputs()
    const octokit = github.getOctokit(token, {
      userAgent: `github/branch-deploy@${VERSION}`,
      additionalPlugins: [retry]
    })
    saveActionState('isPost', 'true')
    saveActionState('actionsToken', token)

    if (inputs.unlockOnMergeMode) {
      operation = 'unlock_on_merge'
      core.info(`🏃 running in 'unlock on merge' mode`)
      await unlockOnMerge(octokit, context, inputs.environment_targets)
      saveActionState('bypass', 'true')
      return terminal(operation, {
        runResult: 'success - unlock on merge mode',
        decision: 'complete',
        reasonCode: 'unlock_on_merge_completed',
        environment: inputs.environment
      })
    }

    if (inputs.mergeDeployMode) {
      operation = 'merge_deploy'
      core.info(`🏃 running in 'merge deploy' mode`)
      const identical = await identicalCommitCheck(
        octokit,
        context,
        inputs.environment
      )
      saveActionState('bypass', 'true')
      return terminal(operation, {
        runResult: 'success - merge deploy mode',
        decision: identical ? 'stop' : 'continue',
        reasonCode: identical
          ? 'merge_deploy_not_required'
          : 'merge_deploy_required',
        environment: inputs.environment
      })
    }

    const actionContext = branchDeployContext(context)
    if (!contextCheck(context)) {
      saveActionState('bypass', 'true')
      return terminal(operation, {
        runResult: 'safe-exit',
        decision: 'stop',
        reasonCode: 'unsupported_event'
      })
    }

    saveActionState('trusted_sha', context.sha)
    const issueComment = issueCommentContext(actionContext)
    const body = issueComment.payload.comment.body.trim()
    if (await isDeprecated(body, octokit, context)) {
      saveActionState('bypass', 'true')
      return terminal(operation, {
        runResult: 'safe-exit',
        decision: 'stop',
        reasonCode: 'deprecated_command'
      })
    }

    const command = analyzeIssueCommand(body, {
      globalFlag: inputs.global_lock_flag,
      helpTrigger: inputs.help_trigger,
      lockInfoAlias: inputs.lock_info_alias,
      lockTrigger: inputs.lock_trigger,
      noopTrigger: inputs.noop_trigger,
      paramSeparator: inputs.param_separator,
      trigger: inputs.trigger,
      unlockTrigger: inputs.unlock_trigger
    })
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
        context,
        command.naked
      ))
    ) {
      saveActionState('bypass', 'true')
      return terminal(operation, {
        runResult: 'safe-exit',
        decision: 'stop',
        reasonCode: 'naked_command_disabled'
      })
    }

    const issueNumber = issueComment.payload.issue.number
    setActionOutput('comment_body', body)
    setActionOutput('issue_number', issueNumber)
    if (command.outputType === null) {
      saveActionState('bypass', 'true')
      setActionOutput('triggered', 'false')
      core.info('⛔ no trigger detected in comment - exiting')
      return terminal(operation, {
        runResult: 'safe-exit',
        decision: 'stop',
        reasonCode: 'no_trigger'
      })
    }

    operation = command.operation
    setActionOutput('type', command.outputType)
    setActionOutput('triggered', 'true')
    const reactionId = await reactEmote(inputs.reaction, actionContext, octokit)
    setActionOutput('comment_id', issueComment.payload.comment.id)
    saveActionState('comment_id', issueComment.payload.comment.id)
    setActionOutput('initial_reaction_id', reactionId ?? '')
    saveActionState('reaction_id', reactionId ?? '')
    setActionOutput('actor_handle', issueComment.payload.comment.user.login)

    if (command.dispatch === 'help') {
      core.debug('help command detected')
      const permission = await validPermissions(
        octokit,
        context,
        inputs.permissions
      )
      if (permission !== true) {
        await actionStatus({
          context: actionContext,
          octokit,
          reactionId,
          message: permission
        })
        saveActionState('bypass', 'true')
        core.setFailed(permission)
        return terminal(operation, {
          runResult: 'failure',
          decision: 'failure',
          reasonCode: 'permission_denied'
        })
      }
      await help(octokit, context, reactionId, inputs)
      saveActionState('bypass', 'true')
      return terminal(operation, {
        runResult: 'safe-exit',
        decision: 'complete',
        reasonCode: 'help_completed'
      })
    }

    if (
      command.dispatch === 'lock' ||
      command.dispatch === 'lock_info' ||
      command.dispatch === 'unlock'
    ) {
      return finish(
        await runDirectOperation({
          body,
          command: {...command, dispatch: command.dispatch},
          context: actionContext,
          environment: inputs.environment,
          inputs,
          octokit,
          operation,
          reactionId
        })
      )
    }

    return finish(
      await runDeploymentOperation({
        body,
        context: actionContext,
        inputs,
        issueComment,
        issueNumber,
        octokit,
        operation,
        reactionId
      })
    )
  } catch (error) {
    saveActionState('bypass', 'true')
    return terminal(operation, {
      runResult: undefined,
      decision: 'failure',
      reasonCode: 'unexpected_error',
      error
    })
  }
}

/* node:coverage ignore next */
if (getActionState('isPost') === 'true') {
  void post()
} else {
  /* node:coverage ignore next */
  if (
    process.env['CI'] === 'true' &&
    process.env['BRANCH_DEPLOY_VITEST_TEST'] !== 'true'
  ) {
    void run()
  }
}
