// import * as core from '@actions/core'
import dedent from 'dedent-js'
import {actionStatus} from './action-status'

// inputs example
// {
//     trigger: trigger,
//     reaction: reaction,
//     prefixOnly: prefixOnly,
//     environment: environment,
//     stable_branch: stable_branch,
//     noop_trigger: noop_trigger,
//     lock_trigger: lock_trigger,
//     production_environment: production_environment,
//     unlock_trigger: unlock_trigger,
//     help_trigger: help_trigger,
//     lock_info_alias: lock_info_alias,
//     update_branch: update_branch,
//     required_contexts: required_contexts,
//     allowForks: allowForks,
//     skipCi: skipCi,
//     skipReviews: skipReviews,
//     mergeDeployMode: mergeDeployMode
// }

export async function help(octokit, context, reactionId, inputs) {
  // Construct the message to add to the issue comment
  const comment = dedent(`
  ## 📚 Branch Deployment Help

  This help message was automatically generated based on the inputs provided to this action.

  ### 💻 Available Commands

  - \`${inputs.help_trigger}\` - Show this help message
  - \`${inputs.trigger}\` - Deploy this branch to the \`${inputs.environment}\` environment
  - \`${inputs.trigger} ${inputs.noop_trigger}\` - Deploy this branch to the \`${inputs.environment}\` environment in noop mode
  - \`${inputs.lock_trigger}\` - Obtain the deployment lock (will persist until the lock is released)
  - \`${inputs.lock_trigger} --reason <text>\` - Obtain the deployment lock with a reason (will persist until the lock is released)
  - \`${inputs.unlock_trigger}\` - Release the deployment lock (if one exists)
  - \`${inputs.lock_trigger} --info\` - Show information about the current deployment lock (if one exists)
  - \`${inputs.lock_info_alias}\` - Alias for \`${inputs.lock_trigger} --info\`

  ---

  > View the full usage guide [here](https://github.com/github/branch-deploy/blob/main/docs/usage.md) for additional help
  `)

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
