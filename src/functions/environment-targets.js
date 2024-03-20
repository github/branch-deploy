import * as core from '@actions/core'
import dedent from 'dedent-js'
import {checkInput} from './check-input'
import {actionStatus} from './action-status'
import {LOCK_METADATA} from './lock-metadata'
import {COLORS} from './colors'
import { env } from 'process'

// Helper function to that does environment checks specific to branch deploys
// :param environment_targets_sanitized: The list of environment targets
// :param body: The body of the comment
// :param trigger: The trigger used to initiate the deployment
// :param noop_trigger: The trigger used to initiate a noop deployment
// :param stable_branch: The stable branch
// :param environment: The default environment
// :param param_separator: The separator used to seperate the command from the parameters
// :returns: The environment target if found, false otherwise
async function onDeploymentChecks(
  environment_targets_sanitized,
  body,
  trigger,
  noop_trigger,
  stable_branch,
  environment,
  param_separator
) {
  var bodyFmt = body

  // Seperate the issueops command on the 'param_separator'
  var paramCheck = body.split(param_separator)
  paramCheck.shift() // remove everything before the 'param_separator'
  const params = paramCheck.join(param_separator) // join it all back together (in case there is another separator)
  // if there is anything after the 'param_separator'; output it, log it, and remove it from the body for env checks
  var paramsTrim = null
  if (params !== '') {
    bodyFmt = body.split(`${param_separator}${params}`)[0].trim()
    paramsTrim = params.trim()
    core.info(
      `🧮 detected parameters in command: ${COLORS.highlight}${paramsTrim}`
    )
    core.setOutput('params', paramsTrim)
  } else {
    core.debug('no parameters detected in command')
    core.setOutput('params', '')
  }

  // check if the body contains an exact SHA targeted for deployment (SHA1 or SHA256)
  var sha = null

  // escape all regex special characters in the trigger
  const escapedTrigger = trigger.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')
  const regex = new RegExp(
    `${escapedTrigger}\\s+((?![a-f0-9]{40}[a-f0-9]{24})[a-f0-9]{40}|[a-f0-9]{64})`,
    'i'
  )
  // escape all regex special characters in the noop_trigger
  const escapedNoopTrigger = noop_trigger.replace(
    /[-[\]/{}()*+?.\\^$|]/g,
    '\\$&'
  )
  const noopRegex = new RegExp(
    `${escapedNoopTrigger}\\s+((?![a-f0-9]{40}[a-f0-9]{24})[a-f0-9]{40}|[a-f0-9]{64})`,
    'i'
  )

  const match = bodyFmt.trim().match(regex)
  const noopMatch = bodyFmt.trim().match(noopRegex)
  if (match) {
    sha = match[1] // The captured SHA value
    // if a sha was used, then we need to remove it from the body for env checks
    bodyFmt = bodyFmt.replace(new RegExp(`\\s*${sha}\\s*`, 'g'), '').trim()
    core.info(
      `📍 detected SHA in command: ${COLORS.highlight}${sha}${COLORS.reset}`
    )
  } else if (noopMatch) {
    sha = noopMatch[1] // The captured SHA value
    // if a sha was used, then we need to remove it from the body for env checks
    bodyFmt = bodyFmt.replace(new RegExp(`\\s*${sha}\\s*`, 'g'), '').trim()
    core.info(
      `📍 detected SHA in noop command: ${COLORS.highlight}${sha}${COLORS.reset}`
    )
  }

  // defaults before processing
  var targets = []
  var stable_branch_used = false
  var noop = null

  // if the body starts with the trigger, then it's not a noop (ex: `.deploy`)
  if (bodyFmt.startsWith(trigger)) {
    noop = false
  }

  // if the body starts with the noop trigger, then it's a noop (ex: `.noop`)
  if (bodyFmt.startsWith(noop_trigger)) {
    noop = true
  }

  // pre-formatted strings for multi-target match searches
  const bodyFmtMultiWithStableTo = bodyFmt.replace(`${trigger} ${stable_branch} to `, '').trim()
  const bodyFmtMultiWithStableNoopTo = bodyFmt.replace(`${noop_trigger} ${stable_branch} to `, '').trim()
  const bodyFmtMultiTo = bodyFmt.replace(`${trigger} to `, '').trim()
  const bodyFmtMultiNoopTo = bodyFmt.replace(`${noop_trigger} to `, '').trim()
  const bodyFmtMultiStable = bodyFmt.replace(`${trigger} ${stable_branch}`, '').trim()
  const bodyFmtMultiNoopStable = bodyFmt.replace(`${noop_trigger} ${stable_branch}`, '').trim()
  const bodyFmtMulti = bodyFmt.replace(trigger, '').trim()
  const bodyFmtMultiNoop = bodyFmt.replace(noop_trigger, '').trim()

  // Loop through all the environment targets to see if an explicit target is being used
  for (const target of environment_targets_sanitized) {
    // If the body on a branch deploy contains the target
    if (bodyFmt.replace(trigger, '').trim() === target) {
      core.debug(`found environment target for branch deploy: ${target}`)
      targets.push(target)
      continue
    }
    // If the body on a noop trigger contains the target
    else if (bodyFmt.replace(noop_trigger, '').trim() === target) {
      core.debug(`found environment target for noop trigger: ${target}`)
      targets.push(target)
      continue
    }
    // If the body with 'to <target>' contains the target on a branch deploy
    else if (bodyFmt.replace(trigger, '').trim() === `to ${target}`) {
      core.debug(
        `found environment target for branch deploy (with 'to'): ${target}`
      )
      targets.push(target)
      continue
    }
    // If the body with 'to <target>' contains the target on a noop trigger
    else if (bodyFmt.replace(noop_trigger, '').trim() === `to ${target}`) {
      core.debug(
        `found environment target for noop trigger (with 'to'): ${target}`
      )
      targets.push(target)
      continue
    }
    // If the body with 'to <target>' contains the target on a stable branch deploy
    else if (
      bodyFmt.replace(`${trigger} ${stable_branch}`, '').trim() ===
      `to ${target}`
    ) {
      core.debug(
        `found environment target for stable branch deploy (with 'to'): ${target}`
      )
      stable_branch_used = true
      targets.push(target)
      continue
    }
    // If the body with 'to <target>' contains the target on a stable branch noop trigger
    else if (
      bodyFmt.replace(`${noop_trigger} ${stable_branch}`, '').trim() ===
      `to ${target}`
    ) {
      core.debug(
        `found environment target for stable branch noop trigger (with 'to'): ${target}`
      )
      stable_branch_used = true
      targets.push(target)
      continue
    }
    // If the body on a stable branch deploy contains the target
    else if (
      bodyFmt.replace(`${trigger} ${stable_branch}`, '').trim() === target
    ) {
      core.debug(`found environment target for stable branch deploy: ${target}`)
      stable_branch_used = true
      targets.push(target)
      continue
    }
    // If the body on a stable branch noop trigger contains the target
    else if (
      bodyFmt.replace(`${noop_trigger} ${stable_branch}`, '').trim() === target
    ) {
      core.debug(
        `found environment target for stable branch noop trigger: ${target}`
      )
      stable_branch_used = true
      targets.push(target)
      continue
    }
    // If the body matches the trigger phrase exactly, just use the default environment
    else if (bodyFmt.trim() === trigger) {
      core.debug('using default environment for branch deployment')
      targets.push(environment)
      continue
    }
    // If the body matches the noop_trigger phrase exactly, just use the default environment
    else if (bodyFmt.trim() === noop_trigger) {
      core.debug('using default environment for noop trigger')
      targets.push(environment)
      continue
    }
    // If the body matches the stable branch phrase exactly, just use the default environment
    else if (bodyFmt.trim() === `${trigger} ${stable_branch}`) {
      core.debug('using default environment for stable branch deployment')
      stable_branch_used = true
      targets.push(environment)
      continue
    }
    // If the body matches the stable branch phrase exactly on a noop trigger, just use the default environment
    else if (bodyFmt.trim() === `${noop_trigger} ${stable_branch}`) {
      core.debug('using default environment for stable branch noop trigger')
      stable_branch_used = true
      targets.push(environment)
      continue
    }

    // start of multiple target checks

    // If the body with 'to <target>' contains a match on the target on a stable branch deploy
    // (ex: `.deploy main to <target1> <target2> <target3>`) while matching on target3
    else if (bodyFmt.includes(`${trigger} ${stable_branch} to `) && ` ${bodyFmtMultiWithStableTo} `.includes(` ${target} `)) {
      core.debug(
        `found environment target for stable branch deploy (with 'to') [multi-checks]: ${target}`
      )
      stable_branch_used = true
      targets.push(target)
      continue
    }
    // If the body with 'to <target>' contains a match on the target on a stable branch deploy (noop)
    // (ex: `.noop main to <target1> <target2> <target3>`) while matching on target3
    else if (bodyFmt.includes(`${noop_trigger} ${stable_branch} to `) && ` ${bodyFmtMultiWithStableNoopTo} `.includes(` ${target} `)) {
      core.debug(
        `found environment target for stable branch noop deploy (with 'to') [multi-checks]: ${target}`
      )
      stable_branch_used = true
      targets.push(target)
      continue
    }
    else if (bodyFmt.includes(`${trigger} to `) && ` ${bodyFmtMultiTo} `.includes(` ${target} `)) {
      core.debug(
        `found environment target for branch deploy (with 'to') [multi-checks]: ${target}`
      )
      targets.push(target)
      continue
    }
    else if (bodyFmt.includes(`${noop_trigger} to `) && ` ${bodyFmtMultiNoopTo} `.includes(` ${target} `)) {
      core.debug(
        `found environment target for noop trigger (with 'to') [multi-checks]: ${target}`
      )
      targets.push(target)
      continue
    }
    else if (bodyFmt.includes(`${trigger} ${stable_branch}`) && ` ${bodyFmtMultiStable} `.includes(` ${target} `)) {
      core.debug(
        `found environment target for stable branch deploy [multi-checks]: ${target}`
      )
      stable_branch_used = true
      targets.push(target)
      continue
    }
    else if (bodyFmt.includes(`${noop_trigger} ${stable_branch}`) && ` ${bodyFmtMultiNoopStable} `.includes(` ${target} `)) {
      core.debug(
        `found environment target for stable branch noop trigger [multi-checks]: ${target}`
      )
      stable_branch_used = true
      targets.push(target)
      continue
    }
    else if (bodyFmt.includes(trigger) && ` ${bodyFmtMulti} `.includes(` ${target} `)) {
      core.debug(
        `found environment target for branch deploy [multi-checks]: ${target}`
      )
      targets.push(target)
      continue
    }
    else if (bodyFmt.includes(noop_trigger) && ` ${bodyFmtMultiNoop} `.includes(` ${target} `)) {
      core.debug(
        `found environment target for noop trigger [multi-checks]: ${target}`
      )
      targets.push(target)
      continue
    }
  }

  // If we get here, then no valid environment target was found - everything gets set to false / null
  if (targets.length === 0) {
    return {
      targets: [],
      stable_branch_used: null,
      noop: null,
      params: null,
      sha: null
    }
  }

  // return the data
  return {
    targets: targets,
    stable_branch_used: stable_branch_used,
    noop: noop,
    params: paramsTrim,
    sha: sha
  }
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
    core.debug('global lock flag found in environment target check')
    return 'GLOBAL_REQUEST'
  }

  // remove any lock flags from the body
  LOCK_METADATA.lockInfoFlags.forEach(flag => {
    body = body.replace(flag, '').trim()
  })

  // remove the --reason <text> from the body if it exists
  if (body.includes('--reason')) {
    core.debug(
      `'--reason' found in comment body: ${body} - attempting to remove for environment checks`
    )
    body = body.split('--reason')[0]
    core.debug(`comment body after '--reason' removal: ${body}`)
  }

  // Get the lock info alias from the action inputs
  const lockInfoAlias = core.getInput('lock_info_alias')

  // if the body matches the lock trigger exactly, just use the default environment
  if (body.trim() === lock_trigger.trim()) {
    core.debug('using default environment for lock request')
    return environment
  }

  // if the body matches the unlock trigger exactly, just use the default environment
  if (body.trim() === unlock_trigger.trim()) {
    core.debug('using default environment for unlock request')
    return environment
  }

  // if the body matches the lock info alias exactly, just use the default environment
  if (body.trim() === lockInfoAlias.trim()) {
    core.debug('using default environment for lock info request')
    return environment
  }

  // Loop through all the environment targets to see if an explicit target is being used
  for (const target of environment_targets_sanitized) {
    // If the body on a branch deploy contains the target
    if (body.replace(lock_trigger, '').trim() === target) {
      core.debug(`found environment target for lock request: ${target}`)
      return target
    } else if (body.replace(unlock_trigger, '').trim() === target) {
      core.debug(`found environment target for unlock request: ${target}`)
      return target
    } else if (body.replace(lockInfoAlias, '').trim() === target) {
      core.debug(`found environment target for lock info request: ${target}`)
      return target
    }
  }

  // If we get here, then no valid environment target was found
  return false
}

