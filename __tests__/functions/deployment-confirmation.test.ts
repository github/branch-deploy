import * as core from '../../src/actions-core.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import {COLORS} from '../../src/functions/colors.ts'
import {deploymentConfirmation} from '../../src/functions/deployment-confirmation.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {createIssueCommentContext} from '../test-helpers.ts'

const warningMock = vi.spyOn(core, 'warning')

let context: Parameters<typeof deploymentConfirmation>[0]
let octokit: Parameters<typeof deploymentConfirmation>[1]
let data: Parameters<typeof deploymentConfirmation>[2]
const originalSetTimeout = globalThis.setTimeout
type ConfirmationOctokit = Parameters<typeof deploymentConfirmation>[1]
const createCommentMock =
  vi.fn<ConfirmationOctokit['rest']['issues']['createComment']>()
const updateCommentMock =
  vi.fn<ConfirmationOctokit['rest']['issues']['updateComment']>()
const listReactionsMock =
  vi.fn<ConfirmationOctokit['rest']['reactions']['listForIssueComment']>()

function immediateTimeout<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  _delay?: number,
  ...args: TArgs
): NodeJS.Timeout {
  callback(...args)
  return originalSetTimeout(() => undefined, 0)
}

function latestCreateCommentRequest(): NonNullable<
  Parameters<typeof createCommentMock>[0]
> {
  const request = createCommentMock.mock.calls.at(-1)?.[0]
  if (!request) throw new Error('expected createComment to be called')
  return request
}

function latestUpdateCommentRequest(): NonNullable<
  Parameters<typeof updateCommentMock>[0]
> {
  const request = updateCommentMock.mock.calls.at(-1)?.[0]
  if (!request) throw new Error('expected updateComment to be called')
  return request
}

