import * as core from '@actions/core'
import {COLORS} from '../../src/functions/colors'
import {deploymentConfirmation} from '../../src/functions/deployment-confirmation'
import {API_HEADERS} from '../../src/functions/api-headers'

var context
var octokit
var data

beforeEach(() => {
  jest.clearAllMocks()

  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})

  // Mock setTimeout to execute immediately
  jest.spyOn(global, 'setTimeout').mockImplementation(fn => fn())

  // Mock Date.now to control time progression
  const mockDate = new Date('2024-10-21T19:11:18Z').getTime()
  jest.spyOn(Date, 'now').mockReturnValue(mockDate)

  process.env.GITHUB_SERVER_URL = 'https://github.com'
  process.env.GITHUB_RUN_ID = '12345'

  context = {
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
  }

  octokit = {
    rest: {
      reactions: {
        createForIssueComment: jest.fn().mockResolvedValue({
          data: {}
        }),
        listForIssueComment: jest.fn().mockResolvedValue({
          data: []
        })
      },
      issues: {
        createComment: jest.fn().mockResolvedValue({
          data: {
            id: 124
          }
        }),
        updateComment: jest.fn().mockResolvedValue({
          data: {}
        })
      }
    }
  }

  data = {
    deployment_confirmation_timeout: 60,
    deploymentType: 'branch',
    environment: 'production',
    environmentUrl: 'https://example.com',
    log_url: 'https://github.com/corp/test/actions/runs/12345',
    ref: 'cool-branch',
    sha: 'abc123',
    isVerified: true,
    noopMode: false,
    isFork: false,
    body: '.deploy',
    params: 'param1=1,param2=2',
    parsed_params: {
      param1: '1',
      param2: '2'
    }
  }
})

test('successfully prompts for deployment confirmation and gets confirmed by the original actor', async () => {
  // Mock that the user adds a +1 reaction
  octokit.rest.reactions.listForIssueComment.mockResolvedValueOnce({
    data: [
      {
        user: {login: 'monalisa'},
        content: '+1'
      }
    ]
  })

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(true)
  expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
    body: expect.stringContaining('Deployment Confirmation Required'),
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(core.debug).toHaveBeenCalledWith(
    'deployment confirmation comment id: 124'
  )
  expect(core.info).toHaveBeenCalledWith(
    `🕒 waiting ${COLORS.highlight}60${COLORS.reset} seconds for deployment confirmation`
  )

  expect(octokit.rest.reactions.listForIssueComment).toHaveBeenCalledWith({
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })

  expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
    body: expect.stringContaining('✅ Deployment confirmed by __monalisa__'),
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('user rejects the deployment with thumbs down', async () => {
  // Mock that the user adds a -1 reaction
  octokit.rest.reactions.listForIssueComment.mockResolvedValueOnce({
    data: [
      {
        user: {login: 'monalisa'},
        content: '-1'
      }
    ]
  })

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(false)
  expect(octokit.rest.issues.createComment).toHaveBeenCalled()
  expect(octokit.rest.reactions.listForIssueComment).toHaveBeenCalled()

  expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
    body: expect.stringContaining('❌ Deployment rejected by __monalisa__'),
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('deployment confirmation times out after no response', async () => {
  // Mock empty reactions list (no user reaction)
  octokit.rest.reactions.listForIssueComment.mockResolvedValue({
    data: []
  })

  // Mock Date.now to first return start time, then timeout
  Date.now
    .mockReturnValueOnce(new Date('2024-10-21T19:11:18Z').getTime()) // Start time
    .mockReturnValue(new Date('2024-10-21T19:12:30Z').getTime()) // After timeout

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(false)
  expect(octokit.rest.issues.createComment).toHaveBeenCalled()

  expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
    body: expect.stringContaining('⏱️ Deployment confirmation timed out'),
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })

  expect(core.info).toHaveBeenCalledWith(
    `⏱️ deployment confirmation timed out after ${COLORS.highlight}60${COLORS.reset} seconds`
  )
})

test('ignores reactions from other users', async () => {
  // First call returns reactions from other users
  octokit.rest.reactions.listForIssueComment.mockResolvedValueOnce({
    data: [
      {
        user: {login: 'other-user'},
        content: '+1'
      }
    ]
  })

  // Second call includes the original actor's reaction
  octokit.rest.reactions.listForIssueComment.mockResolvedValueOnce({
    data: [
      {
        user: {login: 'other-user'},
        content: '+1'
      },
      {
        user: {login: 'monalisa'},
        content: '+1'
      }
    ]
  })

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(true)
  expect(octokit.rest.reactions.listForIssueComment).toHaveBeenCalledTimes(2)
  expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
    body: expect.stringContaining('✅ Deployment confirmed by __monalisa__'),
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('handles API errors gracefully', async () => {
  // First call throws error
  octokit.rest.reactions.listForIssueComment.mockRejectedValueOnce(
    new Error('API error')
  )

  // Second call succeeds with valid reaction
  octokit.rest.reactions.listForIssueComment.mockResolvedValueOnce({
    data: [
      {
        user: {login: 'monalisa'},
        content: '+1'
      }
    ]
  })

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(true)
  expect(core.warning).toHaveBeenCalledWith(
    'temporary failure when checking for reactions on the deployment confirmation comment: API error'
  )
  expect(octokit.rest.reactions.listForIssueComment).toHaveBeenCalledTimes(2)
})
