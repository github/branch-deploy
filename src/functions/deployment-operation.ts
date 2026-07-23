import * as core from '../actions-core.ts'
import {saveActionState, setActionOutput} from '../action-io.ts'
import {
  createdDeployment,
  legacyApiError,
  legacyCommitterLogin,
  legacyDeploymentId,
  legacyTruthy
} from '../trust-boundaries.ts'
import {actionStatus} from './action-status.ts'
import {API_HEADERS} from './api-headers.ts'
import {branchRulesetChecks} from './branch-ruleset-checks.ts'
import {COLORS} from './colors.ts'
import {commitSafetyChecks} from './commit-safety-checks.ts'
import {dedent} from './dedent.ts'
import {createDeploymentStatus} from './deployment.ts'
import {deploymentConfirmation} from './deployment-confirmation.ts'
import {environmentTargets} from './environment-targets.ts'
import {jsonCodeBlock} from './json-code-block.ts'
import {lock} from './lock.ts'
import {prechecks} from './prechecks.ts'
import {selectedRefMatches} from './selected-ref-check.ts'
import {timestamp} from './timestamp.ts'
import {unlockIfUnchanged} from './unlock-if-unchanged.ts'
import {validDeploymentOrder} from './valid-deployment-order.ts'
import type {
  ActionInputs,
  BranchDeployContext,
  BranchDeployOctokit,
  IssueCommentContext,
  Operation,
  OperationOutcome,
  OperationDeploymentType,
  PrecheckSuccess,
  ValidDeploymentEnvironmentResult
} from '../types.ts'

export interface DeploymentOperationRequest {
  readonly body: string
  readonly context: BranchDeployContext
  readonly inputs: ActionInputs
  readonly issueComment: IssueCommentContext
  readonly issueNumber: number
  readonly octokit: BranchDeployOctokit
  readonly operation: Operation
  readonly reactionId: number | null
}

interface DeploymentLockLease {
  readonly cleanup: (reason: string) => Promise<void>
}

interface OperationProgress {
  deploymentId: number | null
  deploymentType: OperationDeploymentType | null
  environment: string | null
  ref: string | null
  sha: string | null
}

interface ReadyDeployment {
  readonly commitHtmlUrl: string
  readonly committer: string | null | undefined
  readonly environment: string
  readonly environmentResult: ValidDeploymentEnvironmentResult
  readonly isVerified: boolean
  readonly precheck: PrecheckSuccess
}

function terminal(
  request: DeploymentOperationRequest,
  outcome: Omit<OperationOutcome, 'operation'>
): OperationOutcome {
  return {...outcome, operation: request.operation}
}

async function reportFailure(
  request: DeploymentOperationRequest,
  message: string
): Promise<void> {
  await actionStatus({
    context: request.context,
    octokit: request.octokit,
    reactionId: request.reactionId,
    message
  })
  saveActionState('bypass', 'true')
  core.setFailed(message)
}

async function enforceDeploymentOrder(
  request: DeploymentOperationRequest,
  environment: string,
  ref: string,
  sha: string
): Promise<OperationOutcome | null> {
  const {context, inputs, octokit, reactionId} = request
  let order
  try {
    order = await validDeploymentOrder(
      octokit,
      context,
      inputs.enforced_deployment_order,
      environment,
      sha
    )
  } catch (error) {
    const apiError = legacyApiError(error)
    const message = dedent(`
      ### Invalid Deployment Order

      ${apiError.message}
    `)
    await actionStatus({context, octokit, reactionId, message})
    saveActionState('bypass', 'true')
    core.setFailed(apiError.message)
    return terminal(request, {
      runResult: 'failure',
      decision: 'failure',
      reasonCode: 'deployment_order_failed',
      environment,
      ref,
      sha
    })
  }

  if (order.valid) return null
  const environments = order.results
    .map(result => {
      const color = result.active ? COLORS.success : COLORS.error
      return `${color}${result.environment}${COLORS.reset}`
    })
    .join(',')
  const markdown = order.results
    .map(result => {
      const emoji = result.active ? '🟢' : '🔴'
      return `- ${emoji} **${result.environment}**`
    })
    .join('\n')
  const message = dedent(`
    ### 🚦 Invalid Deployment Order

    The deployment to \`${environment}\` cannot be proceed as the following environments need successful deployments first:

    ${markdown}
  `)
  await actionStatus({context, octokit, reactionId, message})
  saveActionState('bypass', 'true')
  core.setFailed(
    `🚦 deployment order checks failed as not all previous environments have active deployments: ${environments}`
  )
  return terminal(request, {
    runResult: 'failure',
    decision: 'failure',
    reasonCode: 'deployment_order_failed',
    environment,
    ref,
    sha
  })
}

