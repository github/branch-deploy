import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {dedent} from '../../src/functions/dedent.ts'
import type {PostDeployMessageData} from '../../src/types.ts'
import {createContext} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'
import {
  assertCalledWith,
  createMock,
  stubEnv,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

function readInput(name: string, trimWhitespace = true): string {
  const value =
    process.env[`INPUT_${name.replace(/ /gu, '_').toUpperCase()}`] ?? ''
  return trimWhitespace ? value.trim() : value
}

const debugMock = createMock<ActionsCore['debug']>()
const getInputMock = createMock<ActionsCore['getInput']>((name, options) =>
  readInput(name, options?.trimWhitespace !== false)
)
const getBooleanInputMock = createMock<ActionsCore['getBooleanInput']>(
  (name, options) =>
    readInput(name, options?.trimWhitespace !== false) === 'true'
)

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  getBooleanInput: getBooleanInputMock,
  getInput: getInputMock
})

const {postDeployMessage} =
  await import('../../src/functions/post-deploy-message.ts')

let context: Parameters<typeof postDeployMessage>[0]
let environment: string
let environment_url: string
let environment_url_simple: string
let status: string
let noop: boolean
let ref: string
let approved_reviews_count: string
let sha: string
let deployment_id: number
let data: PostDeployMessageData
let review_decision: string
let fork: boolean
let params: string
let parsed_params: string
let deployment_end_time: string
let logs: string
let deployment_metadata: string
let total_seconds: number

function renderDeploymentMetadata(data: PostDeployMessageData): string {
  const environmentUrl =
    data.environment_url !== null && data.environment_url.length > 0
      ? `"${data.environment_url}"`
      : null
  const deploymentId = data.deployment_id ? parseInt(data.deployment_id) : null
  const reviewCount = data.approved_reviews_count
    ? parseInt(data.approved_reviews_count)
    : null
  const reviewDecision = data.review_decision
    ? `"${data.review_decision}"`
    : null
  const rawParams = data.params ? `"${data.params}"` : null
  const parsedParams = data.parsed_params || null

  return dedent(`
    <details><summary>Details</summary>

    <!--- post-deploy-metadata-start -->

    \t\t\t\t\`\`\`json
    \t\t\t\t{
    \t\t\t\t  "status": "${data.status}",
    \t\t\t\t  "environment": {
    \t\t\t\t    "name": "${data.environment}",
    \t\t\t\t    "url": ${String(environmentUrl)}
    \t\t\t\t  },
    \t\t\t\t  "deployment": {
    \t\t\t\t    "id": ${String(deploymentId)},
    \t\t\t\t    "timestamp": "${data.deployment_end_time}",
    \t\t\t\t    "logs": "${logs}",
    \t\t\t\t    "duration": ${data.total_seconds}
    \t\t\t\t  },
    \t\t\t\t  "git": {
    \t\t\t\t    "branch": "${data.ref}",
    \t\t\t\t    "commit": "${data.sha}",
    \t\t\t\t    "verified": ${data.commit_verified}
    \t\t\t\t  },
    \t\t\t\t  "context": {
    \t\t\t\t    "actor": "${context.actor}",
    \t\t\t\t    "noop": ${data.noop},
    \t\t\t\t    "fork": ${data.fork}
    \t\t\t\t  },
    \t\t\t\t  "reviews": {
    \t\t\t\t    "count": ${String(reviewCount)},
    \t\t\t\t    "decision": ${String(reviewDecision)}
    \t\t\t\t  },
    \t\t\t\t  "parameters": {
    \t\t\t\t    "raw": ${String(rawParams)},
    \t\t\t\t    "parsed": ${String(parsedParams)}
    \t\t\t\t  }
    \t\t\t\t}
    \`\`\`

    <!--- post-deploy-metadata-end -->

    </details>
  `)
}

