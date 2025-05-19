import * as core from '@actions/core'
import dedent from 'dedent-js'
import {actionStatus} from './action-status.js'

const defaultSpecificMessage = '<something went wrong - please report this>'
const usageGuideLink =
  'https://github.com/github/branch-deploy/blob/main/docs/usage.md'

export async function help(octokit, context, reactionId, inputs) {
  var update_branch_message = defaultSpecificMessage
  if (inputs.update_branch.trim() === 'warn') {
    update_branch_message =
      'This Action will warn if the branch is out of date with the base branch'
  } else if (inputs.update_branch.trim() === 'force') {
    update_branch_message =
      'This Action will force update the branch to the base branch if it is out of date'
  } else if (inputs.update_branch.trim() === 'disabled') {
    update_branch_message =
      'This Action will not update the branch to the base branch before deployment'
  } else update_branch_message = 'Unknown value for update_branch'

  var required_contexts_message = defaultSpecificMessage
  if (inputs.required_contexts.trim() === 'false') {
    required_contexts_message =
      'There are no designated required contexts for this Action (default and suggested)'
  } else {
    required_contexts_message = `There are required contexts designated for this Action`
  }

  var commit_verification_message = defaultSpecificMessage
  if (inputs.commit_verification === true) {
    commit_verification_message = `This Action will require that commits have a verified signature before they can be deployed`
  } else {
    commit_verification_message = `This Action will not require commits to have a verified signature before they can be deployed`
  }

  var checks_message = defaultSpecificMessage
  if (
    typeof inputs.checks === 'string' &&
    inputs.checks.trim() === 'required'
  ) {
    checks_message = `Only required CI checks must pass before a deployment can be requested`
  } else if (
    typeof inputs.checks === 'string' &&
    inputs.checks.trim() === 'all'
  ) {
    checks_message = `All CI checks must pass before a deployment can be requested`
  } else {
    checks_message = `The following CI checks must pass before a deployment can be requested: \`${inputs.checks.join(`,`)}\``
  }

  var ignored_checks_message = defaultSpecificMessage
  if (inputs.ignored_checks.length > 0) {
    ignored_checks_message = `The following CI checks will be ignored when determining if a deployment can be requested: \`${inputs.ignored_checks.join(`,`)}\``
  } else {
    ignored_checks_message = `No CI checks will be ignored when determining if a deployment can be requested`
  }

  var skip_ci_message = defaultSpecificMessage
  if (inputs.skipCi.trim() !== '') {
    skip_ci_message = `This Action will not require passing CI for the environments specified`
  } else {
    inputs.skipCi = 'false'
    skip_ci_message = `This Action will require passing CI for all environments`
  }

  var skip_reviews_message = defaultSpecificMessage
  if (inputs.skipReviews.trim() !== '') {
    skip_reviews_message = `This Action will not require passing reviews for the environments specified`
  } else {
    inputs.skipReviews = 'false'
    skip_reviews_message = `This Action will require passing reviews for all environments`
  }

  var draft_permitted_targets_message = defaultSpecificMessage
  if (inputs.draft_permitted_targets.trim() !== '') {
    draft_permitted_targets_message = `This Action will allow draft pull requests to request deployments to the listed environments`
  } else {
    inputs.draft_permitted_targets = 'false'
    draft_permitted_targets_message = `This Action will not draft pull requests to be deployed to any environment`
  }

  var admins_message = defaultSpecificMessage
  if (inputs.admins.trim() === 'false') {
    admins_message = `This Action has no designated admins (default)`
  } else {
    admins_message = `This Action will allow the listed admins to bypass pull request reviews before deployment`
  }

  var sha_deployment_message = defaultSpecificMessage
  if (inputs.allow_sha_deployments === true) {
    sha_deployment_message = `This Action will allow deployments to an exact SHA (potentially dangerous/unsafe)`
  } else {
    sha_deployment_message = `This Action will not allow deployments to an exact SHA (recommended)`
  }

  var enforced_deployment_order_message = defaultSpecificMessage
  if (inputs.enforced_deployment_order.length > 0) {
    enforced_deployment_order_message = `Deployments are required to follow a specific deployment order by environment before the next one can proceed: ${inputs.enforced_deployment_order.join(
      ', '
    )}`
  } else {
    enforced_deployment_order_message = `Deployments can be made to any environment in any order`
  }

  // Construct the message to add to the issue comment
  const comment = dedent(`
  ## 📚 Branch Deployment Help

  This help message was automatically generated based on the inputs provided to this Action.

  ### 💻 Available Commands

  - \`${inputs.help_trigger}\` - Show this help message
  - \`${inputs.trigger}\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.noop_trigger}\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment in noop mode
  - \`${
    inputs.lock_trigger
  }\` - Obtain the deployment lock (will persist until the lock is released)
  - \`${
    inputs.lock_trigger
  } --reason <text>\` - Obtain the deployment lock with a reason (will persist until the lock is released)
  - \`${
    inputs.lock_trigger
  } <environment>\` - Obtain the deployment lock for the specified environment (will persist until the lock is released)
  - \`${
    inputs.lock_trigger
  } <environment> --reason <text>\` - Obtain the deployment lock for the specified environment with a reason (will persist until the lock is released)
  - \`${inputs.lock_trigger} ${
    inputs.global_lock_flag
  }\` - Obtain a global deployment lock (will persist until the lock is released) - Blocks all environments
  - \`${inputs.lock_trigger} ${
    inputs.global_lock_flag
  } --reason <text>\` - Obtain a global deployment lock with a reason (will persist until the lock is released) - Blocks all environments
  - \`${inputs.unlock_trigger}\` - Release the deployment lock (if one exists)
  - \`${
    inputs.unlock_trigger
  } <environment>\` - Release the deployment lock for the specified environment (if one exists)
  - \`${inputs.unlock_trigger} ${
    inputs.global_lock_flag
  }\` - Release the global deployment lock (if one exists)
  - \`${
    inputs.lock_trigger
  } --details\` - Show information about the current deployment lock (if one exists)
  - \`${
    inputs.lock_trigger
  } <environment> --details\` - Get information about the current deployment lock for the specified environment (if one exists)
  - \`${inputs.lock_trigger} ${
    inputs.global_lock_flag
  } --details\` - Show information about the current global deployment lock (if one exists)
  - \`${inputs.lock_info_alias}\` - Alias for \`${
    inputs.lock_trigger
  } --details\`

  ### 🌍 Environments

  These are the available environments for this Action as defined by the inputs provided to this Action.

  > Note: Just because an environment is listed here does not mean it is available for deployment

  - \`${inputs.environment}\` - The default environment for this Action
  - \`${
    inputs.production_environments
  }\` - The environments that are considered "production"
  - \`${
    inputs.environment_targets
  }\` - The list of environments that can be targeted for deployment
  - Deployment Order: ${enforced_deployment_order_message}

  ### 🔭 Example Commands

  The following set of examples use this Action's inputs to show you how to use the commands.

  - \`${inputs.trigger}\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.trigger} ${inputs.stable_branch} to <environment>\` - Rollback the specified \`<environment>\` to the \`${inputs.stable_branch}\` branch (long form syntax)
  - \`${inputs.noop_trigger}\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment in noop mode
  - \`${inputs.trigger} to <${inputs.environment_targets.replaceAll(
    ',',
    '|'
  )}>\` - Deploy this branch to the specified environment (note: the \`to\` keyword is optional)
  - \`${inputs.lock_trigger} <${inputs.environment_targets.replaceAll(
    ',',
    '|'
  )}>\` - Obtain the deployment lock for the specified environment
  - \`${inputs.unlock_trigger} <${inputs.environment_targets.replaceAll(
    ',',
    '|'
  )}>\` - Release the deployment lock for the specified environment
  - \`${inputs.lock_trigger} <${inputs.environment_targets.replaceAll(
    ',',
    '|'
  )}> --details\` - Get information about the deployment lock for the specified environment

  ### ⚙️ Configuration

  The following configuration options have been defined for this Action:

  - \`reaction: ${
    inputs.reaction
  }\` - The GitHub reaction icon to add to the deployment comment when a deployment is triggered
  - \`update_branch: ${inputs.update_branch}\` - ${update_branch_message}
  - \`outdated_mode: ${inputs.outdated_mode}\`
  - \`commit_verification: ${inputs.commit_verification}\` - ${commit_verification_message}
  - \`required_contexts: ${
    inputs.required_contexts
  }\` - ${required_contexts_message}
  - \`allowForks: ${inputs.allowForks}\` - This Action will ${
    inputs.allowForks === 'true' ? 'run' : 'not run'
  } on forked repositories
  - \`skipCi: ${inputs.skipCi}\` - ${skip_ci_message}
  - \`checks: ${inputs.checks}\` - ${checks_message}
  - \`use_security_warnings: ${inputs.use_security_warnings}\` - This Action will ${inputs.use_security_warnings === true ? 'use' : 'not use'} security warnings
  - \`ignored_checks: ${inputs.ignored_checks}\` - ${ignored_checks_message}
  - \`skipReviews: ${inputs.skipReviews}\` - ${skip_reviews_message}
  - \`draft_permitted_targets: ${
    inputs.draft_permitted_targets
  }\` - ${draft_permitted_targets_message}
  - \`admins: ${inputs.admins}\` - ${admins_message}
  - \`deployment_confirmation: ${
    inputs.deployment_confirmation
  }\` - This Action will ${
    inputs.deployment_confirmation === true ? 'require' : 'not require'
  } additional confirmation before deploying
  - \`deployment_confirmation_timeout: ${
    inputs.deployment_confirmation_timeout
  }\` - The timeout (seconds) for the deployment confirmation
  - \`permissions: ${inputs.permissions.join(
    ','
  )}\` - The acceptable permissions that this Action will require to run
  - \`allow_sha_deployments: ${
    inputs.allow_sha_deployments
  }\` - ${sha_deployment_message}
  - \`allow_non_default_target_branch_deployments: ${
    inputs.allow_non_default_target_branch_deployments
  }\` - This Action will ${
    inputs.allow_non_default_target_branch_deployments === true
      ? 'allow'
      : 'not allow'
  } the deployments of pull requests that target a branch other than the default branch (aka stable branch)

  ---

  > View the full usage guide [here](${usageGuideLink}) for additional help
  `)

  core.debug(comment)

  // Put the help comment on the pull request
  await actionStatus(
    context,
    octokit,
    reactionId,
    comment,
    true, // success is true
    true // thumbs up instead of rocket
  )
}
