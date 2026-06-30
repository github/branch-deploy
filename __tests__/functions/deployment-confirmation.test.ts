import assert from 'node:assert/strict'
import {afterEach, beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {decodedJsonValue} from '../../src/trust-boundaries.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import {
  assertCalledTimes,
  assertCalledWith,
  createMock,
  stubEnv,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const warningMock = createMock<ActionsCore['warning']>()
const setFailedMock = createMock<ActionsCore['setFailed']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  info: infoMock,
  setFailed: setFailedMock,
  warning: warningMock
})

const {deploymentConfirmation} =
  await import('../../src/functions/deployment-confirmation.ts')

let context: Parameters<typeof deploymentConfirmation>[0]
let octokit: Parameters<typeof deploymentConfirmation>[1]
let data: Parameters<typeof deploymentConfirmation>[2]
const originalSetTimeout = globalThis.setTimeout
type ConfirmationOctokit = Parameters<typeof deploymentConfirmation>[1]
const createCommentMock =
  createMock<ConfirmationOctokit['rest']['issues']['createComment']>()
const updateCommentMock =
  createMock<ConfirmationOctokit['rest']['issues']['updateComment']>()
const listReactionsMock =
  createMock<ConfirmationOctokit['rest']['reactions']['listForIssueComment']>()
let advanceClock: ((delay: number) => void) | undefined
let timeoutDelays: number[]

function immediateTimeout<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay = 0,
  ...args: TArgs
): NodeJS.Timeout {
  timeoutDelays.push(delay)
  advanceClock?.(delay)
  callback(...args)
  return originalSetTimeout(() => undefined, 0)
}

function latestCreateCommentRequest(): NonNullable<
  Parameters<typeof createCommentMock>[0]
> {
  const request = createCommentMock.mock.calls.at(-1)?.arguments[0]
  if (!request) throw new Error('expected createComment to be called')
  return request
}

function latestUpdateCommentRequest(): NonNullable<
  Parameters<typeof updateCommentMock>[0]
> {
  const request = updateCommentMock.mock.calls.at(-1)?.arguments[0]
  if (!request) throw new Error('expected updateComment to be called')
  return request
}

beforeEach(testContext => {
  if (!('after' in testContext)) {
    throw new Error('expected a test context')
  }

  debugMock.mock.resetCalls()
  infoMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  setFailedMock.mock.resetCalls()
  createCommentMock.mock.resetCalls()
  updateCommentMock.mock.resetCalls()
  listReactionsMock.mock.resetCalls()
  advanceClock = undefined
  timeoutDelays = []

  // Mock setTimeout to execute immediately
  mock.method(globalThis, 'setTimeout', immediateTimeout)

  stubEnv(testContext, 'GITHUB_SERVER_URL', 'https://github.com')
  stubEnv(testContext, 'GITHUB_RUN_ID', '12345')

  context = createIssueCommentContext({
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    },
    payload: {
      comment: {
        body: '.deploy',
        id: 123,
        user: {
          login: 'monalisa'
        },
        created_at: '2024-10-21T19:11:18Z',
        updated_at: '2024-10-21T19:11:18Z',
        html_url:
          'https://github.com/corp/test/pull/123#issuecomment-1231231231'
      }
    }
  })

  createCommentMock.mock.mockImplementation(() =>
    Promise.resolve({data: {id: 124}})
  )
  updateCommentMock.mock.mockImplementation(() => Promise.resolve({data: {}}))
  listReactionsMock.mock.mockImplementation(() => Promise.resolve({data: []}))
  octokit = {
    rest: {
      reactions: {
        listForIssueComment: listReactionsMock
      },
      issues: {
        createComment: createCommentMock,
        updateComment: updateCommentMock
      }
    }
  }

  data = {
    deployment_confirmation_timeout: 60,
    deploymentType: 'branch',
    environment: 'production',
    environmentUrl: 'https://example.com',
    github_run_id: 12345,
    log_url: 'https://github.com/corp/test/actions/runs/12345',
    ref: 'cool-branch',
    sha: 'abc123',
    committer: 'monalisa',
    commit_html_url: 'https://github.com/corp/test/commit/abc123',
    isVerified: true,
    noopMode: false,
    isFork: false,
    body: '.deploy',
    params: 'param1=1,param2=2',
    parsed_params: {
      _: [],
      param1: '1',
      param2: '2'
    }
  }
})

afterEach(() => {
  mock.restoreAll()
})

