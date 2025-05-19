import {test, expect, jest, beforeEach} from '@jest/globals'

import {postDeployMessage} from '../../src/functions/post-deploy-message.js.js'
import * as core from '@actions/core'
import dedent from 'dedent-js'

const debugMock = jest.spyOn(core, 'debug')

var context
var environment
var environment_url
var environment_url_simple
var status
var noop
var ref
var approved_reviews_count
var sha
var deployment_id
var data
var review_decision
var fork
var params
var parsed_params
var deployment_end_time
var logs
var deployment_metadata
var total_seconds

function renderDeploymentMetadata(data) {
  return dedent(`
    <details><summary>Details</summary>

    <!--- post-deploy-metadata-start -->

    \t\t\t\t\`\`\`json
    \t\t\t\t{
    \t\t\t\t  "status": "${data.status}",
    \t\t\t\t  "environment": {
    \t\t\t\t    "name": "${data.environment}",
    \t\t\t\t    "url": ${data.environment_url ? `"${data.environment_url}"` : null}
    \t\t\t\t  },
    \t\t\t\t  "deployment": {
    \t\t\t\t    "id": ${data.deployment_id ? parseInt(data.deployment_id) : null},
    \t\t\t\t    "timestamp": "${data.deployment_end_time}",
    \t\t\t\t    "logs": "${data.logs}",
    \t\t\t\t    "duration": ${data.total_seconds}
    \t\t\t\t  },
    \t\t\t\t  "git": {
    \t\t\t\t    "branch": "${data.ref}",
    \t\t\t\t    "commit": "${data.sha}",
    \t\t\t\t    "verified": ${data.commit_verified}
    \t\t\t\t  },
    \t\t\t\t  "context": {
    \t\t\t\t    "actor": "${data.actor}",
    \t\t\t\t    "noop": ${data.noop},
    \t\t\t\t    "fork": ${data.fork}
    \t\t\t\t  },
    \t\t\t\t  "reviews": {
    \t\t\t\t    "count": ${data.approved_reviews_count ? parseInt(data.approved_reviews_count) : null},
    \t\t\t\t    "decision": ${data.review_decision ? `"${data.review_decision}"` : null}
    \t\t\t\t  },
    \t\t\t\t  "parameters": {
    \t\t\t\t    "raw": ${data.params ? `"${data.params}"` : null},
    \t\t\t\t    "parsed": ${data.parsed_params || null}
    \t\t\t\t  }
    \t\t\t\t}
    \`\`\`

    <!--- post-deploy-metadata-end -->

    </details>
  `)
}

beforeEach(() => {
  jest.clearAllMocks()

  process.env.GITHUB_SERVER_URL = 'https://github.com'
  process.env.GITHUB_RUN_ID = '12345'

  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})

  process.env.DEPLOY_MESSAGE = null
  process.env.INPUT_ENVIRONMENT_URL_IN_COMMENT = 'true'
  process.env.INPUT_DEPLOY_MESSAGE_PATH = '.github/deployment_message.md'

  environment = 'production'
  environment_url = 'https://example.com'
  environment_url_simple = 'example.com'
  status = 'success'
  noop = false
  ref = 'test-ref'
  sha = 'abc123'
  approved_reviews_count = '4'
  deployment_id = 456
  review_decision = 'APPROVED'
  fork = false
  params = 'LOG_LEVEL=debug --config.db.host=localhost --config.db.port=5432'
  parsed_params = JSON.stringify({
    config: {db: {host: 'localhost', port: 5432}},
    _: ['LOG_LEVEL=debug']
  })
  deployment_end_time = '2024-01-01T00:00:00Z'
  total_seconds = 27

  context = {
    actor: 'monalisa',
    eventName: 'issue_comment',
    workflow: 'test-workflow',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    payload: {
      comment: {
        id: '1'
      }
    }
  }

  logs = `${process.env.GITHUB_SERVER_URL}/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`

  data = {
    environment: environment,
    environment_url: environment_url,
    status: status,
    noop: noop,
    ref: ref,
    sha: sha,
    approved_reviews_count: approved_reviews_count,
    review_decision: review_decision,
    deployment_id: deployment_id,
    fork: fork,
    params: params,
    parsed_params: parsed_params,
    deployment_end_time: deployment_end_time,
    actor: context.actor,
    logs: logs,
    commit_verified: false,
    total_seconds: total_seconds
  }

  deployment_metadata = renderDeploymentMetadata(data)
})

