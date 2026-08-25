import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import type {CompletionContext} from '../../src/types.ts'
import type {
  ResultOperationOctokit,
  ResultOperationRequest
} from '../../src/functions/result-operation.ts'
import {completionMetadata} from '../../src/functions/result-context.ts'
import {jsonCodeBlock} from '../../src/functions/json-code-block.ts'
import {decodedJsonValue} from '../../src/trust-boundaries.ts'
import {createCompletionContext} from '../result-mode-fixtures.ts'
import {createIssueCommentContext, createOctokit} from '../test-helpers.ts'
import {
  assertCalledTimes,
  assertNotCalled,
  createMock,
  installModuleMock,
  stubEnv
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type PostDeploy = typeof import('../../src/functions/post-deploy.ts')
const actualCore = await import('../../src/actions-core.ts')
const setOutputMock = createMock<ActionsCore['setOutput']>()
const setFailedMock = createMock<ActionsCore['setFailed']>()
const postDeployMock = createMock<PostDeploy['postDeploy']>()
const getCommentMock =
  createMock<ResultOperationOctokit['rest']['issues']['getComment']>()
const getDeploymentMock =
  createMock<ResultOperationOctokit['rest']['repos']['getDeployment']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  ...actualCore,
  setOutput: setOutputMock,
  setFailed: setFailedMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/post-deploy.ts', import.meta.url),
  {
    postDeploy: postDeployMock
  }
)
const {runResultOperation} =
  await import('../../src/functions/result-operation.ts')

function predeployMetadata(completion: CompletionContext) {
  return {
    type: completion.noop ? 'noop' : 'branch',
    completion: completionMetadata(completion),
    environment: {
      name: completion.environment,
      url: completion.environment_url
    },
    deployment: {
      timestamp: completion.deployment_start_time,
      logs: `https://github.com/${completion.repository}/actions/runs/${completion.run_id}`
    },
    git: {
      branch: completion.ref,
      commit: completion.sha,
      verified: completion.commit_verified
    },
    context: {
      actor: completion.actor,
      noop: completion.noop,
      fork: completion.fork,
      comment: {
        html_url: `https://github.com/${completion.repository}/pull/${completion.issue_number}#issuecomment-${completion.trigger_comment_id}`
      }
    },
    parameters: {
      raw: completion.params === '' ? null : completion.params,
      parsed:
        completion.parsed_params === ''
          ? null
          : decodedJsonValue(completion.parsed_params)
    }
  }
}

function startedComment(
  completion: CompletionContext,
  metadata: unknown = predeployMetadata(completion)
) {
  return {
    id: completion.started_comment_id,
    issue_url: `https://api.github.com/repos/${completion.repository}/issues/${completion.issue_number}`,
    body: [
      '### Deployment Triggered',
      '<!--- pre-deploy-metadata-start -->',
      '',
      jsonCodeBlock(metadata),
      '',
      '<!--- pre-deploy-metadata-end -->'
    ].join('\n')
  }
}

function deploymentRecord(completion: CompletionContext) {
  return {
    id: completion.deployment_id,
    sha: completion.sha,
    ref: completion.ref,
    environment: completion.environment,
    payload: {
      type: 'branch-deploy',
      completion: completionMetadata(completion),
      sha: completion.sha,
      github_run_id: completion.run_id,
      initial_comment_id: completion.trigger_comment_id,
      deployment_started_comment_id: completion.started_comment_id,
      initial_reaction_id: completion.reaction_id,
      timestamp: completion.deployment_start_time,
      actor: completion.actor,
      commit_verified: completion.commit_verified,
      params: completion.params === '' ? null : completion.params,
      parsed_params:
        completion.parsed_params === ''
          ? null
          : decodedJsonValue(completion.parsed_params)
    }
  }
}

let completion: CompletionContext
let request: ResultOperationRequest
let started: unknown
let deployment: unknown

