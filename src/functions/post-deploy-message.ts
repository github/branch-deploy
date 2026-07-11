import * as core from '../actions-core.ts'
import {checkInput} from './check-input.ts'
import {getBooleanActionInput} from '../action-io.ts'
import {jsonCodeBlock} from './json-code-block.ts'
import {renderDeploymentTemplate} from './deployment-template.ts'
import {decodedJsonValue} from '../trust-boundaries.ts'
import type {BranchDeployContext, PostDeployMessageData} from '../types.ts'

// Helper function construct a post deployment message
// :param context: The GitHub Actions event context
// :param data: A data object containing attributes of the message
//   - attribute: environment: The environment of the deployment (String)
//   - attribute: environment_url: The environment url of the deployment (String)
//   - attribute: status: The status of the deployment (String)
//   - attribute: noop: Indicates whether the deployment is a noop or not (Boolean)
//   - attribute: ref: The ref (branch) which is being used for deployment (String)
//   - attribute: sha: The exact commit SHA of the deployment (String)
//   - attribute: approved_reviews_count: The count of approved reviews for the deployment (String representation of an int or null)
//   - attribute: review_decision: The review status of the pull request (String or null) - Ex: APPROVED, REVIEW_REQUIRED, etc
//   - attribute: deployment_id: The id of the deployment (String)
//   - attribute: fork: Indicates whether the deployment is from a forked repository (Boolean)
//   - attribute: params: The raw string of deployment parameters (String)
//   - attribute: parsed_params: A string representation of the parsed deployment parameters (String)
//   - attribute: deployment_end_time: The time the deployment ended - this value is not _exact_ but it is very close (String)
//   - attribute: commit_verified: Indicates whether the commit is verified or not (Boolean)
//   - attribute: total_seconds: The total amount of seconds that the deployment took (Int)
// :returns: The formatted message (String)
export function postDeployMessage(
  context: BranchDeployContext,
  data: PostDeployMessageData,
  template: string | null = null
): string {
  // fetch the inputs
  const environment_url_in_comment = getBooleanActionInput(
    'environment_url_in_comment'
  )
  const deploymentResults = checkInput(process.env['DEPLOY_MESSAGE'])

  const vars = {
    environment: data.environment,
    environment_url: data.environment_url === '' ? null : data.environment_url,
    status: data.status,
    noop: data.noop,
    ref: data.ref,
    sha: data.sha,
    approved_reviews_count: data.approved_reviews_count
      ? parseInt(data.approved_reviews_count)
      : null,
    review_decision: data.review_decision === '' ? null : data.review_decision,
    deployment_id: data.deployment_id ? parseInt(data.deployment_id) : null,
    fork: data.fork,
    params: data.params === '' ? null : data.params,
    parsed_params: data.parsed_params === '' ? null : data.parsed_params,
    deployment_end_time: data.deployment_end_time,
    actor: context.actor,
    logs: `${String(process.env['GITHUB_SERVER_URL'])}/${context.repo.owner}/${context.repo.repo}/actions/runs/${String(process.env['GITHUB_RUN_ID'])}`,
    commit_verified: data.commit_verified,
    total_seconds: data.total_seconds,
    results: deploymentResults ?? ''
  }

  if (template !== null) {
    core.debug('using trusted deployment template')
    return renderDeploymentTemplate(template, vars)
  }

  const parsedParams =
    vars.parsed_params === null || vars.parsed_params === ''
      ? null
      : decodedJsonValue(vars.parsed_params)
  const metadata = {
    status: vars.status,
    environment: {
      name: vars.environment,
      url: vars.environment_url
    },
    deployment: {
      id: vars.deployment_id,
      timestamp: vars.deployment_end_time,
      logs: vars.logs,
      duration: vars.total_seconds
    },
    git: {
      branch: vars.ref,
      commit: vars.sha,
      verified: vars.commit_verified
    },
    context: {
      actor: vars.actor,
      noop: vars.noop,
      fork: vars.fork
    },
    reviews: {
      count: vars.approved_reviews_count,
      decision: vars.review_decision
    },
    parameters: {
      raw: vars.params,
      parsed: parsedParams
    }
  }
  const metadataBlock = jsonCodeBlock(metadata)

  const deployment_metadata = [
    '<details><summary>Details</summary>',
    '',
    '<!--- post-deploy-metadata-start -->',
    '',
    metadataBlock,
    '',
    '<!--- post-deploy-metadata-end -->',
    '',
    '</details>'
  ].join('\n')

  // If we get here, try to use the env var option with the default message structure
  const deployMessageEnvVar = deploymentResults

  let deployTypeString = ' ' // a single space as a default

  // Set the mode and deploy type based on the deployment mode
  if (data.noop) {
    deployTypeString = ' **noop** '
  }

  // Dynamically set the message text depending if the deployment succeeded or failed
  let message: string
  let deployStatus: string
  if (data.status === 'success') {
    message = `**${context.actor}** successfully${deployTypeString}deployed branch \`${data.ref}\` to **${data.environment}**`
    deployStatus = '✅'
  } else if (data.status === 'failure') {
    message = `**${context.actor}** had a failure when${deployTypeString}deploying branch \`${data.ref}\` to **${data.environment}**`
    deployStatus = '❌'
  } else {
    message = `Warning:${deployTypeString}deployment status is unknown, please use caution`
    deployStatus = '⚠️'
  }

  // Conditionally format the message body
  let message_fmt: string
  if (deployMessageEnvVar !== null) {
    const customMessageFmt = deployMessageEnvVar
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
    message_fmt = [
      `### Deployment Results ${deployStatus}`,
      '',
      message,
      '',
      '<details><summary>Show Results</summary>',
      '',
      customMessageFmt,
      '',
      '</details>',
      '',
      deployment_metadata
    ].join('\n')
  } else {
    message_fmt = [
      `### Deployment Results ${deployStatus}`,
      '',
      message,
      '',
      deployment_metadata
    ].join('\n')
  }

  // Conditionally add the environment url to the message body
  // This message only gets added if the deployment was successful, and the noop mode is not enabled, and the environment url is not empty
  if (
    data.environment_url !== null &&
    data.environment_url !== '' &&
    data.status === 'success' &&
    !data.noop &&
    environment_url_in_comment
  ) {
    const environment_url_short = data.environment_url
      .replace('https://', '')
      .replace('http://', '')
    message_fmt += `\n\n> **Environment URL:** [${environment_url_short}](${data.environment_url})`
  }

  return message_fmt
}