async function prepareDeployment(
  request: DeploymentOperationRequest,
  progress: OperationProgress
): Promise<OperationOutcome | ReadyDeployment> {
  const {body, context, inputs, issueNumber, octokit, reactionId} = request
  const environmentResult = await environmentTargets({
    mode: 'deployment',
    environment: inputs.environment,
    body,
    trigger: inputs.trigger,
    alternateTrigger: inputs.noop_trigger,
    stableBranch: inputs.stable_branch,
    context,
    octokit,
    reactionId,
    environmentUrls: inputs.environment_urls,
    paramSeparator: inputs.param_separator
  })
  core.debug(`environmentObj: ${JSON.stringify(environmentResult)}`)
  if (
    environmentResult.environment === false ||
    !legacyTruthy(environmentResult.environment)
  ) {
    core.debug('No valid environment targets found')
    return terminal(request, {
      runResult: 'safe-exit',
      decision: 'stop',
      reasonCode: 'invalid_environment'
    })
  }

  const environment = environmentResult.environment
  progress.environment = environment
  const stableBranchUsed = environmentResult.environmentObj.stable_branch_used
  core.info(`🌍 environment: ${COLORS.highlight}${environment}`)
  saveActionState('environment', environment)
  setActionOutput('environment', environment)

  const precheck = await prechecks(context, octokit, {
    environment,
    environmentObj: environmentResult.environmentObj,
    issue_number: issueNumber,
    inputs
  })
  progress.ref = precheck.ref ?? null
  progress.sha = precheck.sha ?? null
  setActionOutput('ref', precheck.ref)
  saveActionState('ref', precheck.ref)
  setActionOutput('sha', precheck.sha)
  saveActionState('sha', precheck.sha)
  core.debug(`precheckResults.sha: ${String(precheck.sha)}`)
  if (!precheck.status) {
    await reportFailure(request, precheck.message)
    return terminal(request, {
      runResult: 'failure',
      decision: 'failure',
      reasonCode: 'prechecks_failed',
      environment
    })
  }

  await branchRulesetChecks(context, octokit, {
    branch: inputs.stable_branch,
    use_security_warnings: inputs.use_security_warnings
  })
  const commitData = await octokit.rest.repos.getCommit({
    ...context.repo,
    ref: precheck.sha,
    headers: API_HEADERS
  })
  const committer = legacyCommitterLogin(commitData)
  if (committer === null || committer === undefined) {
    core.warning(
      '⚠️ could not find the login of the committer - https://github.com/github/branch-deploy/issues/379'
    )
  }
  const safety = commitSafetyChecks(context, {
    commit: commitData.data.commit,
    sha: commitData.data.sha,
    inputs
  })
  if (!safety.status && !stableBranchUsed) {
    await reportFailure(request, safety.message)
    return terminal(request, {
      runResult: 'failure',
      decision: 'failure',
      reasonCode: 'commit_safety_failed',
      environment,
      ref: precheck.ref,
      sha: precheck.sha
    })
  }
  if (!safety.status) {
    core.warning(
      'commit safety checks failed but the stable branch is being used so the workflow will continue - you should inspect recent commits on this branch as a precaution'
    )
  }

  if (inputs.enforced_deployment_order.length > 0 && !stableBranchUsed) {
    const orderFailure = await enforceDeploymentOrder(
      request,
      environment,
      precheck.ref,
      precheck.sha
    )
    if (orderFailure !== null) return orderFailure
  }

  return {
    commitHtmlUrl: commitData.data.html_url,
    committer,
    environment,
    environmentResult,
    isVerified: safety.isVerified,
    precheck
  }
}