test('successfully prompts for deployment confirmation and gets confirmed by the original actor', async () => {
  // Mock that the user adds a +1 reaction
  listReactionsMock.mock.mockImplementationOnce(() =>
    Promise.resolve({
      data: [
        {
          user: {login: 'monalisa'},
          content: '+1'
        }
      ]
    })
  )

  const result = await deploymentConfirmation(context, octokit, data)

  assert.strictEqual(result, 'confirmed')
  const createRequest = latestCreateCommentRequest()
  assert.ok(createRequest.body.includes('Deployment Confirmation Required'))
  assert.deepStrictEqual(createRequest, {
    body: createRequest.body,
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(debugMock, 'deployment confirmation comment id: 124')
  assertCalledWith(
    infoMock,
    `⏰ waiting ${COLORS.highlight}60${COLORS.reset} seconds for deployment confirmation`
  )
  assertCalledWith(
    infoMock,
    `✅ deployment confirmed by ${COLORS.highlight}monalisa${COLORS.reset} - sha: ${COLORS.highlight}abc123${COLORS.reset}`
  )

  assertCalledWith(listReactionsMock, {
    comment_id: 124,
    owner: 'corp',
    page: 1,
    per_page: 100,
    repo: 'test',
    headers: API_HEADERS
  })

  const updateRequest = latestUpdateCommentRequest()
  assert.ok(
    updateRequest.body.includes('✅ Deployment confirmed by __monalisa__')
  )
  assert.deepStrictEqual(updateRequest, {
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('successfully prompts for deployment confirmation and gets confirmed by the original actor with some null data params in the issue comment', async () => {
  data = {
    ...data,
    params: null,
    parsed_params: null,
    environmentUrl: null,
    isVerified: false
  }

  // Mock that the user adds a +1 reaction
  listReactionsMock.mock.mockImplementationOnce(() =>
    Promise.resolve({
      data: [
        {
          user: {login: 'monalisa'},
          content: '+1'
        }
      ]
    })
  )

  const result = await deploymentConfirmation(context, octokit, data)

  assert.strictEqual(result, 'confirmed')
  const createRequest = latestCreateCommentRequest()
  assert.ok(createRequest.body.includes('"url": null'))
  assert.deepStrictEqual(createRequest, {
    body: createRequest.body,
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(debugMock, 'deployment confirmation comment id: 124')
  assertCalledWith(
    infoMock,
    `⏰ waiting ${COLORS.highlight}60${COLORS.reset} seconds for deployment confirmation`
  )
  assertCalledWith(
    infoMock,
    `✅ deployment confirmed by ${COLORS.highlight}monalisa${COLORS.reset} - sha: ${COLORS.highlight}abc123${COLORS.reset}`
  )

  assertCalledWith(listReactionsMock, {
    comment_id: 124,
    owner: 'corp',
    page: 1,
    per_page: 100,
    repo: 'test',
    headers: API_HEADERS
  })

  const updateRequest = latestUpdateCommentRequest()
  assert.ok(
    updateRequest.body.includes('✅ Deployment confirmed by __monalisa__')
  )
  assert.deepStrictEqual(updateRequest, {
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('user rejects the deployment with thumbs down', async () => {
  // Mock that the user adds a -1 reaction
  listReactionsMock.mock.mockImplementationOnce(() =>
    Promise.resolve({
      data: [
        {
          user: {login: 'monalisa'},
          content: '-1'
        }
      ]
    })
  )

  const result = await deploymentConfirmation(context, octokit, data)

  assert.strictEqual(result, 'rejected')
  assert.ok(createCommentMock.mock.callCount() > 0)
  assert.ok(listReactionsMock.mock.callCount() > 0)

  const updateRequest = latestUpdateCommentRequest()
  assert.ok(
    updateRequest.body.includes('❌ Deployment rejected by __monalisa__')
  )
  assert.deepStrictEqual(updateRequest, {
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })

  assertCalledWith(
    setFailedMock,
    `❌ deployment rejected by ${COLORS.highlight}monalisa${COLORS.reset}`
  )
})

test('deployment confirmation times out after no response', async testContext => {
  testContext.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2024-10-21T19:11:18Z')
  })
  advanceClock = () =>
    testContext.mock.timers.setTime(new Date('2024-10-21T19:12:30Z').getTime())

  const result = await deploymentConfirmation(context, octokit, data)

  assert.strictEqual(result, 'timed_out')
  assert.ok(createCommentMock.mock.callCount() > 0)

  const updateRequest = latestUpdateCommentRequest()
  assert.ok(updateRequest.body.includes('⏱️ Deployment confirmation timed out'))
  assert.deepStrictEqual(updateRequest, {
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })

  assertCalledWith(
    setFailedMock,
    `⏱️ deployment confirmation timed out after ${COLORS.highlight}60${COLORS.reset} seconds`
  )
})

test('ignores reactions from other users', async () => {
  // First call returns reactions from other users
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: [{user: {login: 'other-user'}, content: '+1'}]
      }),
    0
  )

  // Second call includes the original actor's reaction
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: [
          {user: {login: 'other-user'}, content: '+1'},
          {user: {login: 'monalisa'}, content: '+1'}
        ]
      }),
    1
  )

  const result = await deploymentConfirmation(context, octokit, data)

  assert.strictEqual(result, 'confirmed')
  assertCalledTimes(listReactionsMock, 2)
  const updateRequest = latestUpdateCommentRequest()
  assert.ok(
    updateRequest.body.includes('✅ Deployment confirmed by __monalisa__')
  )
  assert.deepStrictEqual(updateRequest, {
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(
    debugMock,
    'ignoring reaction from other-user, expected monalisa'
  )
  assertCalledWith(
    infoMock,
    `✅ deployment confirmed by ${COLORS.highlight}monalisa${COLORS.reset} - sha: ${COLORS.highlight}abc123${COLORS.reset}`
  )
})

test('ignores non thumbsUp/thumbsDown reactions from the original actor', async () => {
  // Mock reactions list with various reaction types from original actor
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: [
          {user: {login: 'monalisa'}, content: 'confused'},
          {user: {login: 'monalisa'}, content: 'eyes'},
          {user: {login: 'monalisa'}, content: 'rocket'}
        ]
      }),
    0
  )

  // Add a thumbs up in the second poll
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: [
          {user: {login: 'monalisa'}, content: 'confused'},
          {user: {login: 'monalisa'}, content: 'eyes'},
          {user: {login: 'monalisa'}, content: 'rocket'},
          {user: {login: 'monalisa'}, content: '+1'}
        ]
      }),
    1
  )

  const result = await deploymentConfirmation(context, octokit, data)

  assert.strictEqual(result, 'confirmed')
  assertCalledTimes(listReactionsMock, 2)

  // Verify that debug was called for each ignored reaction type
  assertCalledWith(debugMock, 'ignoring reaction: confused')
  assertCalledWith(debugMock, 'ignoring reaction: eyes')
  assertCalledWith(debugMock, 'ignoring reaction: rocket')

  // Verify final confirmation happened
  const updateRequest = latestUpdateCommentRequest()
  assert.ok(
    updateRequest.body.includes('✅ Deployment confirmed by __monalisa__')
  )
  assert.deepStrictEqual(updateRequest, {
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('handles API errors gracefully', async () => {
  // First call throws error
  listReactionsMock.mock.mockImplementationOnce(
    () => Promise.reject(new Error('API error')),
    0
  )

  // Second call succeeds with valid reaction
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: [{user: {login: 'monalisa'}, content: '+1'}]
      }),
    1
  )

  const result = await deploymentConfirmation(context, octokit, data)

  assert.strictEqual(result, 'confirmed')
  assertCalledWith(
    warningMock,
    'temporary failure when checking for reactions on the deployment confirmation comment: API error'
  )
  assertCalledTimes(listReactionsMock, 2)
  assertCalledWith(
    infoMock,
    `✅ deployment confirmed by ${COLORS.highlight}monalisa${COLORS.reset} - sha: ${COLORS.highlight}abc123${COLORS.reset}`
  )
})

for (const status of [408, 409, 429, 500, 599]) {
  test(`retries a temporary HTTP ${status} confirmation failure`, async () => {
    listReactionsMock.mock.mockImplementationOnce(
      () =>
        Promise.reject(Object.assign(new Error('temporary error'), {status})),
      0
    )
    listReactionsMock.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          data: [{user: {login: 'monalisa'}, content: '+1'}]
        }),
      1
    )

    assert.strictEqual(
      await deploymentConfirmation(context, octokit, data),
      'confirmed'
    )
    assertCalledTimes(listReactionsMock, 2)
  })
}

