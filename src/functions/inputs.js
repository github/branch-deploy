import * as core from '@actions/core'
import {stringToArray} from '../functions/string-to-array'

// Helper function to validate the input values
// :param inputName: The name of the input being validated (string)
// :param inputValue: The input value to validate (string)
// :param validValues: An array of valid values for the input (array)
function validateInput(inputName, inputValue, validValues) {
  if (!validValues.includes(inputValue)) {
    throw new Error(
      `Invalid value for '${inputName}': ${inputValue}. Must be one of: ${validValues.join(
        ', '
      )}`
    )
  }
}

// Helper function to get all the inputs for the Action
// :returns: An object containing all the inputs
export function getInputs() {
  var environment = core.getInput('environment', {required: true})
  const trigger = core.getInput('trigger', {required: true})
  const reaction = core.getInput('reaction')
  const stable_branch = core.getInput('stable_branch')
  const noop_trigger = core.getInput('noop_trigger')
  const lock_trigger = core.getInput('lock_trigger')
  const production_environments = stringToArray(
    core.getInput('production_environments')
  )
  const environment_targets = core.getInput('environment_targets')
  const draft_permitted_targets = core.getInput('draft_permitted_targets')
  const unlock_trigger = core.getInput('unlock_trigger')
  const help_trigger = core.getInput('help_trigger')
  const lock_info_alias = core.getInput('lock_info_alias')
  const global_lock_flag = core.getInput('global_lock_flag')
  const update_branch = core.getInput('update_branch')
  const outdated_mode = core.getInput('outdated_mode')
  const required_contexts = core.getInput('required_contexts')
  const allowForks = core.getBooleanInput('allow_forks')
  const skipCi = core.getInput('skip_ci')
  const checks = core.getInput('checks')
  const skipReviews = core.getInput('skip_reviews')
  const mergeDeployMode = core.getBooleanInput('merge_deploy_mode')
  const unlockOnMergeMode = core.getBooleanInput('unlock_on_merge_mode')
  const admins = core.getInput('admins')
  const environment_urls = core.getInput('environment_urls')
  const param_separator = core.getInput('param_separator')
  const permissions = stringToArray(core.getInput('permissions'))
  const sticky_locks = core.getBooleanInput('sticky_locks')
  const sticky_locks_for_noop = core.getBooleanInput('sticky_locks_for_noop')
  const allow_sha_deployments = core.getBooleanInput('allow_sha_deployments')
  const disable_naked_commands = core.getBooleanInput('disable_naked_commands')
  const enforced_deployment_order = stringToArray(
    core.getInput('enforced_deployment_order')
  )
  const commit_verification = core.getBooleanInput('commit_verification')

  // validate inputs
  validateInput('update_branch', update_branch, ['disabled', 'warn', 'force'])
  validateInput('outdated_mode', outdated_mode, [
    'pr_base',
    'default_branch',
    'strict'
  ])
  validateInput('checks', checks, ['all', 'required'])

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
    enforced_deployment_order: enforced_deployment_order,
    commit_verification: commit_verification
  }
}
