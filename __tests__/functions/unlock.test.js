import {vi, expect, test, beforeEach} from 'vitest'
import {unlock} from '../../src/functions/unlock.js'
import * as actionStatus from '../../src/functions/action-status.js'
import {API_HEADERS} from '../../src/functions/api-headers.js'

class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.status = 422
  }
}

let octokit
let context

beforeEach(() => {
  vi.clearAllMocks()

  process.env.INPUT_ENVIRONMENT = 'production'
  process.env.INPUT_UNLOCK_TRIGGER = '.unlock'
  process.env.INPUT_GLOBAL_LOCK_FLAG = '--global'

  octokit = {
    rest: {
      git: {
        deleteRef: vi.fn().mockReturnValue({status: 204})
      },
      issues: {
        createComment: vi.fn().mockReturnValue({status: 201})
      },
      reactions: {
        createForIssueComment: vi.fn().mockReturnValue({status: 201}),
        deleteForIssueComment: vi.fn().mockReturnValue({status: 204})
      }
    }
  }

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
        body: '.unlock'
      }
    }
  }
})

test('successfully releases a deployment lock with the unlock function', async () => {
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock with the unlock function and a passed in environment', async () => {
  expect(await unlock(octokit, context, 123, 'staging')).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/staging-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a GLOBAL deployment lock with the unlock function', async () => {
  context.payload.comment.body = '.unlock --global'
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/global-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a development environment deployment lock with the unlock function', async () => {
  context.payload.comment.body = '.unlock development'
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/development-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a development environment deployment lock with the unlock function even when a non-need --reason flag is passed in', async () => {
  context.payload.comment.body =
    '.unlock development --reason because i said so'
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/development-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock with the unlock function - silent mode', async () => {
  expect(await unlock(octokit, context, 123, null, true)).toBe(
    'removed lock - silent'
  )
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('fails to release a deployment lock due to a bad HTTP code from the GitHub API - silent mode', async () => {
  const badHttpOctokitMock = {
    rest: {
      git: {
        deleteRef: vi.fn().mockReturnValue({status: 500})
      }
    }
  }
  expect(await unlock(badHttpOctokitMock, context, 123, null, true)).toBe(
    'failed to delete lock (bad status code) - silent'
  )
})

test('throws an error if an unhandled exception occurs - silent mode', async () => {
  const errorOctokitMock = {
    rest: {
      git: {
        deleteRef: vi.fn().mockRejectedValue(new Error('oh no'))
      }
    }
  }
  try {
    await unlock(errorOctokitMock, context, 123, null, true)
  } catch (e) {
    expect(e.message).toBe('Error: oh no')
  }
})

test('Does not find a deployment lock branch so it lets the user know - silent mode', async () => {
  const noBranchOctokitMock = {
    rest: {
      git: {
        deleteRef: vi
          .fn()
          .mockRejectedValue(
            new NotFoundError(
              'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
            )
          )
      }
    }
  }
  expect(await unlock(noBranchOctokitMock, context, 123, null, true)).toBe(
    'no deployment lock currently set - silent'
  )
})

test('fails to release a deployment lock due to a bad HTTP code from the GitHub API', async () => {
  const badHttpOctokitMock = {
    rest: {
      git: {
        deleteRef: vi.fn().mockReturnValue({status: 500})
      },
      issues: {
        createComment: vi.fn().mockReturnValue({status: 201})
      },
      reactions: {
        createForIssueComment: vi.fn().mockReturnValue({status: 201}),
        deleteForIssueComment: vi.fn().mockReturnValue({status: 204})
      }
    }
  }
  expect(await unlock(badHttpOctokitMock, context, 123)).toBe(false)
})

test('Does not find a deployment lock branch so it lets the user know', async () => {
  const actionStatusSpy = vi
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })
  const noBranchOctokitMock = {
    rest: {
      git: {
        deleteRef: vi
          .fn()
          .mockRejectedValue(
            new NotFoundError(
              'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
            )
          )
      }
    }
  }
  expect(await unlock(noBranchOctokitMock, context, 123)).toBe(true)
  expect(actionStatusSpy).toHaveBeenCalledWith(
    context,
    noBranchOctokitMock,
    123,
    '🔓 There is currently no `production` deployment lock set',
    true,
    true
  )
})

test('Does not find a deployment lock branch so it lets the user know', async () => {
  context.payload.comment.body = '.unlock --global'
  const actionStatusSpy = vi
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })
  const noBranchOctokitMock = {
    rest: {
      git: {
        deleteRef: vi
          .fn()
          .mockRejectedValue(
            new NotFoundError(
              'Reference does not exist - https://docs.github.com/rest/git/refs#delete-a-reference'
            )
          )
      }
    }
  }
  expect(await unlock(noBranchOctokitMock, context, 123)).toBe(true)
  expect(actionStatusSpy).toHaveBeenCalledWith(
    context,
    noBranchOctokitMock,
    123,
    '🔓 There is currently no `global` deployment lock set',
    true,
    true
  )
})

test('throws an error if an unhandled exception occurs', async () => {
  const errorOctokitMock = {
    rest: {
      git: {
        deleteRef: vi.fn().mockRejectedValue(new Error('oh no'))
      }
    }
  }
  try {
    await unlock(errorOctokitMock, context, 123)
  } catch (e) {
    expect(e.message).toBe('Error: oh no')
  }
})

test('successfully releases a deployment lock with --task flag', async () => {
  context.payload.comment.body = '.unlock production --task backend'
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-backend-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock with --task flag and different environment', async () => {
  context.payload.comment.body = '.unlock staging --task frontend'
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/staging-frontend-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock with --task flag on default environment', async () => {
  context.payload.comment.body = '.unlock --task api'
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-api-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock with --task flag combined with --reason', async () => {
  context.payload.comment.body =
    '.unlock production --task database --reason maintenance complete'
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-database-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('successfully releases a deployment lock with task passed as parameter', async () => {
  expect(await unlock(octokit, context, 123, 'production', false, 'worker')).toBe(
    true
  )
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-worker-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('handles malformed --task flag with no value (line 50 else branch)', async () => {
  context.payload.comment.body = '.unlock production --task'
  expect(await unlock(octokit, context, 123)).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production---task-branch-deploy-lock',
    headers: API_HEADERS
  })
})

test('uses task parameter when provided, ignoring task from comment (line 99 else branch)', async () => {
  context.payload.comment.body = '.unlock production --task backend'
  expect(await unlock(octokit, context, 123, null, false, 'frontend')).toBe(true)
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
    owner: 'corp',
    repo: 'test',
    ref: 'heads/production-frontend-branch-deploy-lock',
    headers: API_HEADERS
  })
})
