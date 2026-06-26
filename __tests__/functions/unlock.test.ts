import {beforeEach, expect, test, vi, type Mock} from 'vitest'
import {
  unlock,
  type InteractiveUnlockRequest,
  type SilentUnlockRequest,
  type UnlockOctokit
} from '../../src/functions/unlock.ts'
import * as actionStatus from '../../src/functions/action-status.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import type {IssueCommentContext} from '../../src/types.ts'

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
      issues: {createComment: vi.fn()},
      reactions: {
        createForIssueComment: vi.fn(),
        deleteForIssueComment: vi.fn()
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

beforeEach(() => {
  vi.clearAllMocks()

  vi.stubEnv('INPUT_ENVIRONMENT', 'production')
  vi.stubEnv('INPUT_UNLOCK_TRIGGER', '.unlock')
  vi.stubEnv('INPUT_GLOBAL_LOCK_FLAG', '--global')

  context = contextFor('.unlock')
  deleteRefMock = vi
    .fn<UnlockOctokit['rest']['git']['deleteRef']>()
    .mockResolvedValue(deletedResponse)
  octokit = createUnlockOctokit(deleteRefMock)
  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)
})

test('successfully releases a deployment lock with the unlock function', async () => {
  expect(await unlock(interactiveRequest())).toBe(true)
  expect(deleteRefMock).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock with a passed environment', async () => {
  expect(
    await unlock(
      interactiveRequest({
        target: {environment: 'staging', type: 'environment'}
      })
    )
  ).toBe(true)
  expect(deleteRefMock).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/staging-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a global deployment lock', async () => {
  context = contextFor('.unlock --global')
  expect(await unlock(interactiveRequest())).toBe(true)
  expect(deleteRefMock).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/global-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a development environment deployment lock', async () => {
  context = contextFor('.unlock development')
  expect(await unlock(interactiveRequest())).toBe(true)
  expect(deleteRefMock).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/development-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('ignores an unnecessary --reason flag while releasing an environment lock', async () => {
  context = contextFor('.unlock development --reason because i said so')
  expect(await unlock(interactiveRequest())).toBe(true)
  expect(deleteRefMock).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/development-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock in silent mode', async () => {
  expect(await unlock(silentRequest())).toBe('removed lock - silent')
  expect(deleteRefMock).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('reports a bad GitHub API status in silent mode', async () => {
  deleteRefMock.mockResolvedValue({...deletedResponse, status: 500})

  expect(await unlock(silentRequest())).toBe(
    'failed to delete lock (bad status code) - silent'
  )
})

test('throws an unhandled exception in silent mode', async () => {
  deleteRefMock.mockRejectedValue(new Error('oh no'))

  await expect(unlock(silentRequest())).rejects.toThrow('Error: oh no')
})

test('reports a missing deployment lock branch in silent mode', async () => {
  deleteRefMock.mockRejectedValue(
    new NotFoundError(
      'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
    )
  )

  expect(await unlock(silentRequest())).toBe(
    'no deployment lock currently set - silent'
  )
})

test('returns false for a bad GitHub API status in interactive mode', async () => {
  deleteRefMock.mockResolvedValue({...deletedResponse, status: 500})

  expect(await unlock(interactiveRequest())).toBe(false)
})

test('reports a missing deployment lock branch in interactive mode', async () => {
  const actionStatusSpy = vi.mocked(actionStatus.actionStatus)
  deleteRefMock.mockRejectedValue(
    new NotFoundError(
      'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
    )
  )

  expect(await unlock(interactiveRequest())).toBe(true)
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    message: '🔓 There is currently no `production` deployment lock set',
    octokit,
    reactionId: 123,
    result: 'alternate-success'
  })
})

test('reports a missing global deployment lock branch', async () => {
  const actionStatusSpy = vi.mocked(actionStatus.actionStatus)
  context = contextFor('.unlock --global')
  deleteRefMock.mockRejectedValue(
    new NotFoundError(
      'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
    )
  )

  expect(await unlock(interactiveRequest())).toBe(true)
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    message: '🔓 There is currently no `global` deployment lock set',
    octokit,
    reactionId: 123,
    result: 'alternate-success'
  })
})

test('throws an unhandled exception in interactive mode', async () => {
  deleteRefMock.mockRejectedValue(new Error('oh no'))

  await expect(unlock(interactiveRequest())).rejects.toThrow('Error: oh no')
})
