import * as core from '@actions/core'
import {COLORS} from './colors'
import {activeDeployment} from './deployment'

// Helper function to ensure the deployment order is enforced (if any)
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param enforced_deployment_order: The enforced deployment order (ex: ['development', 'staging', 'production'])
// :param environment: The environment to check for (ex: production)
// :param sha: The sha to check for (ex: cb2bc0193184e779a5efc05e48acdfd1026f59a7)
// :returns: an object with the valid: true if the deployment order is valid, false otherwise, and results: an array of the previous environments in the enforced deployment order that do not have active deployments
export async function validDeploymentOrder(
  octokit,
  context,
  enforced_deployment_order,
  environment,
  sha
) {
  core.info(`🚦 deployment order is ${COLORS.highlight}enforced${COLORS.reset}`)

  if (enforced_deployment_order.length === 1) {
    core.warning(
      `💡 Having only one environment in the enforced deployment order will always cause the deployment order checks to pass if the environment names match. This is likely not what you want. Please wither unset the enforced deployment order or add more environments to it.`
    )
    return {valid: enforced_deployment_order[0] === environment, results: []}
  }

  // if the enforced deployment order is set, check to see if the current environment is the first in the list
  // this indicates that we can proceed with the deployment right away as there are no previous environments to gate it
  if (enforced_deployment_order[0] === environment) {
    core.info(
      `🚦 deployment order checks passed as ${COLORS.highlight}${environment}${COLORS.reset} is the first environment in the enforced deployment order`
    )
    return {valid: true, results: []}
  }

  // determine all the previous environments in the enforced deployment order prior to the current environment
  const previous_environments = enforced_deployment_order.slice(
    0,
    enforced_deployment_order.indexOf(environment)
  )

  core.debug(
    `environments that require active deployments: ${previous_environments}`
  )

  // iterate over the previous environments and check to see if they have an active deployment
  let results = []
  for (const previous_environment of previous_environments) {
    core.debug(`checking if ${previous_environment} has an active deployment`)
    const is_active = await activeDeployment(
      octokit,
      context,
      previous_environment,
      sha
    )

    if (!is_active) {
      core.error(
        `🚦 deployment order checks failed as ${COLORS.highlight}${previous_environment}${COLORS.reset} does not have an active deployment at sha: ${sha}`
      )
      results.push({environment: previous_environment, active: false})
      continue
    }

    core.debug(
      `deployment for ${previous_environment} is active at sha: ${sha}`
    )
    results.push({environment: previous_environment, active: true})
  }

  // if all previous environments have active deployments, we can proceed with the deployment
  if (results.every(result => result.active === true)) {
    core.info(
      `🚦 deployment order checks passed as all previous environments have active deployments`
    )
    return {valid: true, results: results}
  }

  // set an output that contains all the environments that do not have active deployments but need them for a deployment to proceed
  const needs_to_be_deployed = results
    .filter(result => !result.active)
    .map(result => result.environment)
    .join(',')
  core.setOutput('needs_to_be_deployed', needs_to_be_deployed)

  // if we made it this far, it means that not all previous environments have active deployments and we cannot proceed
  return {valid: false, results: results}
}