beforeEach(testContext => {
  if (!('after' in testContext)) throw new Error('expected a test context')
  for (const mockFunction of [
    setOutputMock,
    setFailedMock,
    postDeployMock,
    getCommentMock,
    getDeploymentMock
  ]) {
    mockFunction.mock.resetCalls()
  }
  completion = createCompletionContext()
  const client = createOctokit()
  request = {
    trustedSha: completion.trusted_sha,
    context: createIssueCommentContext({
      actor: completion.actor,
      runId: completion.run_id,
      repo: {owner: 'octocat', repo: 'example'},
      issue: {number: completion.issue_number},
      payload: {
        issue: {number: completion.issue_number},
        comment: {
          id: completion.trigger_comment_id,
          html_url: `https://github.com/${completion.repository}/pull/${completion.issue_number}#issuecomment-${completion.trigger_comment_id}`
        }
      }
    }),
    octokit: {
      ...client,
      rest: {
        ...client.rest,
        issues: {...client.rest.issues, getComment: getCommentMock},
        repos: {...client.rest.repos, getDeployment: getDeploymentMock}
      }
    }
  }
  started = startedComment(completion)
  deployment = deploymentRecord(completion)
  getCommentMock.mock.mockImplementation(() => Promise.resolve({data: started}))
  getDeploymentMock.mock.mockImplementation(() =>
    Promise.resolve({data: deployment})
  )
  postDeployMock.mock.mockImplementation((_context, _octokit, data) =>
    Promise.resolve(data.noop === true ? 'success - noop' : 'success')
  )
  setFailedMock.mock.mockImplementation(() => undefined)
  stubEnv(testContext, 'GITHUB_RUN_ATTEMPT', '1')
  stubEnv(testContext, 'GITHUB_SERVER_URL', 'https://github.com')
  stubEnv(testContext, 'GITHUB_API_URL', 'https://api.github.com')
  stubEnv(testContext, 'INPUT_CONTEXT', JSON.stringify(completion))
  stubEnv(testContext, 'INPUT_JOB_RESULTS', '["success"]')
  stubEnv(testContext, 'INPUT_RESULT_URL', '')
  stubEnv(testContext, 'INPUT_RESULT_INHERIT_SETTINGS', 'true')
  stubEnv(testContext, 'INPUT_ENVIRONMENT_URL_IN_COMMENT', 'false')
  stubEnv(testContext, 'INPUT_ENVIRONMENT_URLS', '')
  stubEnv(testContext, 'INPUT_DEPLOY_MESSAGE_PATH', '')
  stubEnv(testContext, 'INPUT_SUCCESSFUL_DEPLOY_LABELS', '')
  stubEnv(testContext, 'INPUT_FAILED_DEPLOY_LABELS', '')
  stubEnv(testContext, 'INPUT_SUCCESSFUL_NOOP_LABELS', '')
  stubEnv(testContext, 'INPUT_FAILED_NOOP_LABELS', '')
  stubEnv(testContext, 'INPUT_SKIP_SUCCESSFUL_NOOP_LABELS_IF_APPROVED', 'false')
  stubEnv(
    testContext,
    'INPUT_SKIP_SUCCESSFUL_DEPLOY_LABELS_IF_APPROVED',
    'false'
  )
})

function setCompletion(value: CompletionContext): void {
  completion = value
  process.env['INPUT_CONTEXT'] = JSON.stringify(value)
}

async function rejected(reasonCode: string): Promise<void> {
  const result = await runResultOperation(request)
  assert.equal(result.reasonCode, reasonCode)
  assert.equal(result.decision, 'failure')
  assert.ok(result.error instanceof Error)
  assertNotCalled(postDeployMock)
  assertNotCalled(setOutputMock)
}

test('verifies a deferred deployment and completes it with inherited settings', async () => {
  const result = await runResultOperation(request)
  assert.deepEqual(result, {
    operation: 'result',
    runResult: 'success - result mode',
    decision: 'complete',
    reasonCode: 'result_completed',
    deploymentType: 'branch',
    deploymentId: completion.deployment_id,
    environment: completion.environment,
    ref: completion.ref,
    sha: completion.sha
  })
  assertCalledTimes(getCommentMock, 1)
  assertCalledTimes(getDeploymentMock, 1)
  assertCalledTimes(postDeployMock, 1)
  const call = postDeployMock.mock.calls[0]
  assert.ok(call)
  assert.deepEqual(call.arguments[3], {
    deployMessagePath: '.github/deployment_message.md',
    environmentUrlInComment: true,
    resultUrl: '',
    retainLock: false
  })
  assert.deepEqual(call.arguments[2].labels, {
    successful_deploy: ['deployed'],
    failed_deploy: ['deploy-failed'],
    successful_noop: ['noop-complete'],
    failed_noop: ['noop-failed'],
    skip_successful_noop_labels_if_approved: false,
    skip_successful_deploy_labels_if_approved: false
  })
  assert.equal(call.arguments[2].lock_ref_sha, completion.lock_ref_sha)
  assert.equal(call.arguments[2].environment_url, completion.environment_url)
  assert.deepEqual(setOutputMock.mock.calls[0]?.arguments, [
    'deployment_result',
    'success'
  ])
  assertNotCalled(setFailedMock)
})

