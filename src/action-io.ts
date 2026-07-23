import * as core from './actions-core.ts'

export const ACTION_INPUT_KEYS = [
  'github_token',
  'status',
  'environment',
  'environment_targets',
  'draft_permitted_targets',
  'environment_urls',
  'environment_url_in_comment',
  'production_environments',
  'reaction',
  'trigger',
  'noop_trigger',
  'lock_trigger',
  'unlock_trigger',
  'help_trigger',
  'lock_info_alias',
  'permissions',
  'commit_verification',
  'param_separator',
  'global_lock_flag',
  'stable_branch',
  'update_branch',
  'outdated_mode',
  'required_contexts',
  'skip_ci',
  'checks',
  'ignored_checks',
  'skip_reviews',
  'allow_forks',
  'admins',
  'admins_pat',
  'merge_deploy_mode',
  'unlock_on_merge_mode',
  'skip_completing',
  'deploy_message_path',
  'sticky_locks',
  'sticky_locks_for_noop',
  'disable_lock',
  'allow_sha_deployments',
  'disable_naked_commands',
  'successful_deploy_labels',
  'successful_noop_labels',
  'failed_deploy_labels',
  'failed_noop_labels',
  'skip_successful_noop_labels_if_approved',
  'skip_successful_deploy_labels_if_approved',
  'enforced_deployment_order',
  'use_security_warnings',
  'allow_non_default_target_branch_deployments',
  'deployment_confirmation',
  'deployment_confirmation_timeout'
] as const satisfies readonly string[]

export type ActionInputKey = (typeof ACTION_INPUT_KEYS)[number]

export const BOOLEAN_ACTION_INPUT_KEYS = [
  'environment_url_in_comment',
  'commit_verification',
  'allow_forks',
  'merge_deploy_mode',
  'unlock_on_merge_mode',
  'skip_completing',
  'sticky_locks',
  'sticky_locks_for_noop',
  'disable_lock',
  'allow_sha_deployments',
  'disable_naked_commands',
  'skip_successful_noop_labels_if_approved',
  'skip_successful_deploy_labels_if_approved',
  'use_security_warnings',
  'allow_non_default_target_branch_deployments',
  'deployment_confirmation'
] as const satisfies readonly ActionInputKey[]

export type BooleanActionInputKey = (typeof BOOLEAN_ACTION_INPUT_KEYS)[number]

export const INTEGER_ACTION_INPUT_KEYS = [
  'deployment_confirmation_timeout'
] as const satisfies readonly ActionInputKey[]

export type IntegerActionInputKey = (typeof INTEGER_ACTION_INPUT_KEYS)[number]

export const ACTION_OUTPUT_KEYS = [
  'continue',
  'triggered',
  'comment_body',
  'issue_number',
  'actor',
  'environment',
  'params',
  'parsed_params',
  'noop',
  'sha',
  'default_branch_tree_sha',
  'base_ref',
  'ref',
  'comment_id',
  'type',
  'fork',
  'fork_ref',
  'fork_label',
  'fork_checkout',
  'fork_full_name',
  'deployment_id',
  'environment_url',
  'initial_reaction_id',
  'initial_comment_id',
  'actor_handle',
  'global_lock_claimed',
  'global_lock_released',
  'unlocked_environments',
  'sha_deployment',
  'review_decision',
  'is_outdated',
  'merge_state_status',
  'commit_status',
  'approved_reviews_count',
  'needs_to_be_deployed',
  'commit_verified',
  'total_seconds',
  'non_default_target_branch_used',
  'decision',
  'reason_code',
  'result'
] as const satisfies readonly string[]

export type ActionOutputKey = (typeof ACTION_OUTPUT_KEYS)[number]

export const ACTION_STATE_KEYS = [
  'actionsToken',
  'approved_reviews_count',
  'bypass',
  'comment_id',
  'commit_verified',
  'deployment_id',
  'deployment_start_time',
  'disable_lock',
  'environment',
  'environment_url',
  'fork',
  'initial_comment_id',
  'isPost',
  'lock_ref_sha',
  'noop',
  'params',
  'parsed_params',
  'reaction_id',
  'ref',
  'review_decision',
  'sha',
  'trusted_sha'
] as const satisfies readonly string[]

export type ActionStateKey = (typeof ACTION_STATE_KEYS)[number]

export function getActionInput(
  name: ActionInputKey,
  options?: core.InputOptions
): string {
  return core.getInput(name, options)
}

export function getBooleanActionInput(
  name: BooleanActionInputKey,
  options?: core.InputOptions
): boolean {
  return core.getBooleanInput(name, options)
}

export function setActionOutput(name: ActionOutputKey, value: unknown): void {
  core.setOutput(name, value)
}

export function saveActionState(name: ActionStateKey, value: unknown): void {
  core.saveState(name, value)
}

export function getActionState(name: ActionStateKey): string {
  return core.getState(name)
}
