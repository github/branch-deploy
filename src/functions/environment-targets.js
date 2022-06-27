import * as core from '@actions/core'

// A simple function that checks if an explicit environment target is being used
// :param environment: The default environment from the Actions inputs
// :param body: The comment body
// :returns: the environment target (String)
export async function environmentTargets(
  environment,
  body,
  trigger,
  noop_trigger
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
    } else if (body.trim() === trigger) {
      core.debug('Using default environment for branch deployment')
      return environment
    } else if (body.trim() === `${trigger} ${noop_trigger}`) {
      core.debug('Using default environment for noop trigger')
      return environment
    }
  }

  // If we get here, then no environment target was found
  core.debug(
    `No matching environment target found using default: ${environment}`
  )
  return environment
}