test('fails immediately on a permanent 4xx confirmation response', async () => {
  listReactionsMock.mock.mockImplementation(() =>
    Promise.reject(Object.assign(new Error('not allowed'), {status: 403}))
  )

  await assert.rejects(deploymentConfirmation(context, octokit, data), {
    message: 'not allowed'
  })
  assertCalledTimes(listReactionsMock, 1)
})

test('fails immediately on an unsupported HTTP status', async () => {
  listReactionsMock.mock.mockImplementation(() =>
    Promise.reject(
      Object.assign(new Error('unexpected response'), {status: 600})
    )
  )

  await assert.rejects(deploymentConfirmation(context, octokit, data), {
    message: 'unexpected response'
  })
})

test('reads confirmation reactions across pages in API order', async () => {
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: Array.from({length: 100}, () => ({
          user: {login: 'other-user'},
          content: '+1'
        }))
      }),
    0
  )
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: [{user: {login: 'monalisa'}, content: '+1'}]
      }),
    1
  )

  assert.strictEqual(
    await deploymentConfirmation(context, octokit, data),
    'confirmed'
  )
  assertCalledWith(listReactionsMock, {
    comment_id: 124,
    owner: 'corp',
    page: 2,
    per_page: 100,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('backs off confirmation polling at 2, 4, 8, and at most 10 seconds', async () => {
  for (let index = 0; index < 4; index += 1) {
    listReactionsMock.mock.mockImplementationOnce(
      () => Promise.resolve({data: []}),
      index
    )
  }
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: [{user: {login: 'monalisa'}, content: '+1'}]
      }),
    4
  )

  assert.strictEqual(
    await deploymentConfirmation(context, octokit, data),
    'confirmed'
  )
  assert.deepStrictEqual(timeoutDelays, [2000, 4000, 8000, 10_000])
})

