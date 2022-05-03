import * as core from '@actions/core'
import {actionStatus} from './action-status'
import {createDeploymentStatus} from './deployment'

// Helper function to help facilitate the process of completing a deployment
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :param post_deploy: A boolean that is used to check if this function should run
// :param comment_id: The comment_id which initially triggered the deployment Action
// :param status: The status of the deployment (String)
// :param message: A custom string to add as the deployment status message (String)
// :param ref: The ref (branch) which is being used for deployment (String)
// :param noop: Indicates whether the deployment is a noop or not (String)
// :returns: nothing, error if anything goes wrong
export async function postDeploy(
  context,
  octokit,
  comment_id,
  status,
  customMessage,
  ref,
  noop,
  deployment_id,
  environment
) {
  // Check the inputs to ensure they are valid
  if (comment_id && status && ref && noop) {
    core.debug('post_deploy inputs passed initial check')
  } else if (!comment_id || comment_id.length === 0) {
    throw new Error('no comment_id provided')
  } else if (!status || status.length === 0) {
    throw new Error('no status provided')
  } else if (!ref || ref.length === 0) {
    throw new Error('no ref provided')
  } else if (noop !== 'true') {
    if (!deployment_id || deployment_id.length === 0) {
      throw new Error('no deployment_id provided')
    }
    if (!environment || environment.length === 0) {
      throw new Error('no environment provided')
    }
  } else {
    throw new Error(
      'An unhandled condition was encountered while processing post-deployment logic'
    )
  }

  // Check the deployment status
  var success
  if (status === 'success') {
    success = true
  } else {
    success = false
  }

  var banner
  var deployTypeString = ' ' // a single space as a default

  // Set the message banner and deploy type based on the deployment mode
  if (noop === 'true') {
    banner = 'noop 🧪'
    deployTypeString = ' noop '
  } else {
    banner = 'production 🪐'
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

  // Conditionally format the message body
  var message_fmt
  if (customMessage && customMessage.length > 0) {
    message_fmt = `
    ### Deployment Results - ${banner}
  
    - Deployment${' ' + deployTypeString.trim()}: ${deployStatus}
    - Branch: \`${ref}\`
  
    <details><summary>Show Results</summary>
  
    \`\`\`${customMessage}\`\`\`
  
    </details>
  
    ${message}
  
    > Pusher: @${context.actor}, Action: \`${
      context.eventName
    }\`, Workflow: \`${context.workflow}\`
    `
  } else {
    message_fmt = `
    ### Deployment Results - ${banner}
  
    - Deployment${' ' + deployTypeString.trim()}: ${deployStatus}
    - Branch: \`${ref}\`
  
    ${message}
  
    > Pusher: @${context.actor}, Action: \`${
      context.eventName
    }\`, Workflow: \`${context.workflow}\`
    `
  }

  // Update the action status to indicate the result of the deployment as a comment
  await actionStatus(
    context,
    octokit,
    parseInt(comment_id),
    message_fmt,
    success,
    ref
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
    return
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

  // If the post deploy comment logic completes successfully, return
  return
}
