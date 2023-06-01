import * as core from '@actions/core'
import {unlock} from './unlock'

// Helper function to automatically find, and release a deployment lock when a pull request is merged
// :param octokit: the authenticated octokit instance
// :param context: the context object
// :return: true if all locks were released successfully, false otherwise
export async function unlockOnMerge(octokit, context) {
  // first, check the context to ensure that the event is a pull request 'closed' event and that the pull request was merged
  if (
    context?.eventName !== 'pull_request' ||
    context?.payload?.action !== 'closed' ||
    context?.payload?.pull_request?.merged !== true
  ) {
    core.info(
      `event name: ${context?.eventName}, action: ${context?.payload?.action}, merged: ${context?.payload?.pull_request?.merged}`
    )
    core.setFailed(
      'This workflow can only run in the context of a merged pull request'
    )
    return false
  }

  // find the head_ref from the context
  const headRef = context?.payload?.pull_request?.head?.ref

  // using the octokit rest api, find all deployments with the same head_ref as the pull request
  // doing this ensures that we only release locks for deployments that were created by this pull request
  const deployments = await octokit.rest.repos.listDeployments({
    ...context.repo,
    ref: headRef
  })

  // if there are no deployments, then there is nothing to do so we can exit early
  if (deployments.data.length === 0) {
    core.info(
      `No deployments found for ${context.repo.owner}/${context.repo.repo} with ref ${headRef}`
    )
    return true
  }

  // loop through all deployments and create an array of the environment names
  const environments = deployments.data.map(deployment => {
    return deployment.environment
  })

  // loop through all environments and release the lock
  for (const environment of environments) {
    // skip if the environment is null or undefined
    if (environment === null || environment === undefined) {
      continue
    }

    // release the lock
    var result = await unlock(
      octokit,
      context,
      null, // reactionId
      environment,
      true // silent
    )

    // log the result and format the output as it will always be a string ending with '- silent'
    var resultFmt = result.replace('- silent', '')
    core.info(`${resultFmt.trim()} - environment: ${environment}`)
  }

  // if we get here, all locks were made a best effort to be released
  return true
}

// core.setOutput('environment', environment)