test('supports SHA deployments without comparing the deployed SHA to the trusted workflow SHA', async () => {
  started = startedComment(completion, {
    ...predeployMetadata(completion),
    type: 'sha'
  })
  assert.equal((await runResultOperation(request)).deploymentType, 'sha')
})

test('supports noops without requesting a deployment record', async () => {
  setCompletion(
    createCompletionContext({
      noop: true,
      deployment_id: null,
      reaction_id: null,
      params: '',
      parsed_params: '',
      environment_url: null,
      disable_lock: true,
      lock_ref_sha: null
    })
  )
  started = startedComment(completion)
  const result = await runResultOperation(request)
  assert.equal(result.reasonCode, 'result_completed')
  assert.equal(result.deploymentType, 'noop')
  assertNotCalled(getDeploymentMock)
  assert.equal(postDeployMock.mock.calls[0]?.arguments[2].deployment_id, '')
  assert.equal(postDeployMock.mock.calls[0]?.arguments[2].reaction_id, '')
})

test('replaces all inherited settings only when inheritance is disabled', async () => {
  process.env['INPUT_RESULT_INHERIT_SETTINGS'] = 'false'
  process.env['INPUT_SUCCESSFUL_DEPLOY_LABELS'] = 'new-one, new-two'
  process.env['INPUT_SKIP_SUCCESSFUL_NOOP_LABELS_IF_APPROVED'] = 'TRUE'
  process.env['INPUT_SKIP_SUCCESSFUL_DEPLOY_LABELS_IF_APPROVED'] = 'True'
  process.env['INPUT_RESULT_URL'] = 'https://example.com/report?query=(result)'
  assert.equal(
    (await runResultOperation(request)).reasonCode,
    'result_completed'
  )
  const call = postDeployMock.mock.calls[0]
  assert.ok(call)
  assert.deepEqual(call.arguments[3], {
    deployMessagePath: '',
    environmentUrlInComment: false,
    resultUrl: 'https://example.com/report?query=(result)',
    retainLock: false
  })
  assert.deepEqual(call.arguments[2].labels, {
    successful_deploy: ['new-one', 'new-two'],
    failed_deploy: [],
    successful_noop: [],
    failed_noop: [],
    skip_successful_noop_labels_if_approved: true,
    skip_successful_deploy_labels_if_approved: true
  })
  assert.equal(
    call.arguments[2].environment_url,
    'https://example.com/report?query=(result)'
  )
})

test('replacing inherited settings clears an omitted environment URL', async () => {
  process.env['INPUT_RESULT_INHERIT_SETTINGS'] = 'false'
  assert.equal(
    (await runResultOperation(request)).reasonCode,
    'result_completed'
  )
  assert.equal(postDeployMock.mock.calls[0]?.arguments[2].environment_url, null)
})

test('replacing inherited settings resolves the original environment against the result input mapping', async () => {
  process.env['INPUT_RESULT_INHERIT_SETTINGS'] = 'false'
  process.env['INPUT_ENVIRONMENT_URLS'] =
    'staging|https://staging.example.com,production|https://production.example.com'
  assert.equal(
    (await runResultOperation(request)).reasonCode,
    'result_completed'
  )
  assert.equal(
    postDeployMock.mock.calls[0]?.arguments[2].environment_url,
    'https://production.example.com'
  )
})

test('does not resolve or publish a replacement environment URL before validating origin records', async () => {
  process.env['INPUT_RESULT_INHERIT_SETTINGS'] = 'false'
  process.env['INPUT_ENVIRONMENT_URLS'] =
    'production|https://production.example.com'
  started = {...startedComment(completion), id: 99}
  await rejected('invalid_result_context')
})

test('an explicit result URL overrides inherited environment URLs', async () => {
  process.env['INPUT_RESULT_URL'] = 'https://result.example.com'
  assert.equal(
    (await runResultOperation(request)).reasonCode,
    'result_completed'
  )
  assert.equal(
    postDeployMock.mock.calls[0]?.arguments[2].environment_url,
    'https://result.example.com'
  )
})