async function acquireDeploymentLock(
  request: DeploymentOperationRequest,
  ready: ReadyDeployment
): Promise<DeploymentLockLease | OperationOutcome> {
  const {context, inputs, octokit, reactionId} = request
  const {environment, precheck} = ready
  core.info(
    `🍯 sticky_locks: ${COLORS.highlight}${inputs.sticky_locks}${COLORS.reset}`
  )
  core.info(
    `🍯 sticky_locks_for_noop: ${COLORS.highlight}${inputs.sticky_locks_for_noop}${COLORS.reset}`
  )
  if (inputs.disable_lock) {
    core.info('🔓 deployment locking is disabled; skipping lock acquisition')
    return {cleanup: (): Promise<void> => Promise.resolve()}
  }
  const sticky = precheck.noopMode
    ? inputs.sticky_locks_for_noop
    : inputs.sticky_locks
  if (precheck.noopMode) {
    core.debug(`🔒 noop mode detected and using stickyLocks: ${sticky}`)
  }
  const leaveComment = !sticky
  core.debug(`🔒 stickyLocks: ${sticky}`)
  core.debug(`💬 leaveComment: ${leaveComment}`)
  const lockResponse = await lock({
    octokit,
    context,
    ref: precheck.ref,
    reactionId,
    sticky,
    environment,
    mode: {type: 'acquire', postDeployStep: false},
    leaveComment
  })
  if (lockResponse.status === false || lockResponse.status === 'ambiguous') {
    return terminal(request, {
      runResult: 'safe-exit',
      decision: 'stop',
      reasonCode: 'lock_conflict',
      environment,
      ref: precheck.ref,
      sha: precheck.sha
    })
  }

  let cleanupAttempted = false
  const lockRefSha = lockResponse.lockRefSha
  return {
    cleanup: async (reason: string): Promise<void> => {
      if (sticky || cleanupAttempted) return
      cleanupAttempted = true
      if (lockRefSha === undefined) {
        core.warning(
          `failed to release the non-sticky deployment lock ${reason}: the original ref SHA was not returned`
        )
        return
      }
      try {
        const removed = await unlockIfUnchanged(
          octokit,
          context,
          environment,
          lockRefSha
        )
        if (!removed) {
          core.warning(
            `failed to release the non-sticky deployment lock ${reason}`
          )
        }
      } catch (error) {
        core.warning(
          `failed to release the non-sticky deployment lock ${reason}: ${legacyApiError(error).message}`
        )
      }
    }
  }
}

async function changedRefOutcome(
  request: DeploymentOperationRequest,
  ready: ReadyDeployment,
  lease: DeploymentLockLease,
  deploymentType: OperationDeploymentType
): Promise<OperationOutcome | null> {
  const {context, inputs, octokit, reactionId} = request
  const unchanged = await selectedRefMatches(octokit, context, {
    exactSha: ready.environmentResult.environmentObj.sha !== null,
    expectedSha: ready.precheck.sha,
    isFork: ready.precheck.isFork,
    stableBranch: inputs.stable_branch,
    stableBranchUsed: ready.environmentResult.environmentObj.stable_branch_used
  })
  if (unchanged) return null

  const message = dedent(`
    ### Deployment Ref Changed

    The selected branch moved after deployment checks completed. Run the command again so the new commit can be reviewed and checked.
  `)
  saveActionState('bypass', 'true')
  await lease.cleanup('after the selected ref changed')
  try {
    await actionStatus({context, octokit, reactionId, message})
  } catch (error) {
    core.warning(
      `failed to report the changed deployment ref: ${legacyApiError(error).message}`
    )
  }
  core.setFailed('the selected deployment ref changed after prechecks')
  return terminal(request, {
    runResult: 'failure',
    decision: 'failure',
    reasonCode: 'ref_changed',
    deploymentType,
    environment: ready.environment,
    ref: ready.precheck.ref,
    sha: ready.precheck.sha
  })
}

