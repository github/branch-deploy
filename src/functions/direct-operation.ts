import * as core from '../actions-core.ts'
import {saveActionState} from '../action-io.ts'
import {legacyLockData, legacyStrictTrue} from '../trust-boundaries.ts'
import {actionStatus} from './action-status.ts'
import {API_HEADERS} from './api-headers.ts'
import {COLORS} from './colors.ts'
import {constructValidBranchName} from './valid-branch-name.ts'
import {dedent} from './dedent.ts'
import {environmentTargets} from './environment-targets.ts'
import {formatLockReason} from './format-lock-reason.ts'
import {lock} from './lock.ts'
import {LOCK_METADATA} from './lock-metadata.ts'
import {timeDiff} from './time-diff.ts'
import {unlock} from './unlock.ts'
import {validPermissions} from './valid-permissions.ts'
import type {IssueCommandAnalysis} from './issue-command.ts'
import type {
  ActionInputs,
  BranchDeployContext,
  BranchDeployOctokit,
  Operation,
  OperationOutcome
} from '../types.ts'

export interface DirectOperationRequest {
  readonly body: string
  readonly command: IssueCommandAnalysis & {
    readonly dispatch: 'lock' | 'lock_info' | 'unlock'
  }
  readonly context: BranchDeployContext
  readonly environment: string
  readonly inputs: ActionInputs
  readonly octokit: BranchDeployOctokit
  readonly operation: Operation
  readonly reactionId: number | null
}

const lockingDisabledMessage =
  '🔓 Deployment locking is disabled for this Action — lock/unlock commands have no effect.'

async function reportLockingDisabled(
  request: DirectOperationRequest,
  environment: string
): Promise<OperationOutcome> {
  await actionStatus({
    context: request.context,
    octokit: request.octokit,
    reactionId: request.reactionId,
    message: lockingDisabledMessage,
    result: 'alternate-success'
  })
  saveActionState('bypass', 'true')
  return {
    runResult: 'safe-exit',
    decision: 'complete',
    reasonCode: 'locking_disabled',
    operation: request.operation,
    environment
  }
}

async function showLockDetails(
  request: DirectOperationRequest,
  environment: string
): Promise<OperationOutcome> {
  const {context, inputs, octokit, operation, reactionId} = request
  core.debug('detailsOnly lock request detected')
  const lockResponse = await lock({
    octokit,
    context,
    ref: null,
    reactionId,
    sticky: null,
    environment: null,
    mode: {type: 'details', postDeployStep: false},
    leaveComment: true
  })

  if (lockResponse.status === false || lockResponse.status === 'ambiguous') {
    saveActionState('bypass', 'true')
    return {
      runResult: 'failure',
      decision: 'failure',
      reasonCode: 'lock_conflict',
      operation,
      environment
    }
  }

  const lockData = legacyLockData(lockResponse.lockData)
  if (lockResponse.status !== null) {
    const totalTime = timeDiff(lockData.created_at, new Date().toISOString())
    let globalMessage = ''
    let environmentMessage = `- __Environment__: \`${String(lockData.environment)}\``
    let lockBranchName = `${String(constructValidBranchName(lockData.environment))}-${LOCK_METADATA.lockBranchSuffix}`
    if (legacyStrictTrue(lockData.global)) {
      globalMessage = dedent(`

        This is a **global** deploy lock - All environments are currently locked

      `)
      environmentMessage = dedent(`
        - __Environments__: \`all\`
        - __Global__: \`true\`
      `)
      core.info(
        `🌏 there is a ${COLORS.highlight}global${COLORS.reset} deployment lock on this repository`
      )
      lockBranchName = LOCK_METADATA.globalLockBranch
    }

    const lockMessageHeader = dedent(`
      ### Lock Details 🔒

      The deployment lock is currently claimed by __${lockData.created_by}__${globalMessage}
    `)
    const lockMessageDetails = dedent(`
      - __Branch__: \`${String(lockData.branch)}\`
      - __Created At__: \`${lockData.created_at}\`
      - __Created By__: \`${lockData.created_by}\`
      - __Sticky__: \`${String(lockData.sticky)}\`
      ${environmentMessage}
      - __Comment Link__: [click here](${lockData.link})
      - __Lock Link__: [click here](${String(process.env['GITHUB_SERVER_URL'])}/${context.repo.owner}/${context.repo.repo}/blob/${lockBranchName}/${LOCK_METADATA.lockFile})

      The current lock has been active for \`${totalTime}\`

      > If you need to release the lock, please comment \`${lockData.unlock_command}\`
    `)
    await actionStatus({
      context,
      octokit,
      reactionId,
      message: [
        lockMessageHeader,
        formatLockReason(lockData.reason),
        lockMessageDetails
      ].join('\n\n'),
      result: 'alternate-success'
    })
    core.info(
      `🔒 the deployment lock is currently claimed by ${COLORS.highlight}${lockData.created_by}`
    )
  } else {
    const lockTarget = lockResponse.global ? 'global' : lockResponse.environment
    const lockCommand = lockResponse.global
      ? `${inputs.lock_trigger} ${lockResponse.globalFlag}`
      : `${inputs.lock_trigger} ${String(lockTarget)}`
    const lockMessage = dedent(`
      ### Lock Details 🔒

      No active \`${String(lockTarget)}\` deployment locks found for the \`${context.repo.owner}/${context.repo.repo}\` repository

      > If you need to create a \`${String(lockTarget)}\` lock, please comment \`${lockCommand}\`
    `)
    await actionStatus({
      context,
      octokit,
      reactionId,
      message: lockMessage,
      result: 'alternate-success'
    })
    core.info('✅ no active deployment locks found')
  }

  saveActionState('bypass', 'true')
  return {
    runResult: 'safe-exit',
    decision: 'complete',
    reasonCode: 'lock_info_completed',
    operation,
    environment
  }
}

