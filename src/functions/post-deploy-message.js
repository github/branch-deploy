import * as core from '@actions/core'
import {checkInput} from './check-input'
import dedent from 'dedent-js'
import {readFileSync, existsSync} from 'fs'

// Helper function construct a post deployment message
// :param context: The GitHub Actions event context
// :param environment: The environment of the deployment (String)
// :param environment_url: The environment url of the deployment (String)
// :param status: The status of the deployment (String)
// :param noop: Indicates whether the deployment is a noop or not (String)
// :param ref: The ref (branch) which is being used for deployment (String)
// :returns: The formatted message (String)
export async function postDeployMessage(
  context,
  environment,
  environment_url,
  status,
  noop,
  ref
) {
  // fetch the inputs
  const environment_url_in_comment =
    core.getInput('environment_url_in_comment') === 'true'
  const tmp = core.getInput('tmp', {required: true})
  const deploy_message_filename = await checkInput(
    core.getInput('deploy_message_filename')
  )

  // if the 'deployMessagePath' exists, use that instead of the env var option
  // the env var option can often fail if the message is too long so this is the preferred option
  var deployMessageFileContents
  if (deploy_message_filename) {
    const deployMessagePath = `${tmp}/${deploy_message_filename}`
    core.debug(`deployMessagePath: ${deployMessagePath}`)
    if (existsSync(deployMessagePath)) {
      deployMessageFileContents = readFileSync(deployMessagePath, 'utf8')
      core.debug(`deployMessageFileContents: ${deployMessageFileContents}`)

      // make sure the file contents are not empty
      if (
        !deployMessageFileContents ||
        deployMessageFileContents.length === 0
      ) {
        deployMessageFileContents = null
        core.debug('deployMessageFileContents is empty - setting to null')
      }
    }
  }

  if (deployMessageFileContents) {
    core.debug('using deployMessageFileContents')
  }

  /// If we get here, try to use the env var option with the default message structure

  const deployMessageEnvVar = await checkInput(process.env.DEPLOY_MESSAGE)

  var deployTypeString = ' ' // a single space as a default

  // Set the mode and deploy type based on the deployment mode
  if (noop === 'true') {
    deployTypeString = ' **noop** '
  }

  // Dynamically set the message text depending if the deployment succeeded or failed
  var message
  var deployStatus
  if (status === 'success') {
    message = `**${context.actor}** successfully${deployTypeString}deployed branch \`${ref}\` to **${environment}**`
    deployStatus = '✅'
  } else if (status === 'failure') {
    message = `**${context.actor}** had a failure when${deployTypeString}deploying branch \`${ref}\` to **${environment}**`
    deployStatus = '❌'
  } else {
    message = `Warning:${deployTypeString}deployment status is unknown, please use caution`
    deployStatus = '⚠️'
  }

  // Conditionally format the message body
  var message_fmt
  if (deployMessageEnvVar) {
    const customMessageFmt = deployMessageEnvVar
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
    message_fmt = dedent(`
    ### Deployment Results ${deployStatus}

    ${message}

    <details><summary>Show Results</summary>

    ${customMessageFmt}

    </details>
    `)
  } else {
    message_fmt = dedent(`
    ### Deployment Results ${deployStatus}

    ${message}`)
  }

  // Conditionally add the environment url to the message body
  // This message only gets added if the deployment was successful, and the noop mode is not enabled, and the environment url is not empty
  if (
    environment_url &&
    status === 'success' &&
    noop !== 'true' &&
    environment_url_in_comment === true
  ) {
    const environment_url_short = environment_url
      .replace('https://', '')
      .replace('http://', '')
    message_fmt += `\n\n> **Environment URL:** [${environment_url_short}](${environment_url})`
  }

  return message_fmt
}
