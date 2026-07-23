import {setActionOutput} from './action-io.ts'
import type {
  OperationReasonCode,
  OperationResultV1,
  RunResult
} from './types.ts'

export const OPERATION_REASON_CODES = [
  'unlock_on_merge_completed',
  'merge_deploy_required',
  'merge_deploy_not_required',
  'unsupported_event',
  'deprecated_command',
  'naked_command_disabled',
  'no_trigger',
  'permission_denied',
  'help_completed',
  'invalid_environment',
  'lock_info_completed',
  'locking_disabled',
  'lock_acquired',
  'lock_already_owned',
  'lock_conflict',
  'unlock_completed',
  'unlock_failed',
  'prechecks_failed',
  'commit_safety_failed',
  'deployment_order_failed',
  'ref_changed',
  'deployment_sha_mismatch',
  'confirmation_rejected',
  'confirmation_timed_out',
  'noop_ready',
  'base_branch_update_required',
  'deployment_ready',
  'unexpected_error'
] as const satisfies readonly OperationReasonCode[]

export function finishOperation(
  runResult: RunResult,
  result: OperationResultV1
): RunResult {
  setActionOutput('decision', result.decision)
  setActionOutput('reason_code', result.reason_code)
  setActionOutput('result', JSON.stringify(result))
  return runResult
}