async function acquireDirectLock(
  request: DirectOperationRequest,
  environment: string,
  progress: {ref: string | null}
): Promise<OperationOutcome> {
  const {context, octokit, operation, reactionId} = request
  const pr = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: context.issue.number,
    headers: API_HEADERS
  })
  const ref = pr.data.head.ref
  progress.ref = ref
  const lockResponse = await lock({
    octokit,
    context,
    ref,
    reactionId,
    sticky: true,
    environment: null,
    mode: {type: 'acquire', postDeployStep: false},
    leaveComment: true
  })
  saveActionState('bypass', 'true')
  const reasonCode =
    lockResponse.status === true
      ? 'lock_acquired'
      : lockResponse.status === 'owner'
        ? 'lock_already_owned'
        : 'lock_conflict'
  return {
    runResult: 'safe-exit',
    decision: reasonCode === 'lock_conflict' ? 'stop' : 'complete',
    reasonCode,
    operation,
    environment,
    ref
  }
}

async function releaseDirectLock(
  request: DirectOperationRequest,
  environment: string
): Promise<OperationOutcome> {
  const {context, octokit, operation, reactionId} = request
  core.debug('running unlock command logic')
  const unlocked = await unlock({
    octokit,
    context,
    reactionId,
    target: {type: 'context'},
    mode: 'interactive'
  })
  saveActionState('bypass', 'true')
  if (!unlocked) core.setFailed('failed to remove the deployment lock')
  return {
    runResult: 'safe-exit',
    decision: unlocked ? 'complete' : 'failure',
    reasonCode: unlocked ? 'unlock_completed' : 'unlock_failed',
    operation,
    environment
  }
}

export async function runDirectOperation(
  request: DirectOperationRequest
): Promise<OperationOutcome> {
  const {body, command, context, inputs, octokit, operation, reactionId} =
    request
  const progress: {environment: string | null; ref: string | null} = {
    environment: null,
    ref: null
  }
  try {
    const permission = await validPermissions(
      octokit,
      context,
      inputs.permissions
    )
    if (permission !== true) {
      await actionStatus({context, octokit, reactionId, message: permission})
      saveActionState('bypass', 'true')
      core.setFailed(permission)
      return {
        runResult: 'failure',
        decision: 'failure',
        reasonCode: 'permission_denied',
        operation
      }
    }

    const target = await environmentTargets({
      mode: 'lock',
      environment: request.environment,
      body,
      trigger: inputs.lock_trigger,
      alternateTrigger: inputs.unlock_trigger,
      context,
      octokit,
      reactionId
    })
    if (target.environment === false) {
      core.debug('No valid environment targets found for lock/unlock request')
      return {
        runResult: 'safe-exit',
        decision: 'stop',
        reasonCode: 'invalid_environment',
        operation
      }
    }
    progress.environment = target.environment

    if (inputs.disable_lock) {
      return await reportLockingDisabled(request, target.environment)
    }

    if (command.dispatch === 'lock_info') {
      return await showLockDetails(request, target.environment)
    }
    if (command.dispatch === 'lock') {
      return await acquireDirectLock(request, target.environment, progress)
    }
    return await releaseDirectLock(request, target.environment)
  } catch (error) {
    saveActionState('bypass', 'true')
    return {
      runResult: undefined,
      decision: 'failure',
      reasonCode: 'unexpected_error',
      operation,
      environment: progress.environment,
      ref: progress.ref,
      error
    }
  }
}
