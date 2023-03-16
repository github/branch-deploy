import {actionStatus} from '../../src/functions/action-status'

var context
var octokit
beforeEach(() => {
  jest.clearAllMocks()
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
        createForIssueComment: jest.fn().mockReturnValueOnce({
          data: {}
        }),
        deleteForIssueComment: jest.fn().mockReturnValueOnce({
          data: {}
        })
      },
      issues: {
        createComment: jest.fn().mockReturnValueOnce({
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
    repo: 'test'
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: 'rocket',
    owner: 'corp',
    repo: 'test'
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test'
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
    repo: 'test'
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: '+1',
    owner: 'corp',
    repo: 'test'
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test'
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
    repo: 'test'
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: '-1',
    owner: 'corp',
    repo: 'test'
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test'
  })
})

test('uses default log url when the "message" variable is empty for failures', async () => {
  expect(await actionStatus(context, octokit, 123, '', false)).toBe(undefined)
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Unknown error, [check logs](https://github.com/corp/test/actions/runs/12345) for more details.',
    issue_number: 1,
    owner: 'corp',
    repo: 'test'
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: '-1',
    owner: 'corp',
    repo: 'test'
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test'
  })
})

test('uses default log url when the "message" variable is empty for a success', async () => {
  expect(await actionStatus(context, octokit, 123, '', true)).toBe(undefined)
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: 'Unknown error, [check logs](https://github.com/corp/test/actions/runs/12345) for more details.',
    issue_number: 1,
    owner: 'corp',
    repo: 'test'
  })
  expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    content: 'rocket',
    owner: 'corp',
    repo: 'test'
  })
  expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
    comment_id: '1',
    owner: 'corp',
    reaction_id: 123,
    repo: 'test'
  })
})
