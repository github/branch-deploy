import * as core from '@actions/core'
import {actionStatus} from './action-status'
import {createDeploymentStatus} from './deployment'
import {unlock} from './unlock'
import {lock} from './lock'
import {postDeployMessage} from './post-deploy-message'

// Helper function to help facilitate the process of completing a deployment
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :param comment_id: The comment_id which initially triggered the deployment Action
// :param reaction_id: The reaction_id which was initially added to the comment that triggered the Action
// :param status: The status of the deployment (String)
// :param message: A custom string to add as the deployment status message (String)
// :param ref: The ref (branch) which is being used for deployment (String)
// :param noop: Indicates whether the deployment is a noop or not (Boolean)
// :param deployment_id: The id of the deployment (String)
// :param environment: The environment of the deployment (String)
// :param environment_url: The environment url of the deployment (String)
// :param environment_url_in_comment: Indicates whether the environment url should be added to the comment (Boolean)
// :param deployMessagePath: The path to the deploy message file (String) (optional, can be null)
// :returns: 'success' if the deployment was successful, 'success - noop' if a noop, throw error otherwise
export async function postDeploy(
  context,
  octokit,
  comment_id,
  reaction_id,
  status,
  ref,
  noop,
  deployment_id,
  environment,
  environment_url
) {
  // Check the inputs to ensure they are valid
  if (!comment_id || comment_id.length === 0) {
    throw new Error('no comment_id provided')
  } else if (!status || status.length === 0) {
    throw new Error('no status provided')
  } else if (!ref || ref.length === 0) {
    throw new Error('no ref provided')
  } else if (noop === null || noop === undefined) {
    throw new Error('no noop value provided')
  } else if (noop !== true) {
    if (!deployment_id || deployment_id.length === 0) {
      throw new Error('no deployment_id provided')
    }
    if (!environment || environment.length === 0) {
      throw new Error('no environment provided')
    }
  }

  // Check the deployment status
  var success
  if (status === 'success') {
    success = true
  } else {
    success = false
  }

  const message = await postDeployMessage(
    context,
    environment,
    environment_url,
    status,
    noop,
    ref
  )

  // Update the action status to indicate the result of the deployment as a comment
  await actionStatus(context, octokit, parseInt(reaction_id), message, success)

  // Update the deployment status of the branch-deploy
  var deploymentStatus
  if (success) {
    deploymentStatus = 'success'
  } else {
    deploymentStatus = 'failure'
  }

  // If the deployment mode is noop, return here
  if (noop === true) {
    core.debug('deployment mode: noop')
    // Obtain the lock data with detailsOnly set to true - ie we will not alter the lock
    const lockResponse = await lock(
      octokit,
      context,
      null, // ref
      null, // reaction_id
      false, // sticky
      environment, // environment
      true // detailsOnly set to true
    )

    // Obtain the lockData from the lock response
    const lockData = lockResponse.lockData
    core.debug(JSON.stringify(lockData))

    // If the lock is sticky, we will NOT remove it
    if (lockData.sticky === true) {
      core.info('sticky lock detected, will not remove lock')
    } else {
      core.info('non-sticky lock detected, will remove lock')
      core.debug(`lockData.sticky: ${lockData.sticky}`)
      // Remove the lock - use silent mode
      await unlock(
        octokit,
        context,
        null, // reaction_id
        environment, // environment
        true // silent
      )
    }

    return 'success - noop'
  }

  // Update the final deployment status with either success or failure
  await createDeploymentStatus(
    octokit,
    context,
    ref,
    deploymentStatus,
    deployment_id,
    environment,
    environment_url // can be null
  )

  // Obtain the lock data with detailsOnly set to true - ie we will not alter the lock
  const lockResponse = await lock(
    octokit,
    context,
    null, // ref
    null, // reaction_id
    false, // sticky
    environment, // environment
    true, // detailsOnly set to true
    true // postDeployStep set to true - this means we will not exit early if a global lock exists
  )

  // Obtain the lockData from the lock response
  const lockData = lockResponse.lockData
  core.debug(JSON.stringify(lockData))

  // If the lock is sticky, we will NOT remove it
  if (lockData.sticky === true) {
    core.info('sticky lock detected, will not remove lock')
  } else {
    core.info('non-sticky lock detected, will remove lock')
    core.debug(`lockData.sticky: ${lockData.sticky}`)
    // Remove the lock - use silent mode
    await unlock(
      octokit,
      context,
      null, // reaction_id
      environment, // environment
      true // silent
    )
  }

  // If the post deploy comment logic completes successfully, return
  return 'success'
}