async function confirmDeployment(
  request: DeploymentOperationRequest,
  ready: ReadyDeployment,
  lease: DeploymentLockLease,
  deploymentType: OperationDeploymentType,
  githubRunId: number,
  logUrl: string
): Promise<OperationOutcome | null> {
  if (!request.inputs.deployment_confirmation) return null
  const {body, context, inputs, octokit} = request
  const {environment, environmentResult, precheck} = ready
  let confirmation
  try {
    confirmation = await deploymentConfirmation(context, octokit, {
      sha: precheck.sha,
      ref: precheck.ref,
      deploymentType,
      environment,
      environmentUrl: environmentResult.environmentUrl,
      deployment_confirmation_timeout: inputs.deployment_confirmation_timeout,
      isVerified: ready.isVerified,
      log_url: logUrl,
      body,
      params: environmentResult.environmentObj.params,
      parsed_params: environmentResult.environmentObj.parsed_params,
      github_run_id: githubRunId,
      noopMode: precheck.noopMode,
      isFork: precheck.isFork,
      committer: ready.committer,
      commit_html_url: ready.commitHtmlUrl
    })
  } catch (error) {
    await lease.cleanup('after confirmation failed')
    throw error
  }
  if (confirmation === 'confirmed') {
    core.debug(
      'deploymentConfirmation() was successful - continuing with the deployment'
    )
    return null
  }
  await lease.cleanup('after confirmation did not complete')
  saveActionState('bypass', 'true')
  core.debug('❌ deployment not confirmed - exiting')
  return terminal(request, {
    runResult: 'failure',
    decision: 'failure',
    reasonCode:
      confirmation === 'rejected'
        ? 'confirmation_rejected'
        : 'confirmation_timed_out',
    deploymentType,
    environment,
    ref: precheck.ref,
    sha: precheck.sha
  })
}

async function createStartedComment(
  request: DeploymentOperationRequest,
  ready: ReadyDeployment,
  deploymentType: OperationDeploymentType,
  deploymentStartTime: string,
  logUrl: string
): Promise<number> {
  const {body, context, issueComment, octokit} = request
  const {environment, environmentResult, precheck} = ready
  const metadata = {
    type: deploymentType.toLowerCase(),
    environment: {
      name: environment,
      url:
        environmentResult.environmentUrl !== null &&
        environmentResult.environmentUrl !== ''
          ? environmentResult.environmentUrl
          : null
    },
    deployment: {timestamp: deploymentStartTime, logs: logUrl},
    git: {
      branch: precheck.ref,
      commit: precheck.sha,
      verified: ready.isVerified,
      committer: String(ready.committer),
      html_url: ready.commitHtmlUrl
    },
    context: {
      actor: context.actor,
      noop: precheck.noopMode,
      fork: precheck.isFork,
      comment: {
        created_at: issueComment.payload.comment.created_at,
        updated_at: issueComment.payload.comment.updated_at,
        body,
        html_url: issueComment.payload.comment.html_url
      }
    },
    parameters: {
      raw:
        environmentResult.environmentObj.params !== null &&
        environmentResult.environmentObj.params !== ''
          ? environmentResult.environmentObj.params
          : null,
      parsed: environmentResult.environmentObj.parsed_params
    }
  }
  const header = dedent(`
    ### Deployment Triggered 🚀

    __${context.actor}__, started a __${deploymentType}__ deployment to __${environment}__ (${deploymentType}: \`${precheck.ref}\`)

    You can watch the progress [here](${logUrl}) 🔗

  `)
  const response = await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: context.issue.number,
    body: [
      header,
      '',
      '<details><summary>Details</summary>',
      '',
      '<!--- pre-deploy-metadata-start -->',
      '',
      jsonCodeBlock(metadata),
      '',
      '<!--- pre-deploy-metadata-end -->',
      '',
      '</details>'
    ].join('\n'),
    headers: API_HEADERS
  })
  setActionOutput('initial_comment_id', response.data.id)
  saveActionState('initial_comment_id', response.data.id)
  return response.data.id
}

