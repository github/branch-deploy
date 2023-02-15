import * as core from '@actions/core'
import dedent from 'dedent-js'
import {actionStatus} from './action-status'

const defaultSpecificMessage = '<something went wrong - please report this>'

export async function help(octokit, context, reactionId, inputs) {
  var update_branch_message = defaultSpecificMessage
  if (inputs.update_branch.trim() === 'warn') {
    update_branch_message =
      'This Action will warn if the branch is out of date with the base branch'
  } else if (inputs.update_branch === 'force') {
    update_branch_message =
      'This Action will force update the branch to the base branch'
  } else if (inputs.update_branch === 'disabled') {
    update_branch_message =
      'This Action will not update the branch to the base branch before deployment'
  }

  var required_contexts_message = defaultSpecificMessage
  if (inputs.required_contexts.trim() === 'false') {
    required_contexts_message =
      'There are no designated required contexts for this Action (default and suggested)'
  } else {
    required_contexts_message = `There are required contexts designated for this Action`
  }

  var skip_ci_message = defaultSpecificMessage
  if (inputs.skipCi.trim() !== '') {
    skip_ci_message = `This Action will not require passing CI for the environments specified`
  } else {
    skip_ci_message = `This Action will require passing CI for all environments`
  }

  var skip_reviews_message = defaultSpecificMessage
  if (inputs.skipReviews.trim() !== '') {
    skip_reviews_message = `This Action will not require passing reviews for the environments specified`
  } else {
    skip_reviews_message = `This Action will require passing reviews for all environments`
  }

  var admins_message = defaultSpecificMessage
  if (inputs.admins.trim() === 'false') {
    admins_message = `This Action will allow the listed admins to bypass pull request reviews before deployment`
  } else {
    admins_message = `This Action has no designated admins (default)`
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
  - \`${inputs.trigger} ${
    inputs.noop_trigger
  }\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment in noop mode
  - \`${
    inputs.lock_trigger
  }\` - Obtain the deployment lock (will persist until the lock is released)
  - \`${
    inputs.lock_trigger
  } --reason <text>\` - Obtain the deployment lock with a reason (will persist until the lock is released)
  - \`${inputs.unlock_trigger}\` - Release the deployment lock (if one exists)
  - \`${
    inputs.lock_trigger
  } --info\` - Show information about the current deployment lock (if one exists)
  - \`${inputs.lock_info_alias}\` - Alias for \`${inputs.lock_trigger} --info\`

  ### 🌍 Environments

  These are the available environments for this Action as defined by the inputs provided to this Action.

  > Note: Just because an environment is listed here does not mean it is available for deployment

  - \`${inputs.environment}\` - The default environment for this Action
  - \`${
    inputs.production_environment
  }\` - The environment that is considered "production"
  - \`${
    inputs.environment_targets
  }\` - The list of environments that can be targeted for deployment

  ### 🔭 Example Commands

  The following set of examples use this Action's inputs to show you how to use the commands.

  - \`${inputs.trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${inputs.environment}\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.trigger} ${inputs.noop_trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${inputs.environment}\` environment in noop mode
  - \`${inputs.trigger} to <${inputs.environment_targets.replace(
    ',',
    '|'
  )}>\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the specified environment (note: the \`to\` keyword is optional)

  ### ⚙️ Configuration

  The following configuration options have been defined for this Action:

  - \`reaction: ${inputs.reaction}\` - The GitHub reaction icon to add to the deployment comment when a deployment is triggered
  - \`update_branch: ${inputs.update_branch}\` - ${update_branch_message}
  - \`required_contexts: ${
    inputs.required_contexts
  }\` - ${required_contexts_message}
  - \`allowForks: ${inputs.allowForks}\` - This Action will ${
    inputs.allowForks === 'true' ? 'run' : 'not run'
  } on forked repositories
  - \`prefixOnly: ${inputs.prefixOnly}\` - This Action will ${
    inputs.prefixOnly === 'true'
      ? 'only run if the comment starts with the trigger'
      : 'run if the comment contains the trigger anywhere in the comment body'
  }
  - \`skipCi: ${inputs.skipCi}\` - ${skip_ci_message}
  - \`skipReviews: ${inputs.skipReviews}\` - ${skip_reviews_message}
  - \`admins: ${inputs.admins}\` - ${admins_message}

  ---

  > View the full usage guide [here](https://github.com/github/branch-deploy/blob/main/docs/usage.md) for additional help
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