test('successfully constructs a post deploy message with the defaults', async () => {
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
    ### Deployment Results ✅

    **${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**

    ${deployment_metadata}

    > **Environment URL:** [${environment_url_simple}](${environment_url})
    `)
  )
})

test('successfully constructs a post deploy message with the defaults during a "noop" deploy', async () => {
  data.noop = true
  deployment_metadata = renderDeploymentMetadata(data)
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
    ### Deployment Results ✅

    **${context.actor}** successfully **noop** deployed branch \`${ref}\` to **${environment}**

    ${deployment_metadata}`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment failure', async () => {
  data.status = 'failure'
  deployment_metadata = renderDeploymentMetadata(data)
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
    ### Deployment Results ❌

    **${context.actor}** had a failure when deploying branch \`${ref}\` to **${environment}**

    ${deployment_metadata}
    `)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment with an unknown status', async () => {
  data.status = 'unknown'
  deployment_metadata = renderDeploymentMetadata(data)

  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
    ### Deployment Results ⚠️

    Warning: deployment status is unknown, please use caution

    ${deployment_metadata}`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment with an unknown status and the DEPLOY_MESSAGE_PATH is unset', async () => {
  process.env.INPUT_DEPLOY_MESSAGE_PATH = ''
  data.status = 'unknown'
  deployment_metadata = renderDeploymentMetadata(data)

  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
    ### Deployment Results ⚠️

    Warning: deployment status is unknown, please use caution

    ${deployment_metadata}
    `)
  )

  expect(debugMock).toHaveBeenCalledWith('deployMessagePath is not set - null')
})

test('successfully constructs a post deploy message with a custom env var', async () => {
  process.env.DEPLOY_MESSAGE = 'Deployed 1 shiny new server'

  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
    ### Deployment Results ✅

    **${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**

    <details><summary>Show Results</summary>

    Deployed 1 shiny new server

    </details>

    ${deployment_metadata}

    > **Environment URL:** [${environment_url_simple}](${environment_url})`)
  )
})

test('successfully constructs a post deploy message with a custom env var when certain values are undefined', async () => {
  process.env.DEPLOY_MESSAGE = 'Deployed 1 shiny new server'

  data.deployment_id = undefined
  data.approved_reviews_count = null
  data.parsed_params = ''
  data.environment_url = ''
  data.params = ''
  data.review_decision = null

  deployment_metadata = renderDeploymentMetadata(data)

  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
    ### Deployment Results ✅

    **${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**

    <details><summary>Show Results</summary>

    Deployed 1 shiny new server

    </details>

    ${deployment_metadata}`)
  )
})

test('successfully constructs a post deploy message with a custom markdown file', async () => {
  process.env.INPUT_DEPLOY_MESSAGE_PATH =
    '__tests__/templates/test_deployment_message.md'
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`### Deployment Results :rocket:

    The following variables are available to use in this template:

    - \`environment\` - The name of the environment (String)
    - \`environment_url\` - The URL of the environment (String) {Optional}
    - \`status\` - The status of the deployment (String) - \`success\`, \`failure\`, or \`unknown\`
    - \`noop\` - Whether or not the deployment is a noop (Boolean)
    - \`ref\` - The ref of the deployment (String)
    - \`sha\` - The exact commit SHA of the deployment (String)
    - \`actor\` - The GitHub username of the actor who triggered the deployment (String)
    - \`approved_reviews_count\` - The number of approved reviews on the pull request at the time of deployment (String of a number)
    - \`deployment_id\` - The ID of the deployment (String)
    - \`review_decision\` - The decision of the review (String or null) - \`"APPROVED"\`, \`"REVIEW_REQUIRED"\`, \`"CHANGES_REQUESTED"\`, \`null\`, etc.
    - \`params\` - The raw parameters provided in the deploy command (String)
    - \`parsed_params\` - The parsed parameters provided in the deploy command (String)
    - \`deployment_end_time\` - The end time of the deployment - this value is not _exact_ but it is very close (String)
    - \`logs\` - The url to the logs of the deployment (String)
    - \`commit_verified\` - Whether or not the commit was verified (Boolean)
    - \`total_seconds\` - The total number of seconds the deployment took (String of a number)

    Here is an example:

    monalisa deployed branch \`test-ref\` to the **production** environment. This deployment was a success :rocket:.

    The exact commit sha that was used for the deployment was \`${sha}\`.

    The exact deployment ID for this deployment was \`${deployment_id}\`.

    The review decision for this deployment was \`${review_decision}\`.

    The deployment had the following parameters provided in the deploy command: \`LOG_LEVEL=debug --config.db.host=localhost --config.db.port=5432\`

    The deployment had the following "parsed" parameters provided in the deploy command: \`{"config":{"db":{"host":"localhost","port":5432}},"_":["LOG_LEVEL=debug"]}\`

    The deployment process ended at \`2024-01-01T00:00:00Z\` and it took \`27\` seconds to complete.

    Here are the deployment logs: https://github.com/corp/test/actions/runs/12345

    The commit was not verified.

    You can view the deployment [here](https://example.com).



    > This deployment had \`4\` approvals.

    `)
  )
})
