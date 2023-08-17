import * as core from '@actions/core'
import {checkInput} from './check-input'
import dedent from 'dedent-js'
import {existsSync} from 'fs'
import nunjucks from 'nunjucks'

// Helper function construct a post deployment message
// :param context: The GitHub Actions event context
// :param environment: The environment of the deployment (String)
// :param environment_url: The environment url of the deployment (String)
// :param status: The status of the deployment (String)
// :param noop: Indicates whether the deployment is a noop or not (Boolean)
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
  const environment_url_in_comment = core.getBooleanInput(
    'environment_url_in_comment'
  )
  const deployMessagePath = await checkInput(
    core.getInput('deploy_message_path')
  )

  // if the 'deployMessagePath' exists, use that instead of the env var option
  // the env var option can often fail if the message is too long so this is the preferred option
  if (deployMessagePath) {
    if (existsSync(deployMessagePath)) {
      core.debug('using deployMessagePath')
      nunjucks.configure({autoescape: true})
      const vars = {
        environment,
        environment_url,
        status,
        noop,
        ref,
        actor: context.actor
      }
      return nunjucks.render(deployMessagePath, vars)
    }
  }

  // If we get here, try to use the env var option with the default message structure
  const deployMessageEnvVar = await checkInput(process.env.DEPLOY_MESSAGE)

  var deployTypeString = ' ' // a single space as a default

  // Set the mode and deploy type based on the deployment mode
  if (noop === true) {
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
    noop !== true &&
    environment_url_in_comment === true
  ) {
    const environment_url_short = environment_url
      .replace('https://', '')
      .replace('http://', '')
    message_fmt += `\n\n> **Environment URL:** [${environment_url_short}](${environment_url})`
  }

  return message_fmt
}