// Helper function to find the environment URL for a given environment target (if it exists)
// :param environments: The environment target(s)
// :param environment_urls: The environment URLs from the action inputs
// :returns: An array of environment URLs if found, an empty array otherwise
async function findEnvironmentUrl(environments, environment_urls) {
  // The structure: "<environment1>|<url1>,<environment2>|<url2>,etc"

  // If the environment URLs are empty, just return an empty string
  if ((await checkInput(environment_urls)) === null) {
    return null
  }

  // Split the environment URLs into an array
  const environment_urls_array = environment_urls.trim().split(',')

  var environment_urls_result = []

  // Loop through the array and find the environment URL for the given environment target
  for (const environment_url of environment_urls_array) {
    const environment_url_array = environment_url.trim().split('|')
    for (const environment of environments) {
    if (environment_url_array[0] === environment) {
      const environment_url = environment_url_array[1]

      // if the environment url exactly matches 'disabled' then return null
      if (environment_url === 'disabled') {
        core.info(
          `💡 environment url for ${COLORS.highlight}${environment}${COLORS.reset} is explicitly disabled`
        )
        core.saveState('environment_url', 'null')
        core.setOutput('environment_url', 'null')
        return null
      }

      // if the environment url does not match the http(s) schema, log a warning and continue
      if (!environment_url.match(/^https?:\/\//)) {
        core.warning(
          `environment url does not match http(s) schema: ${environment_url}`
        )
        continue
      }

      core.saveState('environment_url', environment_url)
      core.setOutput('environment_url', environment_url)
      core.info(
        `🔗 environment url detected: ${COLORS.highlight}${environment_url}`
      )
      return environment_url
    }
  }
  }

  // if every item in the environment_urls_result is 'disabled', then return null
  if (environment_urls_result.every(url => url === 'disabled')) {
    core.info(
      `💡 all environment urls for ${COLORS.highlight}${environments.join(', ')}${COLORS.reset} are explicitly disabled`
    )
    core.saveState('environment_url', 'null')
    core.setOutput('environment_url', 'null')
    return []
  }

  // If we get here, then no environment URL was found
  core.warning(
    `no valid environment URL found for environment: ${environment} - setting environment URL to 'null' - please check your 'environment_urls' input`
  )
  core.saveState('environment_url', 'null')
  core.setOutput('environment_url', 'null')
  return null
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
// :param lockChecks: Whether or not this is a lock/unlock command (Boolean)
// :param environment_urls: The environment URLs from the action inputs
// :param param_separator: The separator used to split the environment targets (String) - defaults to '|'
// :returns: An object containing the environment target and environment URL
export async function environmentTargets(
  environment,
  body,
  trigger,
  alt_trigger,
  stable_branch,
  context,
  octokit,
  reactionId,
  lockChecks = false,
  environment_urls = null,
  param_separator = '|'
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
      return {environment: environmentDetected, environmentUrl: null}
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

    return {environment: false, environmentUrl: null}
  }

  // If lockChecks is set to false, this request is for a branch deploy to check the body for an environment target
  if (lockChecks === false) {
    const environmentObj = await onDeploymentChecks(
      environment_targets_sanitized,
      body,
      trigger,
      alt_trigger,
      stable_branch,
      environment,
      param_separator
    )

    const environmentsDetected = environmentObj.targets

    // If no environment targets were found, let the user know via a comment and return false
    if (environmentsDetected.length === 0) {
      const message = dedent(`
        No matching environment target(s) found. Please check your command and try again. You can read more about environment targets in the README of this Action.

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
      return {
        environment: false,
        environmentUrl: null,
        environmentObj: environmentObj
      }
    }

    // Attempt to get the environment URL from the environment_urls input using the environment target as the key
    const environmentUrls = await findEnvironmentUrl(
      environmentsDetected,
      environment_urls
    )

    // Return the environment(s) data
    return {
      environmentUrls: environmentUrls,
      environmentObj: environmentObj
    }
  }
}
