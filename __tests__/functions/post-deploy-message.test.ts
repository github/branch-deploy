import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import type {PostDeployMessageData} from '../../src/types.ts'
import {createContext} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'
import {decodedJsonValue} from '../../src/trust-boundaries.ts'
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
    data.environment_url === '' ? null : data.environment_url
  const deploymentId = data.deployment_id ? parseInt(data.deployment_id) : null
  const reviewCount = data.approved_reviews_count
    ? parseInt(data.approved_reviews_count)
    : null
  const metadata = {
    status: data.status,
    environment: {name: data.environment, url: environmentUrl},
    deployment: {
      id: deploymentId,
      timestamp: data.deployment_end_time,
      logs,
      duration: data.total_seconds
    },
    git: {branch: data.ref, commit: data.sha, verified: data.commit_verified},
    context: {actor: context.actor, noop: data.noop, fork: data.fork},
    reviews: {
      count: reviewCount,
      decision: data.review_decision === '' ? null : data.review_decision
    },
    parameters: {
      raw: data.params === '' ? null : data.params,
      parsed:
        data.parsed_params === '' ? null : decodedJsonValue(data.parsed_params)
    }
  }

  return [
    '<details><summary>Details</summary>',
    '',
    '<!--- post-deploy-metadata-start -->',
    '',
    '```json',
    JSON.stringify(metadata, null, 2),
    '```',
    '',
    '<!--- post-deploy-metadata-end -->',
    '',
    '</details>'
  ].join('\n')
}

function defaultMessage(
  heading: string,
  message: string,
  metadata: string,
  environmentUrl?: string
): string {
  const parts = [heading, '', message, '', metadata]
  if (environmentUrl !== undefined) {
    parts.push('', environmentUrl)
  }
  return parts.join('\n')
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
    defaultMessage(
      '### Deployment Results ✅',
      `**${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**`,
      deployment_metadata,
      `> **Environment URL:** [${environment_url_simple}](${environment_url})`
    )
  )
})

