import * as core from '../actions-core.ts'
import {getActionInput, setActionOutput} from '../action-io.ts'
import type {
  CompletionContext,
  CompletionMetadata,
  CompletionSettings,
  IssueCommentContext
} from '../types.ts'
import {serializeCompletionContext} from './result-context.ts'

export function deferredCompletionRequested(): boolean {
  // Leave malformed boolean handling at the original post-action boundary.
  const value = getActionInput('skip_completing')
  return value === 'true' || value === 'True' || value === 'TRUE'
}

export function deferredCompletionMetadata({
  context,
  trustedSha,
  lockRefSha,
  disableLock
}: {
  readonly context: IssueCommentContext
  readonly trustedSha: string | undefined
  readonly lockRefSha: string | undefined
  readonly disableLock: boolean
}): CompletionMetadata | null {
  if (!deferredCompletionRequested()) return null

  const runAttempt = Number(process.env['GITHUB_RUN_ATTEMPT'])
  if (
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1 ||
    trustedSha === undefined
  ) {
    core.warning(
      'completion context is unavailable; complete this deployment manually'
    )
    return null
  }

  return {
    schema_version: 1,
    repository: `${context.repo.owner}/${context.repo.repo}`,
    run_id: context.runId,
    run_attempt: runAttempt,
    issue_number: context.issue.number,
    trigger_comment_id: context.payload.comment.id,
    trusted_sha: trustedSha,
    lock_ref_sha: lockRefSha ?? null,
    disable_lock: disableLock
  }
}

export function completionSettings(): CompletionSettings {
  return {
    deploy_message_path: getActionInput('deploy_message_path'),
    environment_url_in_comment: getActionInput('environment_url_in_comment'),
    successful_deploy_labels: getActionInput('successful_deploy_labels'),
    failed_deploy_labels: getActionInput('failed_deploy_labels'),
    successful_noop_labels: getActionInput('successful_noop_labels'),
    failed_noop_labels: getActionInput('failed_noop_labels'),
    skip_successful_noop_labels_if_approved: getActionInput(
      'skip_successful_noop_labels_if_approved'
    ),
    skip_successful_deploy_labels_if_approved: getActionInput(
      'skip_successful_deploy_labels_if_approved'
    )
  }
}

export function publishCompletionContext(context: CompletionContext): void {
  const value = serializeCompletionContext(context)
  if (value === null) {
    core.warning(
      'completion context is too large; complete this deployment manually'
    )
    return
  }
  setActionOutput('context', value)
}
