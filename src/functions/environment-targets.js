import * as core from '@actions/core'
import {actionStatus} from './action-status'

// A simple function that checks if an explicit environment target is being used
// :param environment: The default environment from the Actions inputs
// :param body: The comment body
// :param trigger: The trigger prefix
// :param noop_trigger: The noop trigger prefix
// :param context: The context of the Action
// :param octokit: The Octokit instance
// :param reactionId: The ID of the initial comment reaction (Integer)
// :returns: the environment target (String) or false if no environment target was found (fails)
export async function environmentTargets(
  environment,
  body,
  trigger,
  noop_trigger,
  stable_branch,
  context,
  octokit,
  reactionId
) {
  // Get the environment targets from the action inputs
  const environment_targets = core.getInput('environment_targets')

  // Sanitized the input to remove any whitespace and split into an array
  const environment_targets_sanitized = environment_targets
    .split(',')
    .map(target => target.trim())

  // Loop through all the environment targets to see if an explicit target is being used
  for (const target of environment_targets_sanitized) {
    // If the body on a branch deploy contains the target
    if (body.replace(trigger, '').trim() === target) {
      core.debug(`Found environment target for branch deploy: ${target}`)
      return target
    }
    // If the body on a noop trigger contains the target
    else if (body.replace(`${trigger} ${noop_trigger}`, '').trim() === target) {
      core.debug(`Found environment target for noop trigger: ${target}`)
      return target
    }
    // If the body with 'to <target>' contains the target on a branch deploy
    else if (body.replace(trigger, '').trim() === `to ${target}`) {
      core.debug(
        `Found environment target for branch deploy (with 'to'): ${target}`
      )
      return target
    }
    // If the body with 'to <target>' contains the target on a noop trigger
    else if (
      body.replace(`${trigger} ${noop_trigger}`, '').trim() === `to ${target}`
    ) {
      core.debug(
        `Found environment target for noop trigger (with 'to'): ${target}`
      )
      return target
    }
    // If the body with 'to <target>' contains the target on a stable branch deploy
    else if (
      body.replace(`${trigger} ${stable_branch}`, '').trim() === `to ${target}`
    ) {
      core.debug(
        `Found environment target for stable branch deploy (with 'to'): ${target}`
      )
      return target
    }
    // If the body on a stable branch deploy contains the target
    if (body.replace(`${trigger} ${stable_branch}`, '').trim() === target) {
      core.debug(`Found environment target for stable branch deploy: ${target}`)
      return target
    }
    // If the body matches the trigger phrase exactly, just use the default environment
    else if (body.trim() === trigger) {
      core.debug('Using default environment for branch deployment')
      return environment
    }
    // If the body matches the noop trigger phrase exactly, just use the default environment
    else if (body.trim() === `${trigger} ${noop_trigger}`) {
      core.debug('Using default environment for noop trigger')
      return environment
    }
    // If the body matches the stable branch phrase exactly, just use the default environment
    else if (body.trim() === `${trigger} ${stable_branch}`) {
      core.debug('Using default environment for stable branch deployment')
      return environment
    }
  }

  // If we get here, then no valid environment target was found
  const message =
    'No matching environment target found. Please check your command and try again'
  core.warning(message)
  core.saveState('bypass', 'true')

  // Return the action status as a failure
  await actionStatus(
    context,
    octokit,
    reactionId,
    `### ⚠️ Cannot proceed with deployment\n\n${message}`
  )

  // Return false to indicate that no environment target was found
  return false
}
