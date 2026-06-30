import {beforeEach, mock, test, type Mock} from 'node:test'
import type {
  ActionStatusOctokit,
  ActionStatusRequest
} from '../../src/functions/action-status.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import {
  assertNotCalled,
  assertCalledWith,
  createMock,
  stubEnv,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const debugMock = createMock<ActionsCore['debug']>()
const warningMock = createMock<ActionsCore['warning']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  warning: warningMock
})

const {actionStatus} = await import('../../src/functions/action-status.ts')
const {truncateCommentBody} =
  await import('../../src/functions/truncate-comment-body.ts')

let context: ActionStatusRequest['context']
let octokit: ActionStatusRequest['octokit']
let createForIssueCommentMock: Mock<
  ActionStatusOctokit['rest']['reactions']['createForIssueComment']
>
let deleteForIssueCommentMock: Mock<
  ActionStatusOctokit['rest']['reactions']['deleteForIssueComment']
>
let createCommentMock: Mock<
  ActionStatusOctokit['rest']['issues']['createComment']
>

beforeEach(testContext => {
  if (!('after' in testContext)) {
    throw new TypeError('expected a test context')
  }
  debugMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  createForIssueCommentMock = createMock()
  deleteForIssueCommentMock = createMock()
  createCommentMock = createMock()

  stubEnv(testContext, 'GITHUB_SERVER_URL', 'https://github.com')
  stubEnv(testContext, 'GITHUB_RUN_ID', '12345')

  context = createIssueCommentContext({
    repo: {owner: 'corp', repo: 'test'},
    issue: {number: 1},
    payload: {comment: {id: 1}}
  })

  octokit = {
    rest: {
      reactions: {
        createForIssueComment: createForIssueCommentMock,
        deleteForIssueComment: deleteForIssueCommentMock
      },
      issues: {
        createComment: createCommentMock
      }
    }
  } satisfies ActionStatusOctokit
})

test('adds a successful status message for a deployment', async () => {
  await actionStatus({
    context,
    octokit,
    reactionId: 123,
    message: 'Everything worked!',
    result: 'success'
  })
  assertCalledWith(createCommentMock, {
    body: 'Everything worked!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(createForIssueCommentMock, {
    comment_id: 1,
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(deleteForIssueCommentMock, {
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('adds a successful status message for a deployment (with alt message)', async () => {
  await actionStatus({
    context,
    octokit,
    reactionId: 123,
    message: 'Everything worked!',
    result: 'alternate-success'
  })
  assertCalledWith(createCommentMock, {
    body: 'Everything worked!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(createForIssueCommentMock, {
    comment_id: 1,
    content: '+1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(deleteForIssueCommentMock, {
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('adds a failure status message for a deployment', async () => {
  await actionStatus({
    context,
    octokit,
    reactionId: 123,
    message: 'Everything failed!',
    result: 'failure'
  })
  assertCalledWith(createCommentMock, {
    body: 'Everything failed!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(createForIssueCommentMock, {
    comment_id: 1,
    content: '-1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(deleteForIssueCommentMock, {
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('uses default log url when the "message" variable is empty for failures', async () => {
  await actionStatus({context, octokit, reactionId: 123, message: ''})
  assertCalledWith(createCommentMock, {
    body: 'Unknown error, [check logs](https://github.com/corp/test/actions/runs/12345) for more details.',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(createForIssueCommentMock, {
    comment_id: 1,
    content: '-1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(deleteForIssueCommentMock, {
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('uses default log url when the "message" variable is empty for a success', async () => {
  await actionStatus({
    context,
    octokit,
    reactionId: 123,
    message: '',
    result: 'success'
  })
  assertCalledWith(createCommentMock, {
    body: 'Unknown error, [check logs](https://github.com/corp/test/actions/runs/12345) for more details.',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(createForIssueCommentMock, {
    comment_id: 1,
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(deleteForIssueCommentMock, {
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('truncates the message when it is too large for an issue comment', async () => {
  const message = 'a'.repeat(65538)
  await actionStatus({
    context,
    octokit,
    reactionId: 123,
    message,
    result: 'success'
  })
  assertCalledWith(createCommentMock, {
    body: truncateCommentBody(message),
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(createForIssueCommentMock, {
    comment_id: 1,
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(deleteForIssueCommentMock, {
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('skips decorative reaction changes when no initial reaction exists', async () => {
  await actionStatus({
    context,
    octokit,
    reactionId: null,
    message: 'Everything worked!',
    result: 'success'
  })

  assertCalledWith(createCommentMock, {
    body: 'Everything worked!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertNotCalled(deleteForIssueCommentMock)
  assertNotCalled(createForIssueCommentMock)
})

test('continues to add the final reaction when initial reaction deletion fails', async () => {
  deleteForIssueCommentMock.mock.mockImplementation(() =>
    Promise.reject(new Error('delete unavailable'))
  )

  await actionStatus({
    context,
    octokit,
    reactionId: 123,
    message: 'Everything worked!',
    result: 'success'
  })

  assertCalledWith(
    warningMock,
    'failed to remove the initial decorative reaction: delete unavailable'
  )
  assertCalledWith(createForIssueCommentMock, {
    comment_id: 1,
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('keeps the required status comment when the final reaction fails', async () => {
  createForIssueCommentMock.mock.mockImplementation(() =>
    Promise.reject(new Error('create unavailable'))
  )

  await actionStatus({
    context,
    octokit,
    reactionId: 123,
    message: 'Everything worked!',
    result: 'success'
  })

  assertCalledWith(createCommentMock, {
    body: 'Everything worked!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  assertCalledWith(
    warningMock,
    'failed to add the final decorative reaction: create unavailable'
  )
})
