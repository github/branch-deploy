import assert from 'node:assert/strict'
import {beforeEach, mock, test, type Mock} from 'node:test'
import type {
  InteractiveUnlockRequest,
  SilentUnlockRequest,
  UnlockOctokit
} from '../../src/functions/unlock.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import type {IssueCommentContext} from '../../src/types.ts'
import {
  assertCalledWith,
  createMock,
  stubEnv,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type ActionStatus = typeof import('../../src/functions/action-status.ts')

function readInput(name: string, trimWhitespace = true): string {
  const value =
    process.env[`INPUT_${name.replace(/ /gu, '_').toUpperCase()}`] ?? ''
  return trimWhitespace ? value.trim() : value
}

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const warningMock = createMock<ActionsCore['warning']>()
const setOutputMock = createMock<ActionsCore['setOutput']>()
const getInputMock = createMock<ActionsCore['getInput']>((name, options) =>
  readInput(name, options?.trimWhitespace !== false)
)
const actionStatusMock = createMock<ActionStatus['actionStatus']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  getInput: getInputMock,
  info: infoMock,
  setOutput: setOutputMock,
  warning: warningMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/action-status.ts', import.meta.url),
  {actionStatus: actionStatusMock}
)

const {unlock} = await import('../../src/functions/unlock.ts')

class NotFoundError extends Error {
  declare status: number

  constructor(message: string) {
    super(message)
    this.status = 422
  }
}

type DeleteRefResponse = Awaited<
  ReturnType<UnlockOctokit['rest']['git']['deleteRef']>
>

const deletedResponse = {
  status: 204
} satisfies DeleteRefResponse

let context: IssueCommentContext
let octokit: UnlockOctokit
let deleteRefMock: Mock<UnlockOctokit['rest']['git']['deleteRef']>

function createUnlockOctokit(
  deleteRef: UnlockOctokit['rest']['git']['deleteRef']
): UnlockOctokit {
  return {
    rest: {
      git: {deleteRef},
      issues: {createComment: createMock()},
      reactions: {
        createForIssueComment: createMock(),
        deleteForIssueComment: createMock()
      }
    }
  } satisfies UnlockOctokit
}

function contextFor(body: string): IssueCommentContext {
  return createIssueCommentContext({
    actor: 'monalisa',
    issue: {number: 1},
    payload: {comment: {body, id: 1}},
    repo: {owner: 'corp', repo: 'test'}
  })
}

function interactiveRequest(
  overrides: Partial<Omit<InteractiveUnlockRequest, 'mode'>> = {}
): InteractiveUnlockRequest {
  return {
    context,
    mode: 'interactive',
    octokit,
    reactionId: 123,
    target: {type: 'context'},
    ...overrides
  }
}

function silentRequest(
  environment = 'production',
  overrides: Partial<Omit<SilentUnlockRequest, 'mode' | 'target'>> = {}
): SilentUnlockRequest {
  return {
    context,
    mode: 'silent',
    octokit,
    reactionId: 123,
    target: {environment, type: 'environment'},
    ...overrides
  }
}

beforeEach(testContext => {
  if (!('after' in testContext)) {
    throw new Error('expected a test context')
  }

  debugMock.mock.resetCalls()
  infoMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  setOutputMock.mock.resetCalls()
  getInputMock.mock.resetCalls()
  actionStatusMock.mock.resetCalls()
  actionStatusMock.mock.mockImplementation(() => Promise.resolve(undefined))

  stubEnv(testContext, 'INPUT_ENVIRONMENT', 'production')
  stubEnv(testContext, 'INPUT_UNLOCK_TRIGGER', '.unlock')
  stubEnv(testContext, 'INPUT_GLOBAL_LOCK_FLAG', '--global')

  context = contextFor('.unlock')
  deleteRefMock = createMock<UnlockOctokit['rest']['git']['deleteRef']>(() =>
    Promise.resolve(deletedResponse)
  )
  octokit = createUnlockOctokit(deleteRefMock)
})

