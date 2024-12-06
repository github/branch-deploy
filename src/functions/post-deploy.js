import * as core from '@actions/core'

import {actionStatus} from './action-status'
import {label} from './label'
import {createDeploymentStatus} from './deployment'
import {unlock} from './unlock'
import {lock} from './lock'
import {postDeployMessage} from './post-deploy-message'
import {COLORS} from './colors'

const stickyMsg = `🍯 ${COLORS.highlight}sticky${COLORS.reset} lock detected, will not remove lock`
const nonStickyMsg = `🧹 ${COLORS.highlight}non-sticky${COLORS.reset} lock detected, will remove lock`

// Helper function to help facilitate the process of completing a deployment
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :param data: The data object containing the deployment details:
//   - attribute: sha: The exact commit SHA of the deployment (String)
//   - attribute: comment_id: The comment_id which initially triggered the deployment Action
//   - attribute: reaction_id: The reaction_id which was initially added to the comment that triggered the Action
//   - attribute: status: The status of the deployment (String)
//   - attribute: ref: The ref (branch) which is being used for deployment (String)
//   - attribute: noop: Indicates whether the deployment is a noop or not (Boolean)
//   - attribute: deployment_id: The id of the deployment (String)
//   - attribute: environment: The environment of the deployment (String)
//   - attribute: environment_url: The environment url of the deployment (String)
//   - attribute: approved_reviews_count: The count of approved reviews for the deployment (String representation of an int or null)
//   - attribute: labels: A dictionary of labels to apply to the issue (Object)
//   - attribute: review_decision: The review status of the pull request (String or null) - Ex: APPROVED, REVIEW_REQUIRED, etc
// :returns: 'success' if the deployment was successful, 'success - noop' if a noop, throw error otherwise
export async function postDeploy(context, octokit, data) {
  // check the inputs to ensure they are valid
  validateInputs(data)

  // check the deployment status
  var success
  if (data.status === 'success') {
    success = true
  } else {
    success = false
  }

  const message = await postDeployMessage(context, {
    environment: data.environment,
    environment_url: data.environment_url,
    status: data.status,
    noop: data.noop,
    ref: data.ref,
    sha: data.sha,
    approved_reviews_count: data.approved_reviews_count
  })

  // update the action status to indicate the result of the deployment as a comment
  await actionStatus(
    context,
    octokit,
    parseInt(data.reaction_id),
    message,
    success
  )

  // Update the deployment status of the branch-deploy
  var deploymentStatus
  var labelsToAdd
  var labelsToRemove
  if (success) {
    deploymentStatus = 'success'

    if (data.noop === true) {
      labelsToAdd = data.labels.successful_noop
      labelsToRemove = data.labels.failed_noop
    } else {
      labelsToAdd = data.labels.successful_deploy
      labelsToRemove = data.labels.failed_deploy
    }
  } else {
    deploymentStatus = 'failure'

    if (data.noop === true) {
      labelsToAdd = data.labels.failed_noop
      labelsToRemove = data.labels.successful_noop
    } else {
      labelsToAdd = data.labels.failed_deploy
      labelsToRemove = data.labels.successful_deploy
    }
  }

  core.debug(`deploymentStatus: ${deploymentStatus}`)

  // if the deployment mode is noop, return here
  if (data.noop === true) {
    core.debug('deployment mode: noop')
    // obtain the lock data with detailsOnly set to true - ie we will not alter the lock
    const lockResponse = await lock(
      octokit,
      context,
      null, // ref
      null, // reaction_id
      false, // sticky
      data.environment, // environment
      true // detailsOnly set to true
    )

    // obtain the lockData from the lock response
    const lockData = lockResponse.lockData
    core.debug(JSON.stringify(lockData))

    // if the lock is sticky, we will NOT remove it
    if (lockData?.sticky === true) {
      core.info(stickyMsg)
    } else if (lockData === null || lockData === undefined) {
      core.warning(
        '💡 a request to obtain the lock data returned null or undefined - the lock may have been removed by another process while this Action was running'
      )
    } else {
      core.info(nonStickyMsg)
      core.debug(`lockData.sticky: ${lockData?.sticky}`)

      // remove the lock - use silent mode
      await unlock(
        octokit,
        context,
        null, // reaction_id
        data.environment, // environment
        true // silent mode
      )
    }

    // check to see if the pull request labels should be applied or not
    if (
      data.labels.skip_successful_noop_labels_if_approved === true &&
      data.review_decision === 'APPROVED'
    ) {
      core.info(
        `⏩ skipping noop labels since the pull request is ${COLORS.success}approved${COLORS.reset} (based on your configuration)`
      )
    } else {
      // attempt to add labels to the pull request (if any)
      await label(context, octokit, labelsToAdd, labelsToRemove)
    }

    return 'success - noop'
  }

  // update the final deployment status with either success or failure
  await createDeploymentStatus(
    octokit,
    context,
    data.ref,
    deploymentStatus,
    data.deployment_id,
    data.environment,
    data.environment_url // can be null
  )

  // obtain the lock data with detailsOnly set to true - ie we will not alter the lock
  const lockResponse = await lock(
    octokit,
    context,
    null, // ref
    null, // reaction_id
    false, // sticky
    data.environment, // environment
    true, // detailsOnly set to true
    true, // postDeployStep set to true - this means we will not exit early if a global lock exists
    false // leaveComment
  )

  // obtain the lockData from the lock response
  const lockData = lockResponse.lockData
  core.debug(JSON.stringify(lockData))

  // if the lock is sticky, we will NOT remove it
  if (lockData?.sticky === true) {
    core.info(stickyMsg)
  } else {
    core.info(nonStickyMsg)
    core.debug(`lockData.sticky: ${lockData?.sticky}`)

    // remove the lock - use silent mode
    await unlock(
      octokit,
      context,
      null, // reaction_id
      data.environment, // environment
      true // silent mode
    )
  }

  // check to see if the pull request labels should be applied or not
  if (
    data.labels.skip_successful_deploy_labels_if_approved === true &&
    data.review_decision === 'APPROVED'
  ) {
    core.info(
      `⏩ skipping deploy labels since the pull request is ${COLORS.success}approved${COLORS.reset} (based on your configuration)`
    )
  } else {
    // attempt to add labels to the pull request (if any)
    await label(context, octokit, labelsToAdd, labelsToRemove)
  }

  // if the post deploy comment logic completes successfully, return
  return 'success'
}

function validateInput(input, name) {
  if (input === null || input === undefined || input.length === 0) {
    throw new Error(`no ${name} provided`)
  }
}

function validateInputs(data) {
  const requiredInputs = [
    'comment_id',
    'status',
    'ref',
    'environment',
    'reaction_id',
    'sha'
  ]
  requiredInputs.forEach(input => validateInput(data[input], input))

  if (data.noop === null || data.noop === undefined) {
    throw new Error('no noop value provided')
  }

  if (data.noop !== true) {
    // if the deployment is not a noop (e.g. a `.deploy`) then we need to validate a few extra inputs
    const additionalInputs = ['deployment_id']
    additionalInputs.forEach(input => validateInput(data[input], input))
  }
}