for (const result of ['failure', 'skipped', 'cancelled']) {
  test(`reports and cleans up before failing for ${result}`, async () => {
    process.env['INPUT_JOB_RESULTS'] = JSON.stringify(['success', result])
    const events: string[] = []
    postDeployMock.mock.mockImplementation(() => {
      events.push('complete')
      return Promise.resolve('success')
    })
    setFailedMock.mock.mockImplementation(() => {
      events.push('failed')
    })
    const outcome = await runResultOperation(request)
    assert.equal(outcome.reasonCode, 'result_non_success')
    assert.equal(outcome.runResult, 'failure')
    assert.deepEqual(events, ['complete', 'failed'])
    assert.equal(postDeployMock.mock.calls[0]?.arguments[2].status, result)
    assert.equal(
      postDeployMock.mock.calls[0]?.arguments[3]?.retainLock,
      result === 'cancelled'
    )
  })
}

for (const overrides of [
  {repository: 'other/example'},
  {run_id: 999},
  {run_attempt: 2},
  {issue_number: 8},
  {trigger_comment_id: 99},
  {actor: 'someone-else'},
  {trusted_sha: 'f'.repeat(40)}
] satisfies readonly Partial<CompletionContext>[]) {
  test(`rejects an invocation mismatch: ${Object.keys(overrides).join()}`, async () => {
    setCompletion(createCompletionContext(overrides))
    await rejected('invalid_result_context')
    assertNotCalled(getCommentMock)
  })
}

test('rejects a later attempt before reading or writing GitHub', async () => {
  process.env['GITHUB_RUN_ATTEMPT'] = '2'
  await rejected('invalid_result_context')
  assertNotCalled(getCommentMock)
})

for (const override of [
  {lock_ref_sha: '4'.repeat(40)},
  {disable_lock: true}
] satisfies readonly Partial<CompletionContext>[]) {
  test(`rejects changed context ${Object.keys(override).join()} against unchanged origin records`, async () => {
    setCompletion({...completion, ...override})
    await rejected('invalid_result_context')
    assertCalledTimes(getCommentMock, 1)
    assertCalledTimes(getDeploymentMock, 1)
  })
}

test('rejects a changed noop SHA against the unchanged started comment', async () => {
  const origin = createCompletionContext({noop: true, deployment_id: null})
  started = startedComment(origin)
  setCompletion({...origin, sha: '4'.repeat(40)})
  await rejected('invalid_result_context')
  assertCalledTimes(getCommentMock, 1)
  assertNotCalled(getDeploymentMock)
})

for (const payload of [
  {},
  {comment: null, issue: {number: 7, pull_request: {}}},
  {comment: [], issue: {number: 7, pull_request: {}}},
  {comment: {id: 20}, issue: {number: 7}},
  {comment: {id: 20}, issue: {number: 7, pull_request: null}},
  {comment: {id: 20}, issue: {number: 8, pull_request: {}}}
]) {
  test(`rejects an invalid event payload ${JSON.stringify(payload)}`, async () => {
    request = {...request, context: {...request.context, payload}}
    await rejected('invalid_result_context')
  })
}

test('rejects a non-comment event', async () => {
  request = {
    ...request,
    context: {...request.context, eventName: 'workflow_dispatch'}
  }
  await rejected('invalid_result_context')
})

for (const [name, value] of [
  ['INPUT_CONTEXT', '{invalid'],
  ['INPUT_JOB_RESULTS', '[]'],
  ['INPUT_RESULT_URL', 'https://user:password@example.com'],
  ['INPUT_RESULT_INHERIT_SETTINGS', 'invalid']
]) {
  test(`rejects invalid ${String(name)}`, async () => {
    assert.ok(name)
    assert.ok(value)
    process.env[name] = value
    await rejected(
      name === 'INPUT_CONTEXT'
        ? 'invalid_result_context'
        : 'invalid_result_inputs'
    )
    assertNotCalled(getCommentMock)
  })
}

for (const key of [
  'environment_url_in_comment',
  'skip_successful_noop_labels_if_approved',
  'skip_successful_deploy_labels_if_approved'
] as const) {
  test(`validates inherited boolean ${key} only in result mode`, async () => {
    setCompletion({
      ...completion,
      settings: {...completion.settings, [key]: 'invalid'}
    })
    await rejected('invalid_result_inputs')
    assertNotCalled(getCommentMock)
  })
}