test('limits the final polling delay to the remaining deadline', async testContext => {
  const initialTime = new Date('2024-10-21T19:11:18Z').getTime()
  let currentTime = initialTime
  testContext.mock.timers.enable({apis: ['Date'], now: initialTime})
  advanceClock = delay => {
    currentTime += delay
    testContext.mock.timers.setTime(currentTime)
  }
  data = {...data, deployment_confirmation_timeout: 5}

  assert.strictEqual(
    await deploymentConfirmation(context, octokit, data),
    'timed_out'
  )
  assert.deepStrictEqual(timeoutDelays, [2000, 3000])
})

test('stops without sleeping when a reaction request reaches the deadline', async testContext => {
  const initialTime = new Date('2024-10-21T19:11:18Z').getTime()
  testContext.mock.timers.enable({apis: ['Date'], now: initialTime})
  listReactionsMock.mock.mockImplementation(() => {
    testContext.mock.timers.setTime(initialTime + 60_000)
    return Promise.resolve({data: []})
  })

  assert.strictEqual(
    await deploymentConfirmation(context, octokit, data),
    'timed_out'
  )
  assert.deepStrictEqual(timeoutDelays, [])
})

test('renders arbitrary confirmation metadata as valid fenced JSON', async () => {
  const body = 'quote " slash \\ newline\nUnicode 🚀 and ````` backticks'
  data = {
    ...data,
    body,
    environment: 'prod"\\\n🚀`````',
    params: body
  }
  listReactionsMock.mock.mockImplementation(() =>
    Promise.resolve({data: [{user: {login: 'monalisa'}, content: '+1'}]})
  )

  await deploymentConfirmation(context, octokit, data)
  const rendered = String(latestCreateCommentRequest().body)
  const match = rendered.match(
    /<!--- deployment-confirmation-metadata-start -->\n\n(`{3,})json\n([\s\S]*?)\n\1\n\n<!--- deployment-confirmation-metadata-end -->/u
  )
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error('expected confirmation metadata block')
  }
  assert.ok(match[1].length > 5)
  const metadata = decodedJsonValue(match[2])
  assert.deepStrictEqual(metadata, {
    type: 'branch',
    environment: {name: data.environment, url: 'https://example.com'},
    deployment: {logs: data.log_url},
    git: {
      branch: 'cool-branch',
      commit: 'abc123',
      verified: true,
      committer: 'monalisa',
      html_url: 'https://github.com/corp/test/commit/abc123'
    },
    context: {
      actor: 'monalisa',
      noop: false,
      fork: false,
      comment: {
        created_at: '2024-10-21T19:11:18Z',
        updated_at: '2024-10-21T19:11:18Z',
        body,
        html_url:
          'https://github.com/corp/test/pull/123#issuecomment-1231231231'
      }
    },
    parameters: {raw: body, parsed: data.parsed_params}
  })
})

test('ignores a reaction whose user is null', async () => {
  listReactionsMock.mock.mockImplementationOnce(
    () => Promise.resolve({data: [{user: null, content: '+1'}]}),
    0
  )
  listReactionsMock.mock.mockImplementationOnce(
    () =>
      Promise.resolve({
        data: [{user: {login: 'monalisa'}, content: '+1'}]
      }),
    1
  )

  assert.strictEqual(
    await deploymentConfirmation(context, octokit, data),
    'confirmed'
  )
  assertCalledWith(debugMock, 'ignoring reaction from an unknown user')
  assertCalledTimes(listReactionsMock, 2)
})