beforeEach(() => {
  vi.clearAllMocks()

  // Mock setTimeout to execute immediately
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(immediateTimeout)

  // Mock Date.now to control time progression
  const mockDate = new Date('2024-10-21T19:11:18Z').getTime()
  vi.spyOn(Date, 'now').mockReturnValue(mockDate)

  vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com')
  vi.stubEnv('GITHUB_RUN_ID', '12345')

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

  createCommentMock.mockResolvedValue({data: {id: 124}})
  updateCommentMock.mockResolvedValue({data: {}})
  listReactionsMock.mockResolvedValue({data: []})
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

test('successfully prompts for deployment confirmation and gets confirmed by the original actor', async () => {
  // Mock that the user adds a +1 reaction
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValueOnce({
    data: [
      {
        user: {login: 'monalisa'},
        content: '+1'
      }
    ]
  })

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(true)
  const createRequest = latestCreateCommentRequest()
  expect(createRequest.body).toContain('Deployment Confirmation Required')
  expect(createRequest).toStrictEqual({
    body: createRequest.body,
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(core.debug).toHaveBeenCalledWith(
    'deployment confirmation comment id: 124'
  )
  expect(core.info).toHaveBeenCalledWith(
    `⏰ waiting ${COLORS.highlight}60${COLORS.reset} seconds for deployment confirmation`
  )
  expect(core.info).toHaveBeenCalledWith(
    `✅ deployment confirmed by ${COLORS.highlight}monalisa${COLORS.reset} - sha: ${COLORS.highlight}abc123${COLORS.reset}`
  )

  expect(octokit.rest.reactions.listForIssueComment).toHaveBeenCalledWith({
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })

  const updateRequest = latestUpdateCommentRequest()
  expect(updateRequest.body).toContain(
    '✅ Deployment confirmed by __monalisa__'
  )
  expect(updateRequest).toStrictEqual({
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
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValueOnce({
    data: [
      {
        user: {login: 'monalisa'},
        content: '+1'
      }
    ]
  })

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(true)
  const createRequest = latestCreateCommentRequest()
  expect(createRequest.body).toContain('"url": null')
  expect(createRequest).toStrictEqual({
    body: createRequest.body,
    issue_number: 1,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(core.debug).toHaveBeenCalledWith(
    'deployment confirmation comment id: 124'
  )
  expect(core.info).toHaveBeenCalledWith(
    `⏰ waiting ${COLORS.highlight}60${COLORS.reset} seconds for deployment confirmation`
  )
  expect(core.info).toHaveBeenCalledWith(
    `✅ deployment confirmed by ${COLORS.highlight}monalisa${COLORS.reset} - sha: ${COLORS.highlight}abc123${COLORS.reset}`
  )

  expect(octokit.rest.reactions.listForIssueComment).toHaveBeenCalledWith({
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })

  const updateRequest = latestUpdateCommentRequest()
  expect(updateRequest.body).toContain(
    '✅ Deployment confirmed by __monalisa__'
  )
  expect(updateRequest).toStrictEqual({
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('user rejects the deployment with thumbs down', async () => {
  // Mock that the user adds a -1 reaction
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValueOnce({
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

  const updateRequest = latestUpdateCommentRequest()
  expect(updateRequest.body).toContain('❌ Deployment rejected by __monalisa__')
  expect(updateRequest).toStrictEqual({
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })

  expect(core.setFailed).toHaveBeenCalledWith(
    `❌ deployment rejected by ${COLORS.highlight}monalisa${COLORS.reset}`
  )
})

test('deployment confirmation times out after no response', async () => {
  // Mock empty reactions list (no user reaction)
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValue({
    data: []
  })

  // Mock Date.now to first return start time, then timeout
  vi.mocked(Date.now)
    .mockReturnValueOnce(new Date('2024-10-21T19:11:18Z').getTime()) // Start time
    .mockReturnValue(new Date('2024-10-21T19:12:30Z').getTime()) // After timeout

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(false)
  expect(octokit.rest.issues.createComment).toHaveBeenCalled()

  const updateRequest = latestUpdateCommentRequest()
  expect(updateRequest.body).toContain('⏱️ Deployment confirmation timed out')
  expect(updateRequest).toStrictEqual({
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })

  expect(core.setFailed).toHaveBeenCalledWith(
    `⏱️ deployment confirmation timed out after ${COLORS.highlight}60${COLORS.reset} seconds`
  )
})

test('ignores reactions from other users', async () => {
  // First call returns reactions from other users
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValueOnce({
    data: [
      {
        user: {login: 'other-user'},
        content: '+1'
      }
    ]
  })

  // Second call includes the original actor's reaction
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValueOnce({
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
  const updateRequest = latestUpdateCommentRequest()
  expect(updateRequest.body).toContain(
    '✅ Deployment confirmed by __monalisa__'
  )
  expect(updateRequest).toStrictEqual({
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  expect(core.debug).toHaveBeenCalledWith(
    'ignoring reaction from other-user, expected monalisa'
  )
  expect(core.info).toHaveBeenCalledWith(
    `✅ deployment confirmed by ${COLORS.highlight}monalisa${COLORS.reset} - sha: ${COLORS.highlight}abc123${COLORS.reset}`
  )
})

test('ignores non thumbsUp/thumbsDown reactions from the original actor', async () => {
  // Mock reactions list with various reaction types from original actor
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValueOnce({
    data: [
      {
        user: {login: 'monalisa'},
        content: 'confused'
      },
      {
        user: {login: 'monalisa'},
        content: 'eyes'
      },
      {
        user: {login: 'monalisa'},
        content: 'rocket'
      }
    ]
  })

  // Add a thumbs up in the second poll
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValueOnce({
    data: [
      {
        user: {login: 'monalisa'},
        content: 'confused'
      },
      {
        user: {login: 'monalisa'},
        content: 'eyes'
      },
      {
        user: {login: 'monalisa'},
        content: 'rocket'
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

  // Verify that debug was called for each ignored reaction type
  expect(core.debug).toHaveBeenCalledWith('ignoring reaction: confused')
  expect(core.debug).toHaveBeenCalledWith('ignoring reaction: eyes')
  expect(core.debug).toHaveBeenCalledWith('ignoring reaction: rocket')

  // Verify final confirmation happened
  const updateRequest = latestUpdateCommentRequest()
  expect(updateRequest.body).toContain(
    '✅ Deployment confirmed by __monalisa__'
  )
  expect(updateRequest).toStrictEqual({
    body: updateRequest.body,
    comment_id: 124,
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
})

test('handles API errors gracefully', async () => {
  // First call throws error
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockRejectedValueOnce(
    new Error('API error')
  )

  // Second call succeeds with valid reaction
  vi.mocked(octokit.rest.reactions.listForIssueComment).mockResolvedValueOnce({
    data: [
      {
        user: {login: 'monalisa'},
        content: '+1'
      }
    ]
  })

  const result = await deploymentConfirmation(context, octokit, data)

  expect(result).toBe(true)
  expect(warningMock).toHaveBeenCalledWith(
    'temporary failure when checking for reactions on the deployment confirmation comment: API error'
  )
  expect(octokit.rest.reactions.listForIssueComment).toHaveBeenCalledTimes(2)
  expect(core.info).toHaveBeenCalledWith(
    `✅ deployment confirmed by ${COLORS.highlight}monalisa${COLORS.reset} - sha: ${COLORS.highlight}abc123${COLORS.reset}`
  )
})

test('preserves the temporary failure path for a null reaction user', async () => {
  vi.mocked(octokit.rest.reactions.listForIssueComment)
    .mockResolvedValueOnce({data: [{user: null, content: '+1'}]})
    .mockResolvedValueOnce({
      data: [{user: {login: 'monalisa'}, content: '+1'}]
    })

  await expect(deploymentConfirmation(context, octokit, data)).resolves.toBe(
    true
  )
  expect(warningMock).toHaveBeenCalledWith(
    "temporary failure when checking for reactions on the deployment confirmation comment: Cannot read properties of null (reading 'login')"
  )
  expect(octokit.rest.reactions.listForIssueComment).toHaveBeenCalledTimes(2)
})
