import {vi,expect,test,beforeEach} from 'vitest'
import {actionStatus} from '../../src/functions/action-status.js'
import {truncateCommentBody} from '../../src/functions/truncate-comment-body.js'
import {API_HEADERS} from '../../src/functions/api-headers.js'

var context
var octokit
beforeEach(() => {
  vi.clearAllMocks()

  process.env.GITHUB_SERVER_URL = 'https://github.com'
  process.env.GITHUB_RUN_ID = '12345'

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    },
    payload: {
      comment: {
        id: '1'
      }
    }
  }

  octokit = {
    rest: {
      reactions: {
        createForIssueComment: vi.fn().mockReturnValueOnce({
          data: {}
        }),
        deleteForIssueComment: vi.fn().mockReturnValueOnce({
          data: {}
        })
      },
      issues: {
        createComment: vi.fn().mockReturnValueOnce({
          data: {}
        })
      }
    }
  }
})

test('adds a successful status message for a deployment', async () => {
  expect(
    await actionStatus(context, octokit, 123, 'Everything worked!', true)
  ).toBe(undefined)
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Everything worked!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('adds a successful status message for a deployment (with alt message)', async () => {
  expect(
    await actionStatus(context, octokit, 123, 'Everything worked!', true, true)
  ).toBe(undefined)
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Everything worked!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: '+1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('adds a failure status message for a deployment', async () => {
  expect(
    await actionStatus(context, octokit, 123, 'Everything failed!', false)
  ).toBe(undefined)
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Everything failed!',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: '-1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('uses default log url when the "message" variable is empty for failures', async () => {
  expect(await actionStatus(context, octokit, 123, '', false)).toBe(undefined)
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Unknown error, [check logs](https://github.com/corp/test/actions/runs/12345) for more details.',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: '-1',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('uses default log url when the "message" variable is empty for a success', async () => {
  expect(await actionStatus(context, octokit, 123, '', true)).toBe(undefined)
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Unknown error, [check logs](https://github.com/corp/test/actions/runs/12345) for more details.',
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})

test('truncates the message when it is too large for an issue comment', async () => {
  const message = 'a'.repeat(65538)
  expect(await actionStatus(context, octokit, 123, message, true)).toBe(
    undefined
  )
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: truncateCommentBody(message),
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: 'rocket',
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test',
    headers: API_HEADERS
  })
})