test('successfully releases a deployment lock with the unlock function', async () => {
  assert.strictEqual(await unlock(interactiveRequest()), true)
  assertCalledWith(deleteRefMock, {
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock with a passed environment', async () => {
  assert.strictEqual(
    await unlock(
      interactiveRequest({
        target: {environment: 'staging', type: 'environment'}
      })
    ),
    true
  )
  assertCalledWith(deleteRefMock, {
    owner: 'corp',
    repo: 'test',
    ref: 'heads/staging-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a global deployment lock', async () => {
  context = contextFor('.unlock --global')
  assert.strictEqual(await unlock(interactiveRequest()), true)
  assertCalledWith(deleteRefMock, {
    owner: 'corp',
    repo: 'test',
    ref: 'heads/global-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a development environment deployment lock', async () => {
  context = contextFor('.unlock development')
  assert.strictEqual(await unlock(interactiveRequest()), true)
  assertCalledWith(deleteRefMock, {
    owner: 'corp',
    repo: 'test',
    ref: 'heads/development-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('ignores an unnecessary --reason flag while releasing an environment lock', async () => {
  context = contextFor('.unlock development --reason because i said so')
  assert.strictEqual(await unlock(interactiveRequest()), true)
  assertCalledWith(deleteRefMock, {
    owner: 'corp',
    repo: 'test',
    ref: 'heads/development-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock in silent mode', async () => {
  assert.strictEqual(await unlock(silentRequest()), 'removed lock - silent')
  assertCalledWith(deleteRefMock, {
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('reports a bad GitHub API status in silent mode', async () => {
  deleteRefMock.mock.mockImplementation(() =>
    Promise.resolve({...deletedResponse, status: 500})
  )

  assert.strictEqual(
    await unlock(silentRequest()),
    'failed to delete lock (bad status code) - silent'
  )
})

test('throws an unhandled exception in silent mode', async () => {
  deleteRefMock.mock.mockImplementation(() =>
    Promise.reject(new Error('oh no'))
  )

  await assert.rejects(unlock(silentRequest()), {message: 'Error: oh no'})
})

test('reports a missing deployment lock branch in silent mode', async () => {
  deleteRefMock.mock.mockImplementation(() =>
    Promise.reject(
      new NotFoundError(
        'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
      )
    )
  )

  assert.strictEqual(
    await unlock(silentRequest()),
    'no deployment lock currently set - silent'
  )
})

test('returns false for a bad GitHub API status in interactive mode', async () => {
  deleteRefMock.mock.mockImplementation(() =>
    Promise.resolve({...deletedResponse, status: 500})
  )

  assert.strictEqual(await unlock(interactiveRequest()), false)
})

test('reports a missing deployment lock branch in interactive mode', async () => {
  deleteRefMock.mock.mockImplementation(() =>
    Promise.reject(
      new NotFoundError(
        'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
      )
    )
  )

  assert.strictEqual(await unlock(interactiveRequest()), true)
  assertCalledWith(actionStatusMock, {
    context,
    message: '🔓 There is currently no `production` deployment lock set',
    octokit,
    reactionId: 123,
    result: 'alternate-success'
  })
})

test('reports a missing global deployment lock branch', async () => {
  context = contextFor('.unlock --global')
  deleteRefMock.mock.mockImplementation(() =>
    Promise.reject(
      new NotFoundError(
        'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
      )
    )
  )

  assert.strictEqual(await unlock(interactiveRequest()), true)
  assertCalledWith(actionStatusMock, {
    context,
    message: '🔓 There is currently no `global` deployment lock set',
    octokit,
    reactionId: 123,
    result: 'alternate-success'
  })
})

test('throws an unhandled exception in interactive mode', async () => {
  deleteRefMock.mock.mockImplementation(() =>
    Promise.reject(new Error('oh no'))
  )

  await assert.rejects(unlock(interactiveRequest()), {message: 'Error: oh no'})
})
