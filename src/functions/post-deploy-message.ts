import * as core from '@actions/core'
import {checkInput} from './check-input.ts'
import {dedent} from './dedent.ts'
import {existsSync} from 'node:fs'
import nunjucks from 'nunjucks'
import {getActionInput, getBooleanActionInput} from '../action-io.ts'
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
  data: PostDeployMessageData
): string {
  // fetch the inputs
  const environment_url_in_comment = getBooleanActionInput(
    'environment_url_in_comment'
  )
  const deployMessagePath = checkInput(getActionInput('deploy_message_path'))

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
    total_seconds: data.total_seconds
  }

  const environmentUrlJson =
    vars.environment_url !== null && vars.environment_url !== ''
      ? `"${vars.environment_url}"`
      : 'null'
  const reviewDecisionJson =
    vars.review_decision !== null && vars.review_decision !== ''
      ? `"${vars.review_decision}"`
      : 'null'
  const paramsJson =
    vars.params !== null && vars.params !== '' ? `"${vars.params}"` : 'null'

  // this is kinda gross but wrangling dedent() and nunjucks is a pain
  const deployment_metadata = dedent(`
    <details><summary>Details</summary>

    <!--- post-deploy-metadata-start -->

    \t\t\t\t\`\`\`json
    \t\t\t\t{
    \t\t\t\t  "status": "${vars.status}",
    \t\t\t\t  "environment": {
    \t\t\t\t    "name": "${vars.environment}",
    \t\t\t\t    "url": ${environmentUrlJson}
    \t\t\t\t  },
    \t\t\t\t  "deployment": {
    \t\t\t\t    "id": ${String(vars.deployment_id)},
    \t\t\t\t    "timestamp": "${vars.deployment_end_time}",
    \t\t\t\t    "logs": "${vars.logs}",
    \t\t\t\t    "duration": ${vars.total_seconds}
    \t\t\t\t  },
    \t\t\t\t  "git": {
    \t\t\t\t    "branch": "${vars.ref}",
    \t\t\t\t    "commit": "${vars.sha}",
    \t\t\t\t    "verified": ${vars.commit_verified}
    \t\t\t\t  },
    \t\t\t\t  "context": {
    \t\t\t\t    "actor": "${vars.actor}",
    \t\t\t\t    "noop": ${vars.noop},
    \t\t\t\t    "fork": ${vars.fork}
    \t\t\t\t  },
    \t\t\t\t  "reviews": {
    \t\t\t\t    "count": ${String(vars.approved_reviews_count)},
    \t\t\t\t    "decision": ${reviewDecisionJson}
    \t\t\t\t  },
    \t\t\t\t  "parameters": {
    \t\t\t\t    "raw": ${paramsJson},
    \t\t\t\t    "parsed": ${String(vars.parsed_params)}
    \t\t\t\t  }
    \t\t\t\t}
    \`\`\`

    <!--- post-deploy-metadata-end -->

    </details>
  `)

  // if the 'deployMessagePath' exists, use that instead of the env var option
  // the env var option can often fail if the message is too long so this is the preferred option
  if (deployMessagePath !== null) {
    if (existsSync(deployMessagePath)) {
      core.debug('using deployMessagePath')
      nunjucks.configure({autoescape: true})
      return nunjucks.render(deployMessagePath, vars)
    }
  } else {
    core.debug(`deployMessagePath is not set - ${String(deployMessagePath)}`)
  }

  // If we get here, try to use the env var option with the default message structure
  const deployMessageEnvVar = checkInput(process.env['DEPLOY_MESSAGE'])

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
    message_fmt = dedent(`
    ### Deployment Results ${deployStatus}

    ${message}

    <details><summary>Show Results</summary>

    ${customMessageFmt}

    </details>

    ${deployment_metadata}
    `)
  } else {
    message_fmt = dedent(`
    ### Deployment Results ${deployStatus}

    ${message}
    
    ${deployment_metadata}`)
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