test('successfully constructs a post deploy message with the defaults during a "noop" deploy', () => {
  data = {...data, noop: true}
  deployment_metadata = renderDeploymentMetadata(data)
  assert.strictEqual(
    postDeployMessage(context, data),
    defaultMessage(
      '### Deployment Results ✅',
      `**${context.actor}** successfully **noop** deployed branch \`${ref}\` to **${environment}**`,
      deployment_metadata
    )
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment failure', () => {
  data = {...data, status: 'failure'}
  deployment_metadata = renderDeploymentMetadata(data)
  assert.strictEqual(
    postDeployMessage(context, data),
    defaultMessage(
      '### Deployment Results ❌',
      `**${context.actor}** had a failure when deploying branch \`${ref}\` to **${environment}**`,
      deployment_metadata
    )
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment with an unknown status', () => {
  data = {...data, status: 'unknown'}
  deployment_metadata = renderDeploymentMetadata(data)

  assert.strictEqual(
    postDeployMessage(context, data),
    defaultMessage(
      '### Deployment Results ⚠️',
      'Warning: deployment status is unknown, please use caution',
      deployment_metadata
    )
  )
})

test('falls back to the default message when no trusted template is supplied', () => {
  data = {...data, status: 'unknown'}
  deployment_metadata = renderDeploymentMetadata(data)

  assert.strictEqual(
    postDeployMessage(context, data, null),
    defaultMessage(
      '### Deployment Results ⚠️',
      'Warning: deployment status is unknown, please use caution',
      deployment_metadata
    )
  )
})

test('successfully constructs a post deploy message with a custom env var', testContext => {
  stubEnv(testContext, 'DEPLOY_MESSAGE', 'Deployed 1 shiny new server')

  assert.strictEqual(
    postDeployMessage(context, data),
    [
      '### Deployment Results ✅',
      '',
      `**${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**`,
      '',
      '<details><summary>Show Results</summary>',
      '',
      'Deployed 1 shiny new server',
      '',
      '</details>',
      '',
      deployment_metadata,
      '',
      `> **Environment URL:** [${environment_url_simple}](${environment_url})`
    ].join('\n')
  )
})

test('expands escaped newlines and tabs in the custom deployment message', testContext => {
  stubEnv(
    testContext,
    'DEPLOY_MESSAGE',
    'First line\\nSecond line\\tindented\\nThird line'
  )

  assert.strictEqual(
    postDeployMessage(context, data),
    [
      '### Deployment Results ✅',
      '',
      `**${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**`,
      '',
      '<details><summary>Show Results</summary>',
      '',
      'First line\nSecond line\tindented\nThird line',
      '',
      '</details>',
      '',
      deployment_metadata,
      '',
      `> **Environment URL:** [${environment_url_simple}](${environment_url})`
    ].join('\n')
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
    [
      '### Deployment Results ✅',
      '',
      `**${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**`,
      '',
      '<details><summary>Show Results</summary>',
      '',
      'Deployed 1 shiny new server',
      '',
      '</details>',
      '',
      deployment_metadata
    ].join('\n')
  )
})

test('renders an empty review decision as null metadata', () => {
  data = {...data, review_decision: ''}

  assert.ok(postDeployMessage(context, data).includes('"decision": null'))
})

test('renders arbitrary post-deploy values as valid fenced JSON', () => {
  const hostile = 'quote " slash \\ newline\nUnicode 🚀 and `````` backticks'
  data = {
    ...data,
    environment: hostile,
    environment_url: `https://example.com/${hostile}`,
    params: hostile,
    parsed_params: JSON.stringify({_: [hostile], value: hostile}),
    ref: hostile,
    sha: hostile
  }

  const rendered = postDeployMessage(context, data)
  const match = rendered.match(
    /<!--- post-deploy-metadata-start -->\n\n(`{3,})json\n([\s\S]*?)\n\1\n\n<!--- post-deploy-metadata-end -->/u
  )
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error('expected post-deploy metadata block')
  }
  assert.ok(match[1].length > 6)
  const metadata = decodedJsonValue(match[2])
  assert.deepStrictEqual(metadata, {
    status: 'success',
    environment: {name: hostile, url: `https://example.com/${hostile}`},
    deployment: {
      id: 456,
      timestamp: '2024-01-01T00:00:00Z',
      logs,
      duration: 27
    },
    git: {branch: hostile, commit: hostile, verified: false},
    context: {actor: 'monalisa', noop: false, fork: false},
    reviews: {count: 4, decision: 'APPROVED'},
    parameters: {raw: hostile, parsed: {_: [hostile], value: hostile}}
  })
})

test('renders every allowlisted variable in a trusted template', testContext => {
  stubEnv(testContext, 'DEPLOY_MESSAGE', 'deployment output')
  const template = [
    '{{ environment }}',
    '{{ environment_url }}',
    '{{ status }}',
    '{{ noop }}',
    '{{ ref }}',
    '{{ sha }}',
    '{{ approved_reviews_count }}',
    '{{ review_decision }}',
    '{{ deployment_id }}',
    '{{ fork }}',
    '{{ params }}',
    '{{ parsed_params }}',
    '{{ deployment_end_time }}',
    '{{ actor }}',
    '{{ logs }}',
    '{{ commit_verified }}',
    '{{ total_seconds }}',
    '{{ results }}'
  ].join('|')

  assert.strictEqual(
    postDeployMessage(context, data, template),
    [
      environment,
      environment_url,
      status,
      String(noop),
      ref,
      sha,
      approved_reviews_count,
      review_decision,
      String(deployment_id),
      String(fork),
      params,
      parsed_params.replaceAll('"', '&quot;'),
      deployment_end_time,
      context.actor,
      logs,
      'false',
      String(total_seconds),
      'deployment output'
    ].join('|')
  )
  assertCalledWith(debugMock, 'using trusted deployment template')
})

test('escapes ordinary variables while rendering results raw and only once', testContext => {
  const rawResults =
    '<details>{{ actor }}{% if status %}do not evaluate{% endif %}</details>'
  stubEnv(testContext, 'DEPLOY_MESSAGE', rawResults)
  data = {
    ...data,
    environment: '<prod data-name="blue">Tom & Jerry\'s</prod>'
  }

  assert.strictEqual(
    postDeployMessage(
      context,
      data,
      '{{ environment }}\n{{ results }}\n{{ actor }}'
    ),
    [
      '&lt;prod data-name=&quot;blue&quot;&gt;Tom &amp; Jerry&#39;s&lt;/prod&gt;',
      rawResults,
      'monalisa'
    ].join('\n')
  )
})