for (const inherit of [true, false]) {
  for (const path of [
    '../message.md',
    '/message.md',
    '.github//message.md',
    '.github\\message.md'
  ]) {
    test(`rejects the ${inherit ? 'inherited' : 'replacement'} invalid template path ${path} before any GitHub calls`, async () => {
      if (inherit) {
        setCompletion({
          ...completion,
          settings: {...completion.settings, deploy_message_path: path}
        })
      } else {
        process.env['INPUT_RESULT_INHERIT_SETTINGS'] = 'false'
        process.env['INPUT_DEPLOY_MESSAGE_PATH'] = path
      }
      await rejected('invalid_result_inputs')
      assertNotCalled(getCommentMock)
      assertNotCalled(getDeploymentMock)
    })
  }

  for (const path of ['', ' ', 'null', 'undefined', 'false']) {
    test(`preserves the ${inherit ? 'inherited' : 'replacement'} template input ${JSON.stringify(path)}`, async () => {
      if (inherit) {
        setCompletion({
          ...completion,
          settings: {...completion.settings, deploy_message_path: path}
        })
      } else {
        process.env['INPUT_RESULT_INHERIT_SETTINGS'] = 'false'
        process.env['INPUT_DEPLOY_MESSAGE_PATH'] = path
      }
      assert.equal(
        (await runResultOperation(request)).reasonCode,
        'result_completed'
      )
      assert.equal(
        postDeployMock.mock.calls[0]?.arguments[3]?.deployMessagePath,
        inherit ? path : path.trim()
      )
    })
  }
}

test('ignores an invalid inherited template path when all completion settings are replaced', async () => {
  setCompletion({
    ...completion,
    settings: {...completion.settings, deploy_message_path: '../ignored.md'}
  })
  process.env['INPUT_RESULT_INHERIT_SETTINGS'] = 'false'
  assert.equal(
    (await runResultOperation(request)).reasonCode,
    'result_completed'
  )
})

for (const body of [
  null,
  '',
  '<!--- pre-deploy-metadata-end -->\n<!--- pre-deploy-metadata-start -->',
  '<!--- pre-deploy-metadata-start -->\n<!--- pre-deploy-metadata-start -->\n<!--- pre-deploy-metadata-end -->',
  '<!--- pre-deploy-metadata-start -->\n<!--- pre-deploy-metadata-end -->\n<!--- pre-deploy-metadata-end -->',
  '<!--- pre-deploy-metadata-start -->\nno fence\n<!--- pre-deploy-metadata-end -->',
  '<!--- pre-deploy-metadata-start -->\n```json\n{invalid\n```\n<!--- pre-deploy-metadata-end -->',
  '<!--- pre-deploy-metadata-start -->\n```json\n[]\n```\n<!--- pre-deploy-metadata-end -->'
]) {
  test(`rejects malformed started comment ${String(body).slice(0, 25)} ${String(body).length}`, async () => {
    started = {...startedComment(completion), body}
    await rejected('invalid_result_context')
  })
}

for (const override of [
  {
    completion: {
      ...completionMetadata(createCompletionContext()),
      run_attempt: 2
    }
  },
  {environment: {name: 'staging', url: 'https://example.com'}},
  {git: null},
  {context: []},
  {parameters: {raw: '--other', parsed: {_: []}}},
  {type: 'noop'}
]) {
  test(`rejects changed started metadata ${Object.keys(override).join()}`, async () => {
    started = startedComment(completion, {
      ...predeployMetadata(completion),
      ...override
    })
    await rejected('invalid_result_context')
  })
}

test('rejects a noop handoff whose comment describes a real deployment', async () => {
  setCompletion(createCompletionContext({noop: true, deployment_id: null}))
  started = startedComment(completion, {
    ...predeployMetadata(completion),
    type: 'branch'
  })
  await rejected('invalid_result_context')
})

for (const override of [
  {id: 99},
  {issue_url: 'https://api.github.com/repos/octocat/example/issues/99'}
]) {
  test(`rejects a different started comment ${Object.keys(override).join()}`, async () => {
    started = {...startedComment(completion), ...override}
    await rejected('invalid_result_context')
  })
}

for (const payload of [
  null,
  [],
  1,
  'invalid',
  JSON.stringify(JSON.stringify(JSON.stringify({})))
]) {
  test(`rejects malformed deployment payload ${JSON.stringify(payload)}`, async () => {
    deployment = {...deploymentRecord(completion), payload}
    await rejected('invalid_result_context')
  })
}

