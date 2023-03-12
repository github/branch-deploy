import * as core from '@actions/core'
import dedent from 'dedent-js'
import {actionStatus} from './action-status'
import {LOCK_METADATA} from './lock-metadata'

// Helper function to that does environment checks specific to branch deploys
// :param environment_targets_sanitized: The list of environment targets
// :param body: The body of the comment
// :param trigger: The trigger used to initiate the deployment
// :param noop_trigger: The trigger used to initiate a noop deployment
// :param stable_branch: The stable branch
// :param environment: The default environment
// :returns: The environment target if found, false otherwise
async function onDeploymentChecks(
  environment_targets_sanitized,
  body,
  trigger,
  noop_trigger,
  stable_branch,
  environment
) {
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
  return false
}

// Helper function to that does environment checks specific to lock/unlock commands
// :param environment_targets_sanitized: The list of environment targets
// :param body: The body of the comment
// :param lock_trigger: The trigger used to initiate the lock command
// :param unlock_trigger: The trigger used to initiate the unlock command
// :param environment: The default environment from the Actions inputs
// :returns: The environment target if found, false otherwise
async function onLockChecks(
  environment_targets_sanitized,
  body,
  lock_trigger,
  unlock_trigger,
  environment
) {
  // if the body contains the globalFlag, exit right away as environments are not relevant
  const globalFlag = core.getInput('global_lock_flag').trim()
  if (body.includes(globalFlag)) {
    core.debug('Global lock flag found in environment target check')
    return 'GLOBAL_REQUEST'
  }

  // remove any lock flags from the body
  LOCK_METADATA.lockInfoFlags.forEach(flag => {
    body = body.replace(flag, '').trim()
  })

  // Get the lock info alias from the action inputs
  const lockInfoAlias = core.getInput('lock_info_alias')

  // if the body matches the lock trigger exactly, just use the default environment
  if (body.trim() === lock_trigger.trim()) {
    core.debug('Using default environment for lock request')
    return environment
  }

  // if the body matches the unlock trigger exactly, just use the default environment
  if (body.trim() === unlock_trigger.trim()) {
    core.debug('Using default environment for unlock request')
    return environment
  }

  // if the body matches the lock info alias exactly, just use the default environment
  if (body.trim() === lockInfoAlias.trim()) {
    core.debug('Using default environment for lock info request')
    return environment
  }

  // Loop through all the environment targets to see if an explicit target is being used
  for (const target of environment_targets_sanitized) {
    // If the body on a branch deploy contains the target
    if (body.replace(lock_trigger, '').trim() === target) {
      core.debug(`Found environment target for lock request: ${target}`)
      return target
    } else if (body.replace(unlock_trigger, '').trim() === target) {
      core.debug(`Found environment target for unlock request: ${target}`)
      return target
    } else if (body.replace(lockInfoAlias, '').trim() === target) {
      core.debug(`Found environment target for lock info request: ${target}`)
      return target
    }
  }

  // If we get here, then no valid environment target was found
  return false
}

// A simple function that checks if an explicit environment target is being used
// :param environment: The default environment from the Actions inputs
// :param body: The comment body
// :param trigger: The trigger prefix
// :param alt_trigger: Usually the noop trigger prefix
// :param stable_branch: The stable branch (only used for branch deploys)
// :param context: The context of the Action
// :param octokit: The Octokit instance
// :param reactionId: The ID of the initial comment reaction (Integer)
// :returns: the environment target (String) or false if no environment target was found (fails)
export async function environmentTargets(
  environment,
  body,
  trigger,
  alt_trigger,
  stable_branch,
  context,
  octokit,
  reactionId,
  lockChecks = false
) {
  // Get the environment targets from the action inputs
  const environment_targets = core.getInput('environment_targets')

  // Sanitized the input to remove any whitespace and split into an array
  const environment_targets_sanitized = environment_targets
    .split(',')
    .map(target => target.trim())

  // convert the environment targets into an array joined on ,
  const environment_targets_joined = environment_targets_sanitized.join(',')

  // If lockChecks is set to true, this request is for either a lock/unlock command to check the body for an environment target
  if (lockChecks === true) {
    const environmentDetected = await onLockChecks(
      environment_targets_sanitized,
      body,
      trigger,
      alt_trigger,
      environment
    )
    if (environmentDetected !== false) {
      return environmentDetected
    }

    // If we get here, then no valid environment target was found
    const message = dedent(`
    No matching environment target found. Please check your command and try again. You can read more about environment targets in the README of this Action.

    > The following environment targets are available: \`${environment_targets_joined}\`
    `)
    core.warning(message)
    core.saveState('bypass', 'true')

    // Return the action status as a failure
    await actionStatus(
      context,
      octokit,
      reactionId,
      `### ⚠️ Cannot proceed with lock/unlock request\n\n${message}`
    )

    return false
  }

  // If lockChecks is set to false, this request is for a branch deploy to check the body for an environment target
  if (lockChecks === false) {
    const environmentDetected = await onDeploymentChecks(
      environment_targets_sanitized,
      body,
      trigger,
      alt_trigger,
      stable_branch,
      environment
    )
    if (environmentDetected !== false) {
      return environmentDetected
    }

    // If we get here, then no valid environment target was found
    const message = dedent(`
    No matching environment target found. Please check your command and try again. You can read more about environment targets in the README of this Action.

    > The following environment targets are available: \`${environment_targets_joined}\`
    `)
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
}
