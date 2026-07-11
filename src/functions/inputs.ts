import {stringToArray} from '../functions/string-to-array.ts'
import {getActionInput, getBooleanActionInput} from '../action-io.ts'
import type {ActionInputKey, IntegerActionInputKey} from '../action-io.ts'
import type {
  ActionInputs,
  ChecksInput,
  OutdatedMode,
  UpdateBranchMode
} from '../types.ts'

export const UPDATE_BRANCH_VALUES = [
  'disabled',
  'warn',
  'force'
] as const satisfies readonly UpdateBranchMode[]
export const OUTDATED_MODE_VALUES = [
  'pr_base',
  'default_branch',
  'strict'
] as const satisfies readonly OutdatedMode[]
export const CHECKS_MODE_VALUES = [
  'all',
  'required'
] as const satisfies readonly Extract<ChecksInput, string>[]

export const LITERAL_ACTION_INPUT_KEYS = [
  'update_branch',
  'outdated_mode',
  'checks'
] as const satisfies readonly ActionInputKey[]

export type LiteralActionInputKey = (typeof LITERAL_ACTION_INPUT_KEYS)[number]

export const LITERAL_ACTION_INPUT_VALUES = {
  update_branch: UPDATE_BRANCH_VALUES,
  outdated_mode: OUTDATED_MODE_VALUES,
  checks: CHECKS_MODE_VALUES
} as const satisfies Readonly<Record<LiteralActionInputKey, readonly string[]>>

// Helper function to validate the input values
// :param inputName: The name of the input being validated (string)
// :param inputValue: The input value to validate (string)
// :param validValues: An array of valid values for the input (array)
function validateInput<const Value extends string>(
  inputName: string,
  inputValue: string,
  validValues: readonly Value[]
): Value {
  const validValue = validValues.find(value => value === inputValue)
  if (validValue === undefined) {
    throw new Error(
      `Invalid value for '${inputName}': ${inputValue}. Must be one of: ${validValues.join(
        ', '
      )}`
    )
  }
  return validValue
}

// Helper function to parse and validate integer inputs
// :param inputName: The name of the input being parsed (string)
// :returns: The parsed integer value
function getIntInput(inputName: IntegerActionInputKey): number {
  const inputValue = getActionInput(inputName)
  if (!/^[1-9][0-9]*$/u.test(inputValue)) {
    throw new Error(
      `Invalid value for ${inputName}: must be a positive integer`
    )
  }
  const value = Number(inputValue)
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `Invalid value for ${inputName}: must be a positive integer`
    )
  }
  return value
}

// Helper function to get all the inputs for the Action
// :returns: An object containing all the inputs
export function getInputs(): ActionInputs {
  const environment = getActionInput('environment', {required: true})
  const trigger = getActionInput('trigger', {required: true})
  const reaction = getActionInput('reaction')
  const stable_branch = getActionInput('stable_branch')
  const noop_trigger = getActionInput('noop_trigger')
  const lock_trigger = getActionInput('lock_trigger')
  const production_environments = stringToArray(
    getActionInput('production_environments')
  )
  const environment_targets = getActionInput('environment_targets')
  const draft_permitted_targets = getActionInput('draft_permitted_targets')
  const unlock_trigger = getActionInput('unlock_trigger')
  const help_trigger = getActionInput('help_trigger')
  const lock_info_alias = getActionInput('lock_info_alias')
  const global_lock_flag = getActionInput('global_lock_flag')
  const required_contexts = getActionInput('required_contexts')
  const allowForks = getBooleanActionInput('allow_forks')
  const skipCi = getActionInput('skip_ci')
  const rawChecks = getActionInput('checks')
  const skipReviews = getActionInput('skip_reviews')
  const mergeDeployMode = getBooleanActionInput('merge_deploy_mode')
  const unlockOnMergeMode = getBooleanActionInput('unlock_on_merge_mode')
  const admins = getActionInput('admins')
  const environment_urls = getActionInput('environment_urls')
  const param_separator = getActionInput('param_separator')
  const permissions = stringToArray(getActionInput('permissions'))
  const sticky_locks = getBooleanActionInput('sticky_locks')
  const sticky_locks_for_noop = getBooleanActionInput('sticky_locks_for_noop')
  const disable_lock = getBooleanActionInput('disable_lock')
  const allow_sha_deployments = getBooleanActionInput('allow_sha_deployments')
  const disable_naked_commands = getBooleanActionInput('disable_naked_commands')
  const enforced_deployment_order = stringToArray(
    getActionInput('enforced_deployment_order')
  )
  const commit_verification = getBooleanActionInput('commit_verification')
  const ignored_checks = stringToArray(getActionInput('ignored_checks'))
  const use_security_warnings = getBooleanActionInput('use_security_warnings')
  const allow_non_default_target_branch_deployments = getBooleanActionInput(
    'allow_non_default_target_branch_deployments'
  )
  const deployment_confirmation = getBooleanActionInput(
    'deployment_confirmation'
  )
  const deployment_confirmation_timeout = getIntInput(
    'deployment_confirmation_timeout'
  )

  // validate inputs
  const update_branch: UpdateBranchMode = validateInput(
    'update_branch',
    getActionInput('update_branch'),
    UPDATE_BRANCH_VALUES
  )
  const outdated_mode: OutdatedMode = validateInput(
    'outdated_mode',
    getActionInput('outdated_mode'),
    OUTDATED_MODE_VALUES
  )

  let checks: ChecksInput
  if (rawChecks === 'all' || rawChecks === 'required') {
    checks = validateInput('checks', rawChecks, CHECKS_MODE_VALUES)
  } else {
    checks = stringToArray(rawChecks)
  }

  // rollup all the inputs into a single object
  return {
    trigger: trigger,
    reaction: reaction,
    environment: environment,
    stable_branch: stable_branch,
    noop_trigger: noop_trigger,
    lock_trigger: lock_trigger,
    production_environments: production_environments,
    environment_targets: environment_targets,
    unlock_trigger: unlock_trigger,
    global_lock_flag: global_lock_flag,
    help_trigger: help_trigger,
    lock_info_alias: lock_info_alias,
    update_branch: update_branch,
    outdated_mode: outdated_mode,
    required_contexts: required_contexts,
    allowForks: allowForks,
    skipCi: skipCi,
    checks: checks,
    skipReviews: skipReviews,
    draft_permitted_targets,
    admins: admins,
    permissions: permissions,
    allow_sha_deployments: allow_sha_deployments,
    disable_naked_commands: disable_naked_commands,
    mergeDeployMode: mergeDeployMode,
    unlockOnMergeMode: unlockOnMergeMode,
    environment_urls: environment_urls,
    param_separator: param_separator,
    sticky_locks: sticky_locks,
    sticky_locks_for_noop: sticky_locks_for_noop,
    disable_lock: disable_lock,
    enforced_deployment_order: enforced_deployment_order,
    commit_verification: commit_verification,
    ignored_checks: ignored_checks,
    deployment_confirmation: deployment_confirmation,
    deployment_confirmation_timeout: deployment_confirmation_timeout,
    use_security_warnings: use_security_warnings,
    allow_non_default_target_branch_deployments:
      allow_non_default_target_branch_deployments
  }
}
