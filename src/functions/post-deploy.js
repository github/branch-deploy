import * as core from '@actions/core'
import {actionStatus} from './action-status'
import {createDeploymentStatus} from './deployment'
import {unlock} from './unlock'
import {lock} from './lock'
import dedent from 'dedent-js'

// Helper function to help facilitate the process of completing a deployment
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :param comment_id: The comment_id which initially triggered the deployment Action
// :param reaction_id: The reaction_id which was initially added to the comment that triggered the Action
// :param status: The status of the deployment (String)
// :param message: A custom string to add as the deployment status message (String)
// :param ref: The ref (branch) which is being used for deployment (String)
// :param noop: Indicates whether the deployment is a noop or not (String)
// :returns: 'success' if the deployment was successful, 'success - noop' if a noop, throw error otherwise
export async function postDeploy(
  context,
  octokit,
  comment_id,
  reaction_id,
  status,
  customMessage,
  ref,
  noop,
  deployment_id,
  environment
) {
  // Check the inputs to ensure they are valid
  if (!comment_id || comment_id.length === 0) {
    throw new Error('no comment_id provided')
  } else if (!status || status.length === 0) {
    throw new Error('no status provided')
  } else if (!ref || ref.length === 0) {
    throw new Error('no ref provided')
  } else if (!noop || noop.length === 0) {
    throw new Error('no noop value provided')
  } else if (noop !== 'true') {
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

  var mode
  var deployTypeString = ' ' // a single space as a default

  // Set the mode and deploy type based on the deployment mode
  if (noop === 'true') {
    mode = '`noop` 🧪'
    deployTypeString = ' noop '
  } else {
    mode = '`branch` 🚀'
  }

  // Dynamically set the message text depending if the deployment succeeded or failed
  var message
  var deployStatus
  if (status === 'success') {
    message = `Successfully${deployTypeString}deployed branch **${ref}**`
    deployStatus = `\`${status}\` ✔️`
  } else if (status === 'failure') {
    message = `Failure when${deployTypeString}deploying branch **${ref}**`
    deployStatus = `\`${status}\` ❌`
  } else {
    message = `Warning:${deployTypeString}deployment status is unknown, please use caution`
    deployStatus = `\`${status}\` ⚠️`
  }

  const footer = `Actor: **${context.actor}**, Action: \`${context.eventName}\`, Workflow: \`${context.workflow}\``

  // Conditionally format the message body
  var message_fmt
  if (customMessage && customMessage.length > 0) {
    const customMessageFmt = customMessage
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
    message_fmt = dedent(`
    ### Deployment Results
  
    - Status: ${deployStatus}
    - Mode: ${mode}
    - Branch: \`${ref}\`
  
    <details><summary>Show Results</summary>
  
    ${customMessageFmt}
  
    </details>
  
    ${message}
  
    > ${footer}
    `)
  } else {
    message_fmt = dedent(`
    ### Deployment Results
  
    - Status: ${deployStatus}
    - Mode: ${mode}
    - Branch: \`${ref}\`
  
    ${message}
  
    > ${footer}
    `)
  }

  // Update the action status to indicate the result of the deployment as a comment
  await actionStatus(
    context,
    octokit,
    parseInt(reaction_id),
    message_fmt,
    success
  )

  // Update the deployment status of the branch-deploy
  var deploymentStatus
  if (success) {
    deploymentStatus = 'success'
  } else {
    deploymentStatus = 'failure'
  }

  // If the deployment mode is noop, return here
  if (noop === 'true') {
    // Obtain the lock data with detailsOnly set to true - ie we will not alter the lock
    const lockData = await lock(octokit, context, null, null, false, true)
    // If the lock is sticky, we will not remove it
    if (lockData.sticky) {
      core.info('sticky lock detected, will not remove lock')
    } else if (lockData.sticky === false) {
      // Remove the lock - use silent mode
      await unlock(octokit, context, null, true)
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
    environment
  )

  // Obtain the lock data with detailsOnly set to true - ie we will not alter the lock
  const lockData = await lock(octokit, context, null, null, false, true)
  // If the lock is sticky, we will not remove it
  if (lockData.sticky) {
    core.info('sticky lock detected, will not remove lock')
  } else if (lockData.sticky === false) {
    // Remove the lock - use silent mode
    await unlock(octokit, context, null, true)
  }

  // If the post deploy comment logic completes successfully, return
  return 'success'
}
