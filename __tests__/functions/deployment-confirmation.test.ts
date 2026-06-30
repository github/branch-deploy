import assert from 'node:assert/strict'
import {afterEach, beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
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
let advanceClock: (() => void) | undefined

function immediateTimeout<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  _delay?: number,
  ...args: TArgs
): NodeJS.Timeout {
  advanceClock?.()
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

  assert.strictEqual(result, true)
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

  assert.strictEqual(result, true)
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

  assert.strictEqual(result, false)
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

  assert.strictEqual(result, false)
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

  assert.strictEqual(result, true)
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

  assert.strictEqual(result, true)
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

  assert.strictEqual(result, true)
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

test('preserves the temporary failure path for a null reaction user', async () => {
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

  assert.strictEqual(await deploymentConfirmation(context, octokit, data), true)
  assertCalledWith(
    warningMock,
    "temporary failure when checking for reactions on the deployment confirmation comment: Cannot read properties of null (reading 'login')"
  )
  assertCalledTimes(listReactionsMock, 2)
})
