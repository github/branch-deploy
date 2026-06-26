import {vi, expect, test, beforeEach} from 'vitest'
import {
  actionStatus,
  type ActionStatusOctokit,
  type ActionStatusRequest
} from '../../src/functions/action-status.ts'
import {truncateCommentBody} from '../../src/functions/truncate-comment-body.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {createIssueCommentContext} from '../test-helpers.ts'

let context: ActionStatusRequest['context']
let octokit: ActionStatusRequest['octokit']
beforeEach(() => {
  vi.clearAllMocks()

  vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com')
  vi.stubEnv('GITHUB_RUN_ID', '12345')

  context = createIssueCommentContext({
    repo: {owner: 'corp', repo: 'test'},
    issue: {number: 1},
    payload: {comment: {id: 1}}
  })

  octokit = {
    rest: {
      reactions: {
        createForIssueComment:
          vi.fn<
            ActionStatusOctokit['rest']['reactions']['createForIssueComment']
          >(),
        deleteForIssueComment:
          vi.fn<
            ActionStatusOctokit['rest']['reactions']['deleteForIssueComment']
          >()
      },
      issues: {
        createComment:
          vi.fn<ActionStatusOctokit['rest']['issues']['createComment']>()
      }
    }
  } satisfies ActionStatusOctokit
})

test('adds a successful status message for a deployment', async () => {
  await expect(
    actionStatus({
      context,
      octokit,
      reactionId: 123,
      message: 'Everything worked!',
      result: 'success'
    })
  ).resolves.toBeUndefined()
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Everything worked!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('adds a successful status message for a deployment (with alt message)', async () => {
  await expect(
    actionStatus({
      context,
      octokit,
      reactionId: 123,
      message: 'Everything worked!',
      result: 'alternate-success'
    })
  ).resolves.toBeUndefined()
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Everything worked!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    content: '+1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('adds a failure status message for a deployment', async () => {
  await expect(
    actionStatus({
      context,
      octokit,
      reactionId: 123,
      message: 'Everything failed!',
      result: 'failure'
    })
  ).resolves.toBeUndefined()
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Everything failed!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    content: '-1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('uses default log url when the "message" variable is empty for failures', async () => {
  await expect(
    actionStatus({context, octokit, reactionId: 123, message: ''})
  ).resolves.toBeUndefined()
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Unknown error, [check logs](https://github.com/corp/test/actions/runs/12345) for more details.',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    content: '-1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('uses default log url when the "message" variable is empty for a success', async () => {
  await expect(
    actionStatus({
      context,
      octokit,
      reactionId: 123,
      message: '',
      result: 'success'
    })
  ).resolves.toBeUndefined()
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Unknown error, [check logs](https://github.com/corp/test/actions/runs/12345) for more details.',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('truncates the message when it is too large for an issue comment', async () => {
  const message = 'a'.repeat(65538)
  await expect(
    actionStatus({
      context,
      octokit,
      reactionId: 123,
      message,
      result: 'success'
    })
  ).resolves.toBeUndefined()
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: truncateCommentBody(message),
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: 1,
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})