for (const override of [
  {id: 99},
  {sha: 'f'.repeat(40)},
  {environment: 'staging'},
  {ref: 'other-branch'}
]) {
  test(`rejects a different deployment ${Object.keys(override).join()}`, async () => {
    deployment = {...deploymentRecord(completion), ...override}
    await rejected('invalid_result_context')
  })
}

test('rejects deployment origin metadata from a different attempt', async () => {
  const value = deploymentRecord(completion)
  deployment = {
    ...value,
    payload: {
      ...value.payload,
      completion: {...value.payload.completion, run_attempt: 2}
    }
  }
  await rejected('invalid_result_context')
})

test('rejects deployment origin fields that disagree with the context', async () => {
  const value = deploymentRecord(completion)
  deployment = {...value, payload: {...value.payload, initial_comment_id: 99}}
  await rejected('invalid_result_context')
})

for (const layers of [1, 2]) {
  test(`accepts ${layers} JSON payload serialization layers`, async () => {
    const value = deploymentRecord(completion)
    const payload =
      layers === 1
        ? JSON.stringify(value.payload)
        : JSON.stringify(JSON.stringify(value.payload))
    deployment = {...value, payload}
    assert.equal(
      (await runResultOperation(request)).reasonCode,
      'result_completed'
    )
  })
}

test('compares parsed parameters without relying on JSON object key order', async () => {
  const value = deploymentRecord(completion)
  deployment = {
    ...value,
    payload: {...value.payload, parsed_params: {flag: true, _: []}}
  }
  started = startedComment(completion, {
    ...predeployMetadata(completion),
    parameters: {raw: '--flag', parsed: {flag: true, _: []}}
  })
  assert.equal(
    (await runResultOperation(request)).reasonCode,
    'result_completed'
  )
})

for (const params of ['', null]) {
  test(`accepts legacy empty deployment parameters ${String(params)}`, async () => {
    setCompletion({...completion, params: '', parsed_params: ''})
    started = startedComment(completion)
    const value = deploymentRecord(completion)
    deployment = {...value, payload: {...value.payload, params}}
    assert.equal(
      (await runResultOperation(request)).reasonCode,
      'result_completed'
    )
  })
}

test('supports comments containing marker text and longer JSON fences', async () => {
  setCompletion({
    ...completion,
    params: '``` <!--- pre-deploy-metadata-start -->'
  })
  started = startedComment(completion)
  deployment = deploymentRecord(completion)
  assert.equal(
    (await runResultOperation(request)).reasonCode,
    'result_completed'
  )
})

test('uses the default public API URL when it is not provided', async () => {
  delete process.env['GITHUB_API_URL']
  assert.equal(
    (await runResultOperation(request)).reasonCode,
    'result_completed'
  )
})

for (const target of ['comment', 'deployment']) {
  test(`distinguishes a ${target} API failure from invalid context without exposing error content`, async () => {
    const apiMock = target === 'comment' ? getCommentMock : getDeploymentMock
    apiMock.mock.mockImplementation(() =>
      Promise.reject(new Error('credential-value'))
    )
    const result = await runResultOperation(request)
    assert.equal(result.reasonCode, 'result_verification_failed')
    assert.ok(result.error instanceof Error)
    assert.equal(result.error.message.includes('credential-value'), false)
    assert.equal(result.environment, null)
    assertNotCalled(postDeployMock)
  })
}

for (const deploymentResult of ['success', 'failure']) {
  for (const outcome of ['throws', 'incomplete']) {
    test(`preserves ${deploymentResult} output and distinguishes completion failure when post processing ${outcome}`, async () => {
      process.env['INPUT_JOB_RESULTS'] = JSON.stringify([deploymentResult])
      postDeployMock.mock.mockImplementation(() =>
        outcome === 'throws'
          ? Promise.reject(new Error('private-report-content'))
          : Promise.resolve(undefined)
      )
      const result = await runResultOperation(request)
      assert.equal(result.reasonCode, 'result_completion_failed')
      assert.equal(result.environment, completion.environment)
      assert.ok(result.error instanceof Error)
      assert.equal(
        result.error.message.includes('private-report-content'),
        false
      )
      assert.deepEqual(
        setOutputMock.mock.calls.map(call => call.arguments),
        [['deployment_result', deploymentResult]]
      )
      assertNotCalled(setFailedMock)
    })
  }
}