beforeEach(testContext => {
  if (!('after' in testContext)) {
    throw new Error('expected a test context')
  }

  debugMock.mock.resetCalls()
  getInputMock.mock.resetCalls()
  getBooleanInputMock.mock.resetCalls()

  stubEnv(testContext, 'GITHUB_SERVER_URL', 'https://github.com')
  stubEnv(testContext, 'GITHUB_RUN_ID', '12345')

  stubEnv(testContext, 'DEPLOY_MESSAGE', undefined)
  stubEnv(testContext, 'INPUT_ENVIRONMENT_URL_IN_COMMENT', 'true')
  stubEnv(
    testContext,
    'INPUT_DEPLOY_MESSAGE_PATH',
    '.github/deployment_message.md'
  )

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

  context = createContext({
    actor: 'monalisa',
    eventName: 'issue_comment',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    payload: {
      comment: {
        id: '1'
      }
    }
  })

  logs = `${String(process.env['GITHUB_SERVER_URL'])}/${context.repo.owner}/${context.repo.repo}/actions/runs/${String(process.env['GITHUB_RUN_ID'])}`

  data = {
    environment: environment,
    environment_url: environment_url,
    status: status,
    noop: noop,
    ref: ref,
    sha: sha,
    approved_reviews_count: approved_reviews_count,
    review_decision: review_decision,
    deployment_id: String(deployment_id),
    fork: fork,
    params: params,
    parsed_params: parsed_params,
    deployment_end_time: deployment_end_time,
    commit_verified: false,
    total_seconds: total_seconds
  }

  deployment_metadata = renderDeploymentMetadata(data)
})

test('successfully constructs a post deploy message with the defaults', () => {
  assert.strictEqual(
    postDeployMessage(context, data),
    dedent(`
    ### Deployment Results ✅

    **${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**

    ${deployment_metadata}

    > **Environment URL:** [${environment_url_simple}](${environment_url})
    `)
  )
})

test('successfully constructs a post deploy message with the defaults during a "noop" deploy', () => {
  data = {...data, noop: true}
  deployment_metadata = renderDeploymentMetadata(data)
  assert.strictEqual(
    postDeployMessage(context, data),
    dedent(`
    ### Deployment Results ✅

    **${context.actor}** successfully **noop** deployed branch \`${ref}\` to **${environment}**

    ${deployment_metadata}`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment failure', () => {
  data = {...data, status: 'failure'}
  deployment_metadata = renderDeploymentMetadata(data)
  assert.strictEqual(
    postDeployMessage(context, data),
    dedent(`
    ### Deployment Results ❌

    **${context.actor}** had a failure when deploying branch \`${ref}\` to **${environment}**

    ${deployment_metadata}
    `)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment with an unknown status', () => {
  data = {...data, status: 'unknown'}
  deployment_metadata = renderDeploymentMetadata(data)

  assert.strictEqual(
    postDeployMessage(context, data),
    dedent(`
    ### Deployment Results ⚠️

    Warning: deployment status is unknown, please use caution

    ${deployment_metadata}`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment with an unknown status and the DEPLOY_MESSAGE_PATH is unset', testContext => {
  stubEnv(testContext, 'INPUT_DEPLOY_MESSAGE_PATH', '')
  data = {...data, status: 'unknown'}
  deployment_metadata = renderDeploymentMetadata(data)

  assert.strictEqual(
    postDeployMessage(context, data),
    dedent(`
    ### Deployment Results ⚠️

    Warning: deployment status is unknown, please use caution

    ${deployment_metadata}
    `)
  )

  assertCalledWith(debugMock, 'deployMessagePath is not set - null')
})

test('successfully constructs a post deploy message with a custom env var', testContext => {
  stubEnv(testContext, 'DEPLOY_MESSAGE', 'Deployed 1 shiny new server')

  assert.strictEqual(
    postDeployMessage(context, data),
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

test('successfully constructs a post deploy message with a custom env var when certain values are undefined', testContext => {
  stubEnv(testContext, 'DEPLOY_MESSAGE', 'Deployed 1 shiny new server')

  data = unsafeInvalidValue<PostDeployMessageData>({
    ...data,
    deployment_id: undefined,
    approved_reviews_count: null,
    parsed_params: '',
    environment_url: '',
    params: '',
    review_decision: null
  })

  deployment_metadata = renderDeploymentMetadata(data)

  assert.strictEqual(
    postDeployMessage(context, data),
    dedent(`
    ### Deployment Results ✅

    **${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**

    <details><summary>Show Results</summary>

    Deployed 1 shiny new server

    </details>

    ${deployment_metadata}`)
  )
})

test('renders an empty review decision as null metadata', () => {
  data = {...data, review_decision: ''}

  assert.ok(postDeployMessage(context, data).includes('"decision": null'))
})

test('successfully constructs a post deploy message with a custom markdown file', testContext => {
  stubEnv(
    testContext,
    'INPUT_DEPLOY_MESSAGE_PATH',
    '__tests__/templates/test_deployment_message.md'
  )
  assert.strictEqual(
    postDeployMessage(context, data),
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