async function createDeployment(
  request: DeploymentOperationRequest,
  ready: ReadyDeployment,
  lease: DeploymentLockLease,
  deploymentType: OperationDeploymentType,
  deploymentStartTime: string,
  githubRunId: number,
  startedCommentId: number,
  progress: OperationProgress
): Promise<OperationOutcome> {
  const {context, inputs, issueComment, octokit, reactionId} = request
  const {environment, environmentResult, precheck} = ready
  const requiredContexts =
    inputs.required_contexts === '' || inputs.required_contexts === 'false'
      ? []
      : inputs.required_contexts.split(',').map(item => item.trim())
  const production = inputs.production_environments.includes(environment)
  core.debug(`production_environment: ${production}`)
  const autoMerge =
    environmentResult.environmentObj.sha === null &&
    inputs.update_branch !== 'disabled'
  const response = await octokit.rest.repos.createDeployment({
    ...context.repo,
    ref: precheck.ref,
    auto_merge: autoMerge,
    required_contexts: requiredContexts,
    environment,
    production_environment: production,
    payload: {
      type: 'branch-deploy',
      sha: precheck.sha,
      params: environmentResult.environmentObj.params,
      parsed_params: environmentResult.environmentObj.parsed_params,
      github_run_id: githubRunId,
      initial_comment_id: issueComment.payload.comment.id,
      initial_reaction_id: reactionId,
      deployment_started_comment_id: startedCommentId,
      timestamp: deploymentStartTime,
      commit_verified: ready.isVerified,
      actor: context.actor,
      stable_branch_used: environmentResult.environmentObj.stable_branch_used
    },
    headers: API_HEADERS
  })
  const deployment = createdDeployment(response.data)
  progress.deploymentId = deployment.id ?? null
  setActionOutput('deployment_id', deployment.id)
  saveActionState('deployment_id', deployment.id)

  if ('message' in deployment) {
    if (!deployment.message.includes('Auto-merged')) {
      throw new Error(
        `GitHub did not create a deployment: ${deployment.message}`
      )
    }
    await lease.cleanup('after GitHub requested a base branch update')
    const message = dedent(`
      ### ⚠️ Deployment Warning

      - Message: ${deployment.message}
      - Note: If you have required CI checks, you may need to manually push a commit to re-run them

      > Deployment will not continue. Please try again once this branch is up-to-date with the base branch
    `)
    await actionStatus({context, octokit, reactionId, message})
    core.warning(message)
    saveActionState('bypass', 'true')
    return terminal(request, {
      runResult: 'safe-exit',
      decision: 'stop',
      reasonCode: 'base_branch_update_required',
      deploymentType,
      environment,
      ref: precheck.ref,
      sha: precheck.sha
    })
  }

  if (deployment.sha !== precheck.sha) {
    saveActionState('bypass', 'true')
    try {
      await createDeploymentStatus(
        octokit,
        context,
        precheck.ref,
        'error',
        deployment.id,
        environment,
        environmentResult.environmentUrl
      )
    } catch (error) {
      core.warning(
        `failed to mark the mismatched deployment as an error: ${legacyApiError(error).message}`
      )
    }
    await lease.cleanup(
      'after GitHub created the deployment at an unexpected commit'
    )
    const message = dedent(`
      ### Deployment Commit Changed

      GitHub created the deployment at a different commit than the one that passed deployment checks. The deployment was marked as an error.
    `)
    try {
      await actionStatus({context, octokit, reactionId, message})
    } catch (error) {
      core.warning(
        `failed to report the mismatched deployment: ${legacyApiError(error).message}`
      )
    }
    core.setFailed('the created deployment SHA did not match the checked SHA')
    return terminal(request, {
      runResult: 'failure',
      decision: 'failure',
      reasonCode: 'deployment_sha_mismatch',
      deploymentType,
      deploymentId: deployment.id,
      environment,
      ref: precheck.ref,
      sha: precheck.sha
    })
  }

  core.info(
    `📓 deployment id: ${COLORS.highlight}${String(deployment.id)}${COLORS.reset}`
  )
  core.debug(`deployment.url: ${String(deployment.url)}`)
  core.debug(`deployment.created_at: ${String(deployment.created_at)}`)
  core.debug(`deployment.updated_at: ${String(deployment.updated_at)}`)
  core.debug(`deployment.statuses_url: ${String(deployment.statuses_url)}`)
  await createDeploymentStatus(
    octokit,
    context,
    precheck.ref,
    'in_progress',
    legacyDeploymentId(deployment.id),
    environment,
    environmentResult.environmentUrl
  )
  core.info(
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${precheck.sha}${COLORS.reset}`
  )
  core.info(`🚀 ${COLORS.success}deployment started!${COLORS.reset}`)
  setActionOutput('continue', 'true')
  return terminal(request, {
    runResult: 'success',
    decision: 'continue',
    reasonCode: 'deployment_ready',
    deploymentType,
    deploymentId: deployment.id,
    environment,
    ref: precheck.ref,
    sha: precheck.sha
  })
}

async function continueDeployment(
  request: DeploymentOperationRequest,
  ready: ReadyDeployment,
  lease: DeploymentLockLease,
  progress: OperationProgress
): Promise<OperationOutcome> {
  const {context} = request
  const {environment, environmentResult, precheck} = ready
  const githubRunId = parseInt(process.env['GITHUB_RUN_ID'] ?? '')
  const deploymentType: OperationDeploymentType = precheck.noopMode
    ? 'noop'
    : environmentResult.environmentObj.sha !== null
      ? 'sha'
      : 'branch'
  progress.deploymentType = deploymentType
  const logUrl = `${String(process.env['GITHUB_SERVER_URL'])}/${context.repo.owner}/${context.repo.repo}/actions/runs/${githubRunId}`

  const confirmationFailure = await confirmDeployment(
    request,
    ready,
    lease,
    deploymentType,
    githubRunId,
    logUrl
  )
  if (confirmationFailure !== null) return confirmationFailure
  const earlyRefFailure = await changedRefOutcome(
    request,
    ready,
    lease,
    deploymentType
  )
  if (earlyRefFailure !== null) return earlyRefFailure

  const deploymentStartTime = timestamp()
  core.debug(`deployment_start_time: ${deploymentStartTime}`)
  saveActionState('deployment_start_time', deploymentStartTime)
  const startedCommentId = await createStartedComment(
    request,
    ready,
    deploymentType,
    deploymentStartTime,
    logUrl
  )
  const finalRefFailure = await changedRefOutcome(
    request,
    ready,
    lease,
    deploymentType
  )
  if (finalRefFailure !== null) return finalRefFailure

  setActionOutput('noop', precheck.noopMode)
  if (precheck.noopMode) {
    setActionOutput('continue', 'true')
    saveActionState('noop', precheck.noopMode)
    core.info(
      `🧑‍🚀 commit sha to noop: ${COLORS.highlight}${precheck.sha}${COLORS.reset}`
    )
    core.info(`🚀 ${COLORS.success}deployment started!${COLORS.reset} (noop)`)
    return terminal(request, {
      runResult: 'success - noop',
      decision: 'continue',
      reasonCode: 'noop_ready',
      deploymentType,
      environment,
      ref: precheck.ref,
      sha: precheck.sha
    })
  }
  saveActionState('noop', precheck.noopMode)

  return createDeployment(
    request,
    ready,
    lease,
    deploymentType,
    deploymentStartTime,
    githubRunId,
    startedCommentId,
    progress
  )
}

export async function runDeploymentOperation(
  request: DeploymentOperationRequest
): Promise<OperationOutcome> {
  let lease: DeploymentLockLease | null = null
  const progress: OperationProgress = {
    deploymentId: null,
    deploymentType: null,
    environment: null,
    ref: null,
    sha: null
  }
  try {
    const ready = await prepareDeployment(request, progress)
    if ('reasonCode' in ready) return ready
    saveActionState('disable_lock', request.inputs.disable_lock)
    const lockResult = await acquireDeploymentLock(request, ready)
    if ('reasonCode' in lockResult) return lockResult
    lease = lockResult
    return await continueDeployment(request, ready, lease, progress)
  } catch (error) {
    saveActionState('bypass', 'true')
    if (lease !== null) {
      await lease.cleanup('after deployment orchestration failed')
    }
    return terminal(request, {
      runResult: undefined,
      decision: 'failure',
      reasonCode: 'unexpected_error',
      deploymentId: progress.deploymentId,
      deploymentType: progress.deploymentType,
      environment: progress.environment,
      ref: progress.ref,
      sha: progress.sha,
      error
    })
  }
}
