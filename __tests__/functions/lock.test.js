import * as core from '@actions/core'
import {vi, expect, test, beforeEach} from 'vitest'
import {lock} from '../../src/functions/lock.js'
import {COLORS} from '../../src/functions/colors.js'
import * as actionStatus from '../../src/functions/action-status.js'

class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.status = 404
  }
}

class BigBadError extends Error {
  constructor(message) {
    super(message)
    this.status = 500
  }
}

const environment = 'production'
const globalFlag = '--global'

const lockBase64Monalisa =
  'ewogICAgInJlYXNvbiI6IG51bGwsCiAgICAiYnJhbmNoIjogImNvb2wtbmV3LWZlYXR1cmUiLAogICAgImNyZWF0ZWRfYXQiOiAiMjAyMi0wNi0xNVQyMToxMjoxNC4wNDFaIiwKICAgICJjcmVhdGVkX2J5IjogIm1vbmFsaXNhIiwKICAgICJzdGlja3kiOiBmYWxzZSwKICAgICJlbnZpcm9ubWVudCI6ICJwcm9kdWN0aW9uIiwKICAgICJ1bmxvY2tfY29tbWFuZCI6ICIudW5sb2NrIHByb2R1Y3Rpb24iLAogICAgImdsb2JhbCI6IGZhbHNlLAogICAgImxpbmsiOiAiaHR0cHM6Ly9naXRodWIuY29tL3Rlc3Qtb3JnL3Rlc3QtcmVwby9wdWxsLzMjaXNzdWVjb21tZW50LTEyMyIKfQo='

const lockBase64Octocat =
  'ewogICAgInJlYXNvbiI6ICJUZXN0aW5nIG15IG5ldyBmZWF0dXJlIHdpdGggbG90cyBvZiBjYXRzIiwKICAgICJicmFuY2giOiAib2N0b2NhdHMtZXZlcnl3aGVyZSIsCiAgICAiY3JlYXRlZF9hdCI6ICIyMDIyLTA2LTE0VDIxOjEyOjE0LjA0MVoiLAogICAgImNyZWF0ZWRfYnkiOiAib2N0b2NhdCIsCiAgICAic3RpY2t5IjogdHJ1ZSwKICAgICJlbnZpcm9ubWVudCI6ICJwcm9kdWN0aW9uIiwKICAgICJ1bmxvY2tfY29tbWFuZCI6ICIudW5sb2NrIHByb2R1Y3Rpb24iLAogICAgImdsb2JhbCI6IGZhbHNlLAogICAgImxpbmsiOiAiaHR0cHM6Ly9naXRodWIuY29tL3Rlc3Qtb3JnL3Rlc3QtcmVwby9wdWxsLzIjaXNzdWVjb21tZW50LTQ1NiIKfQo='

const lockBase64OctocatNoReason =
  'ewogICAgInJlYXNvbiI6IG51bGwsCiAgICAiYnJhbmNoIjogIm9jdG9jYXRzLWV2ZXJ5d2hlcmUiLAogICAgImNyZWF0ZWRfYXQiOiAiMjAyMi0wNi0xNFQyMToxMjoxNC4wNDFaIiwKICAgICJjcmVhdGVkX2J5IjogIm9jdG9jYXQiLAogICAgInN0aWNreSI6IHRydWUsCiAgICAiZW52aXJvbm1lbnQiOiAicHJvZHVjdGlvbiIsCiAgICAidW5sb2NrX2NvbW1hbmQiOiAiLnVubG9jayBwcm9kdWN0aW9uIiwKICAgICJnbG9iYWwiOiBmYWxzZSwKICAgICJsaW5rIjogImh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8yI2lzc3VlY29tbWVudC00NTYiCn0K'

const lockBase64OctocatGlobal =
  'ewogICAgInJlYXNvbiI6ICJUZXN0aW5nIG15IG5ldyBmZWF0dXJlIHdpdGggbG90cyBvZiBjYXRzIiwKICAgICJicmFuY2giOiAib2N0b2NhdHMtZXZlcnl3aGVyZSIsCiAgICAiY3JlYXRlZF9hdCI6ICIyMDIyLTA2LTE0VDIxOjEyOjE0LjA0MVoiLAogICAgImNyZWF0ZWRfYnkiOiAib2N0b2NhdCIsCiAgICAic3RpY2t5IjogdHJ1ZSwKICAgICJlbnZpcm9ubWVudCI6IG51bGwsCiAgICAidW5sb2NrX2NvbW1hbmQiOiAiLnVubG9jayAtLWdsb2JhbCIsCiAgICAiZ2xvYmFsIjogdHJ1ZSwKICAgICJsaW5rIjogImh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8yI2lzc3VlY29tbWVudC00NTYiCn0K'

const saveStateMock = vi.spyOn(core, 'saveState')
const setFailedMock = vi.spyOn(core, 'setFailed')
const infoMock = vi.spyOn(core, 'info')
const debugMock = vi.spyOn(core, 'debug')
const errorMock = vi.spyOn(core, 'error')

var octokit
var octokitOtherUserHasLock
var createdLock
var monalisaOwner
var noLockFound
var failedToCreateLock

beforeEach(() => {
  vi.clearAllMocks()

  process.env.INPUT_GLOBAL_LOCK_FLAG = '--global'
  process.env.INPUT_LOCK_TRIGGER = '.lock'
  process.env.INPUT_ENVIRONMENT = 'production'
  process.env.INPUT_LOCK_INFO_ALIAS = '.wcid'

  createdLock = {
    lockData: null,
    status: true,
    globalFlag,
    environment,
    global: false
  }
  monalisaOwner = {
    lockData: {
      branch: 'cool-new-feature',
      created_at: '2022-06-15T21:12:14.041Z',
      created_by: 'monalisa',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/3#issuecomment-123',
      reason: null,
      sticky: false,
      unlock_command: '.unlock production'
    },
    status: 'owner',
    globalFlag,
    environment,
    global: false
  }
  noLockFound = {
    lockData: null,
    status: null,
    globalFlag,
    environment,
    global: false
  }
  failedToCreateLock = {
    lockData: null,
    status: false,
    globalFlag,
    environment,
    global: false
  }

  octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('Reference does not exist'))
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        createOrUpdateFileContents: vi.fn().mockReturnValue({}),
        getContent: vi
          .fn()
          .mockRejectedValue(new NotFoundError('file not found'))
      },
      git: {
        createRef: vi.fn().mockReturnValue({status: 201})
      },
      issues: {
        createComment: vi.fn().mockReturnValue({})
      }
    }
  }

  octokitOtherUserHasLock = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockReturnValueOnce({data: {content: lockBase64Octocat}})
      }
    }
  }
})

const context = {
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
      body: '.lock'
    }
  }
}

const ref = 'cool-new-feature'

test('successfully obtains a deployment lock (non-sticky) by creating the branch and lock file', async () => {
  expect(
    await lock(octokit, context, ref, 123, false, environment)
  ).toStrictEqual(createdLock)
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}production-branch-deploy-lock`
  )
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Determines that another user has the lock (GLOBAL) and exits - during a lock claim on deployment', async () => {
  const actionStatusSpy = vi
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })
  expect(
    await lock(octokitOtherUserHasLock, context, ref, 123, false, environment)
  ).toStrictEqual(failedToCreateLock)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(actionStatusSpy).toHaveBeenCalledWith(
    context,
    octokitOtherUserHasLock,
    123,
    expect.stringMatching(
      /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
    )
  )
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    expect.stringMatching(
      /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
    )
  )
})

test('Determines that another user has the lock (non-global) and exits - during a lock claim on deployment', async () => {
  failedToCreateLock.global = false
  const actionStatusSpy = vi
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })
  expect(
    await lock(octokitOtherUserHasLock, context, ref, 123, false, environment)
  ).toStrictEqual(failedToCreateLock)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(actionStatusSpy).toHaveBeenCalledWith(
    context,
    octokitOtherUserHasLock,
    123,
    expect.stringMatching(
      /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
    )
  )
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    expect.stringMatching(
      /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
    )
  )
})

test('Determines that another user has the lock (GLOBAL) and exits - during a direct lock claim with .lock --global', async () => {
  context.payload.comment.body = '.lock --global'
  const actionStatusSpy = vi
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found'))
          .mockReturnValueOnce({data: {content: lockBase64OctocatGlobal}})
      }
    }
  }
  expect(await lock(octokit, context, ref, 123, true, null)).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: null,
      global: true,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock --global'
    },
    status: false,
    globalFlag,
    environment: null,
    global: true
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: null`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: true`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: global-branch-deploy-lock`
  )
  expect(actionStatusSpy).toHaveBeenCalledWith(
    context,
    octokit,
    123,
    expect.stringMatching(
      /Sorry __monalisa__, the `global` deployment lock is currently claimed by __octocat__/
    )
  )
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    expect.stringMatching(/Cannot claim deployment lock/)
  )
})

test('Determines that another user has the lock (non-global) and exits - during a direct lock claim with .lock', async () => {
  const actionStatusSpy = vi
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found'))
          .mockReturnValueOnce({data: {content: lockBase64Octocat}})
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, true, environment)
  ).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock production'
    },
    status: false,
    globalFlag,
    environment,
    global: false
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(actionStatusSpy).toHaveBeenCalledWith(
    context,
    octokit,
    123,
    expect.stringMatching(
      /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
    )
  )
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    expect.stringMatching(/Cannot claim deployment lock/)
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // fails the first time looking for a global lock
          .mockReturnValueOnce({data: {content: lockBase64Octocat}}) // succeeds the second time looking for a 'local' lock for the environment
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, null, environment, true)
  ).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock production'
    },
    status: 'details-only',
    environment,
    globalFlag,
    global: false
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully - global lock', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // fails the first time looking for a global lock
          .mockReturnValueOnce({data: {content: lockBase64OctocatGlobal}}) // succeeds the second time looking for a 'local' lock for the environment
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, null, environment, true)
  ).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: null,
      global: true,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock --global'
    },
    status: 'details-only',
    environment,
    globalFlag,
    global: false
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully -- .wcid', async () => {
  context.payload.comment.body = '.wcid'

  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // fails the first time looking for a global lock
          .mockReturnValueOnce({data: {content: lockBase64Octocat}}) // succeeds the second time looking for a 'local' lock for the environment
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, null, null, true)
  ).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock production'
    },
    status: 'details-only',
    environment,
    globalFlag,
    global: false
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully -- .wcid --global', async () => {
  context.payload.comment.body = '.wcid --global'

  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockReturnValueOnce({data: {content: lockBase64OctocatGlobal}}) // succeeds looking for a global lock
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, null, null, true)
  ).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: null,
      global: true,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock --global'
    },
    status: 'details-only',
    environment: null,
    globalFlag,
    global: true
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: null`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: true`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: global-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and does not find a lock --global', async () => {
  context.payload.comment.body = '.lock -i --global'

  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // fails looking for a global lock
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, null, null, true)
  ).toStrictEqual({
    lockData: null,
    status: null,
    environment: null,
    globalFlag,
    global: true
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: null`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: true`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: global-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully with --details flag', async () => {
  context.payload.comment.body = '.lock --details'

  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // fails the first time looking for a global lock
          .mockReturnValueOnce({data: {content: lockBase64Octocat}}) // succeeds the second time looking for a 'local' lock for the environment
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, null, null, true)
  ).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock production'
    },
    status: 'details-only',
    globalFlag,
    environment,
    global: false
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file when the lock branch exists but no lock file exists', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValue(new NotFoundError('file not found')),
        createOrUpdateFileContents: vi.fn().mockReturnValue({})
      },
      issues: {
        createComment: vi.fn().mockReturnValue({})
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, null, environment, true)
  ).toStrictEqual(noLockFound)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file when no branch exists', async () => {
  context.payload.comment.body = '.lock --details'
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockRejectedValueOnce(new NotFoundError('Reference does not exist'))
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        createOrUpdateFileContents: vi.fn().mockReturnValue({}),
        getContent: vi
          .fn()
          .mockRejectedValue(new NotFoundError('file not found'))
      },
      git: {
        createRef: vi.fn().mockReturnValue({status: 201})
      },
      issues: {
        createComment: vi.fn().mockReturnValue({})
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, null, environment, true)
  ).toStrictEqual(noLockFound)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file when no branch exists and hits an error when trying to check the branch', async () => {
  context.payload.comment.body = '.lock --details'
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockRejectedValueOnce(new BigBadError('oh no - 500')),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        createOrUpdateFileContents: vi.fn().mockReturnValue({}),
        getContent: vi
          .fn()
          .mockRejectedValue(new NotFoundError('file not found'))
      }
    }
  }
  try {
    await lock(octokit, context, ref, 123, null, environment, true)
  } catch (error) {
    expect(errorMock).toHaveBeenCalledWith(
      'an unexpected status code was returned while checking for the lock branch'
    )
    expect(error.message).toBe('Error: oh no - 500')
    expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
    expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
    expect(debugMock).toHaveBeenCalledWith(
      `constructed lock branch name: ${environment}-branch-deploy-lock`
    )
  }
})

test('Determines that the lock request is coming from current owner of the lock and exits - non-sticky', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockReturnValue({data: {content: lockBase64Monalisa}})
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, false, environment)
  ).toStrictEqual(monalisaOwner)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `✅ ${COLORS.highlight}monalisa${COLORS.reset} initiated this request and is also the owner of the current lock`
  )
})

test('Determines that the lock request is coming from current owner of the lock and exits - sticky', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockReturnValue({data: {content: lockBase64Monalisa}})
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, true, environment)
  ).toStrictEqual(monalisaOwner)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `✅ ${COLORS.highlight}monalisa${COLORS.reset} initiated this request and is also the owner of the current lock`
  )
})

test('checks a lock and finds that it is from another owner and that no reason was set - it was a lock for the production environment', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockReturnValue({data: {content: lockBase64OctocatNoReason}})
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, true, environment)
  ).toStrictEqual({
    environment: 'production',
    global: false,
    globalFlag: '--global',
    lockData: null,
    status: false
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(debugMock).toHaveBeenCalledWith(`no reason detected`)
  expect(debugMock).toHaveBeenCalledWith(
    `the lock was not claimed as it is owned by octocat`
  )
})

test('checks a lock and finds that it is from another owner and that no reason was set - it was a lock for the production environment and sticky is set to false', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockReturnValue({data: {content: lockBase64OctocatNoReason}})
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, false, environment)
  ).toStrictEqual({
    environment: 'production',
    global: false,
    globalFlag: '--global',
    lockData: null,
    status: false
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(debugMock).toHaveBeenCalledWith(`no reason detected`)
  expect(debugMock).toHaveBeenCalledWith(
    `the lock was not claimed as it is owned by octocat`
  )
})

test('Determines that the lock request is coming from current owner of the lock (GLOBAL lock) and exits - sticky', async () => {
  context.actor = 'octocat'
  context.payload.comment.body = '.lock --global'
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockReturnValue({data: {content: lockBase64OctocatGlobal}})
      }
    }
  }
  expect(await lock(octokit, context, ref, 123, true, null)).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      environment: null,
      global: true,
      unlock_command: '.unlock --global'
    },
    status: 'owner',
    global: true,
    globalFlag: '--global',
    environment: null
  })
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: null`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: true`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: global-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `✅ ${COLORS.highlight}octocat${COLORS.reset} initiated this request and is also the owner of the current lock`
  )
})

test('fails to decode the lock file contents', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi.fn().mockReturnValue({data: {content: null}})
      }
    }
  }
  try {
    await lock(octokit, context, ref, 123, true, environment)
  } catch (error) {
    expect(error.message).toBe(
      'TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received null'
    )
    expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
    expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
    expect(debugMock).toHaveBeenCalledWith(
      `constructed lock branch name: ${environment}-branch-deploy-lock`
    )
  }
})

test('Creates a lock when the lock branch exists but no lock file exists', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: vi.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: vi
          .fn()
          .mockRejectedValue(new NotFoundError('file not found')),
        createOrUpdateFileContents: vi.fn().mockReturnValue({})
      },
      issues: {
        createComment: vi.fn().mockReturnValue({})
      }
    }
  }
  expect(
    await lock(octokit, context, ref, 123, false, environment)
  ).toStrictEqual(createdLock)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
})

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file - with a --reason', async () => {
  context.payload.comment.body =
    '.lock --reason testing a super cool new feature'
  expect(
    await lock(octokit, context, ref, 123, true, environment)
  ).toStrictEqual(createdLock)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
  expect(infoMock).toHaveBeenCalledWith(
    `🍯 deployment lock is ${COLORS.highlight}sticky`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}production-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file - with an empty --reason', async () => {
  context.payload.comment.body = '.lock --reason '
  expect(
    await lock(octokit, context, ref, 123, true, environment)
  ).toStrictEqual(createdLock)
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
  expect(infoMock).toHaveBeenCalledWith(
    `🍯 deployment lock is ${COLORS.highlight}sticky`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}production-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky and global) by creating the branch and lock file', async () => {
  context.payload.comment.body = '.lock --global'
  createdLock.environment = null
  createdLock.global = true
  expect(await lock(octokit, context, ref, 123, true, null)).toStrictEqual(
    createdLock
  )
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: null`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: true`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: global-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🌎 this is a request for a ${COLORS.highlight}global${COLORS.reset} deployment lock`
  )
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
  expect(infoMock).toHaveBeenCalledWith(
    `🍯 deployment lock is ${COLORS.highlight}sticky`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}global-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky and global) by creating the branch and lock file with a --reason', async () => {
  context.payload.comment.body =
    '.lock --reason because something is broken --global'
  createdLock.environment = null
  createdLock.global = true
  expect(await lock(octokit, context, ref, 123, true, null)).toStrictEqual(
    createdLock
  )
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: null`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: true`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: global-branch-deploy-lock`
  )
  expect(debugMock).toHaveBeenCalledWith('reason: because something is broken')
  expect(infoMock).toHaveBeenCalledWith(
    `🌎 this is a request for a ${COLORS.highlight}global${COLORS.reset} deployment lock`
  )
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
  expect(infoMock).toHaveBeenCalledWith(
    `🍯 deployment lock is ${COLORS.highlight}sticky`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}global-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky and global) by creating the branch and lock file with a --reason at the end of the string', async () => {
  context.payload.comment.body =
    '.lock --global  --reason because something is broken badly  '
  createdLock.environment = null
  createdLock.global = true
  expect(await lock(octokit, context, ref, 123, true, null)).toStrictEqual(
    createdLock
  )
  expect(debugMock).toHaveBeenCalledWith(
    'reason: because something is broken badly'
  )
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: null`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: true`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: global-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🌎 this is a request for a ${COLORS.highlight}global${COLORS.reset} deployment lock`
  )
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
  expect(infoMock).toHaveBeenCalledWith(
    `🍯 deployment lock is ${COLORS.highlight}sticky`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}global-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file with a --reason at the end of the string', async () => {
  context.payload.comment.body =
    '.lock development  --reason because something is broken badly  '
  createdLock.environment = 'development'
  expect(await lock(octokit, context, ref, 123, true, null)).toStrictEqual(
    createdLock
  )
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: development`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: development-branch-deploy-lock`
  )
  expect(debugMock).toHaveBeenCalledWith(
    'reason: because something is broken badly'
  )
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
  expect(infoMock).toHaveBeenCalledWith(
    `🍯 deployment lock is ${COLORS.highlight}sticky`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}development-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file with a --reason and assuming a null environment to start (but it is production)', async () => {
  context.payload.comment.body = '.lock --reason because something is broken'
  expect(await lock(octokit, context, ref, 123, true)).toStrictEqual(
    createdLock
  )
  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  expect(debugMock).toHaveBeenCalledWith('reason: because something is broken')
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
  expect(infoMock).toHaveBeenCalledWith(
    `🍯 deployment lock is ${COLORS.highlight}sticky`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}production-branch-deploy-lock`
  )
})

test('throws an error if an unhandled exception occurs', async () => {
  const octokit = {
    rest: {
      repos: {
        getBranch: vi.fn().mockRejectedValueOnce(new Error('oh no')),
        getContent: vi.fn().mockRejectedValue(new Error('oh no'))
      }
    }
  }
  try {
    await lock(octokit, context, ref, 123, true, environment)
  } catch (e) {
    expect(e.message).toBe('Error: oh no')
  }
})

test('successfully obtains a deployment lock (sticky) with a task and creates a lock comment with task information', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const task = 'migration-v2'
  const issueNumber = 123
  context.payload.comment.body = '.lock'
  process.env.INPUT_UNLOCK_TRIGGER = '.unlock'
  process.env.GITHUB_SERVER_URL = 'https://github.com'
  context.payload.comment.id = 456

  const octokitWithTask = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('Reference does not exist'))
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        createOrUpdateFileContents: jest.fn().mockReturnValue({}),
        getContent: jest
          .fn()
          .mockRejectedValue(new NotFoundError('file not found'))
      },
      git: {
        createRef: jest.fn().mockReturnValue({status: 201})
      },
      issues: {
        createComment: jest.fn().mockReturnValue({})
      }
    }
  }

  const result = await lock(
    octokitWithTask,
    context,
    ref,
    123,
    true, // sticky = true
    environment,
    false, // detailsOnly = false
    false, // postDeployStep = false
    true, // leaveComment = true
    task, // task = 'migration-v2'
    issueNumber
  )

  expect(result).toStrictEqual({
    lockData: null,
    status: true,
    globalFlag,
    environment,
    global: false
  })

  expect(debugMock).toHaveBeenCalledWith(`detected lock env: ${environment}`)
  expect(debugMock).toHaveBeenCalledWith(`detected lock global: false`)
  expect(debugMock).toHaveBeenCalledWith(
    `constructed lock branch name: ${environment}-migration-v2-branch-deploy-lock`
  )
  expect(infoMock).toHaveBeenCalledWith('✅ deployment lock obtained')
  expect(infoMock).toHaveBeenCalledWith(
    `🍯 deployment lock is ${COLORS.highlight}sticky`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔒 created lock branch: ${COLORS.highlight}production-migration-v2-branch-deploy-lock`
  )

  // Verify that actionStatus was called with a comment containing the task information
  expect(actionStatusSpy).toHaveBeenCalledWith(
    context,
    octokitWithTask,
    123,
    expect.stringContaining(
      `You are now the only user that can trigger deployments to the \`${environment}\` environment with task \`${task}\``
    ),
    true,
    true
  )
})

// Tests for enhanced ownership checks with branch comparison (lines 424-573)
test('Enhanced ownership check: same user, same branch - owner already has lock (sticky=true, leaveComment=true) with task', async () => {
  const warningMock = jest.spyOn(core, 'warning')
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextWithPR = {
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 3
    },
    payload: {
      comment: {
        body: '.lock'
      },
      pull_request: {
        head: {
          ref: 'cool-new-feature'
        }
      }
    }
  }

  // Lock data with task information - same user, same branch
  const lockBase64MonalisaWithTask =
    'eyJyZWFzb24iOm51bGwsImJyYW5jaCI6ImNvb2wtbmV3LWZlYXR1cmUiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0xNVQyMToxMjoxNC4wNDFaIiwiY3JlYXRlZF9ieSI6Im1vbmFsaXNhIiwic3RpY2t5Ijp0cnVlLCJlbnZpcm9ubWVudCI6InByb2R1Y3Rpb24iLCJ1bmxvY2tfY29tbWFuZCI6Ii51bmxvY2sgcHJvZHVjdGlvbiIsImdsb2JhbCI6ZmFsc2UsImxpbmsiOiJodHRwczovL2dpdGh1Yi5jb20vdGVzdC1vcmcvdGVzdC1yZXBvL3B1bGwvMyNpc3N1ZWNvbW1lbnQtMTIzIiwidGFzayI6Im1pZ3JhdGlvbi12MiIsInByX251bWJlciI6M30K'

  const octokitOwnerLock = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // global lock check
          .mockReturnValueOnce({data: {content: lockBase64MonalisaWithTask}})
      }
    }
  }

  const result = await lock(
    octokitOwnerLock,
    contextWithPR,
    'cool-new-feature',
    123,
    true, // sticky = true
    environment,
    false, // detailsOnly = false
    false, // postDeployStep = false
    true // leaveComment = true
  )

  expect(result).toStrictEqual({
    lockData: {
      branch: 'cool-new-feature',
      created_at: '2022-06-15T21:12:14.041Z',
      created_by: 'monalisa',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/3#issuecomment-123',
      reason: null,
      sticky: true,
      unlock_command: '.unlock production',
      task: 'migration-v2',
      pr_number: 3
    },
    status: 'owner',
    globalFlag,
    environment,
    global: false
  })

  // Verify debug messages for branch comparison (lines 427-438)
  expect(debugMock).toHaveBeenCalledWith(
    'Lock ownership check - sameUser: true, sameBranch: true'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'Current actor: monalisa, Lock owner: monalisa'
  )
  expect(debugMock).toHaveBeenCalledWith('Current PR: 3, Lock PR: 3')
  expect(debugMock).toHaveBeenCalledWith(
    'Current branch: cool-new-feature, Lock branch: cool-new-feature'
  )

  // Verify info message (line 441-443)
  expect(infoMock).toHaveBeenCalledWith(
    `✅ ${COLORS.highlight}monalisa${COLORS.reset} initiated this request and owns the current lock from the same PR and branch`
  )

  // Verify actionStatus was called with "you already own it" message (lines 446-477)
  expect(actionStatusSpy).toHaveBeenCalledWith(
    contextWithPR,
    octokitOwnerLock,
    123,
    expect.stringMatching(
      /### 🔒 Deployment Lock Information.*__monalisa__, you are already the owner of the current deployment lock on `production` environment for the task `migration-v2`/s
    ),
    true,
    true
  )

  expect(warningMock).not.toHaveBeenCalled()
})

test('Enhanced ownership check: same user, same branch - global lock with task (sticky=true, leaveComment=true)', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextWithPR = {
    actor: 'octocat',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 2
    },
    payload: {
      comment: {
        body: '.lock --global'
      },
      pull_request: {
        head: {
          ref: 'octocats-everywhere'
        }
      }
    }
  }

  // Global lock data with task - same user, same branch
  const lockBase64OctocatGlobalWithTask =
    'eyJyZWFzb24iOm51bGwsImJyYW5jaCI6Im9jdG9jYXRzLWV2ZXJ5d2hlcmUiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0xNFQyMToxMjoxNC4wNDFaIiwiY3JlYXRlZF9ieSI6Im9jdG9jYXQiLCJzdGlja3kiOnRydWUsImVudmlyb25tZW50IjpudWxsLCJ1bmxvY2tfY29tbWFuZCI6Ii51bmxvY2sgLS1nbG9iYWwiLCJnbG9iYWwiOnRydWUsImxpbmsiOiJodHRwczovL2dpdGh1Yi5jb20vdGVzdC1vcmcvdGVzdC1yZXBvL3B1bGwvMiNpc3N1ZWNvbW1lbnQtNDU2IiwidGFzayI6ImRlZmF1bHQiLCJwcl9udW1iZXIiOjJ9Cg=='

  const octokitOwnerLock = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockReturnValueOnce({
            data: {content: lockBase64OctocatGlobalWithTask}
          })
          .mockReturnValueOnce({
            data: {content: lockBase64OctocatGlobalWithTask}
          })
      }
    }
  }

  const result = await lock(
    octokitOwnerLock,
    contextWithPR,
    'octocats-everywhere',
    123,
    true, // sticky = true
    null, // global lock
    false, // detailsOnly = false
    false, // postDeployStep = false
    true // leaveComment = true
  )

  expect(result).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: null,
      global: true,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: null,
      sticky: true,
      unlock_command: '.unlock --global',
      task: 'default',
      pr_number: 2
    },
    status: 'owner',
    globalFlag,
    environment: null,
    global: true
  })

  // Verify debug messages for branch comparison (lines 427-438)
  expect(debugMock).toHaveBeenCalledWith(
    'Lock ownership check - sameUser: true, sameBranch: true'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'Current actor: octocat, Lock owner: octocat'
  )
  expect(debugMock).toHaveBeenCalledWith('Current PR: 2, Lock PR: 2')
  expect(debugMock).toHaveBeenCalledWith(
    'Current branch: octocats-everywhere, Lock branch: octocats-everywhere'
  )

  // Verify info message (line 441-443)
  expect(infoMock).toHaveBeenCalledWith(
    `✅ ${COLORS.highlight}octocat${COLORS.reset} initiated this request and owns the current lock from the same PR and branch`
  )

  // Verify actionStatus was called with "you already own it" message for global lock (lines 454-455)
  expect(actionStatusSpy).toHaveBeenCalledWith(
    contextWithPR,
    octokitOwnerLock,
    123,
    expect.stringMatching(
      /### 🔒 Deployment Lock Information.*__octocat__, you are already the owner of the current `global` deployment lock/s
    ),
    true,
    true
  )
})

test('Enhanced ownership check: same user, different branch - denies lock access', async () => {
  const warningMock = jest.spyOn(core, 'warning')
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextWithPR = {
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 5
    },
    payload: {
      comment: {
        body: '.lock'
      },
      pull_request: {
        head: {
          ref: 'different-pr-branch' // Different branch than the lock
        }
      }
    }
  }

  process.env.GITHUB_SERVER_URL = 'https://github.com'

  // Lock data - same user (monalisa) but different branch
  const lockBase64MonalisaDifferentBranch =
    'eyJyZWFzb24iOm51bGwsImJyYW5jaCI6ImRpZmZlcmVudC1mZWF0dXJlLWJyYW5jaCIsImNyZWF0ZWRfYXQiOiIyMDIyLTA2LTE1VDIxOjEyOjE0LjA0MVoiLCJjcmVhdGVkX2J5IjoibW9uYWxpc2EiLCJzdGlja3kiOnRydWUsImVudmlyb25tZW50IjoicHJvZHVjdGlvbiIsInVubG9ja19jb21tYW5kIjoiLnVubG9jayBwcm9kdWN0aW9uIiwiZ2xvYmFsIjpmYWxzZSwibGluayI6Imh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8zI2lzc3VlY29tbWVudC0xMjMiLCJ0YXNrIjoiZGVmYXVsdCIsInByX251bWJlciI6M30K'

  const octokitDifferentBranch = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // global lock check
          .mockReturnValueOnce({
            data: {content: lockBase64MonalisaDifferentBranch}
          })
      }
    }
  }

  const result = await lock(
    octokitDifferentBranch,
    contextWithPR,
    'different-pr-branch',
    123,
    true, // sticky = true
    environment
  )

  expect(result).toStrictEqual({
    lockData: {
      branch: 'different-feature-branch',
      created_at: '2022-06-15T21:12:14.041Z',
      created_by: 'monalisa',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/3#issuecomment-123',
      reason: null,
      sticky: true,
      unlock_command: '.unlock production',
      task: 'default',
      pr_number: 3
    },
    status: false,
    globalFlag,
    environment,
    global: false
  })

  // Verify debug messages for branch comparison
  expect(debugMock).toHaveBeenCalledWith(
    'Lock ownership check - sameUser: true, sameBranch: false'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'Current branch: different-pr-branch, Lock branch: different-feature-branch'
  )

  // Verify warning message for same user, different branch (lines 484-486)
  expect(warningMock).toHaveBeenCalledWith(
    '⚠️ Same user but different branch - denying lock access'
  )

  // Verify detailed error message is shown (lines 488-573)
  expect(actionStatusSpy).toHaveBeenCalledWith(
    contextWithPR,
    octokitDifferentBranch,
    123,
    expect.stringMatching(
      /Cannot claim deployment lock.*the `production` environment deployment lock \(task: `default`\) is currently claimed by __monalisa__/s
    )
  )

  expect(setFailedMock).toHaveBeenCalled()
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('Enhanced ownership check: different user trying to claim lock - shows detailed error with task', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextDifferentUser = {
    actor: 'octocat', // Different user
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 10
    },
    payload: {
      comment: {
        body: '.lock'
      },
      pull_request: {
        head: {
          ref: 'octocats-feature'
        }
      }
    }
  }

  process.env.GITHUB_SERVER_URL = 'https://github.com'

  // Lock owned by monalisa with task
  const lockBase64MonalisaWithTask =
    'eyJyZWFzb24iOm51bGwsImJyYW5jaCI6ImNvb2wtbmV3LWZlYXR1cmUiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0xNVQyMToxMjoxNC4wNDFaIiwiY3JlYXRlZF9ieSI6Im1vbmFsaXNhIiwic3RpY2t5Ijp0cnVlLCJlbnZpcm9ubWVudCI6InByb2R1Y3Rpb24iLCJ1bmxvY2tfY29tbWFuZCI6Ii51bmxvY2sgcHJvZHVjdGlvbiIsImdsb2JhbCI6ZmFsc2UsImxpbmsiOiJodHRwczovL2dpdGh1Yi5jb20vdGVzdC1vcmcvdGVzdC1yZXBvL3B1bGwvMyNpc3N1ZWNvbW1lbnQtMTIzIiwidGFzayI6Im1pZ3JhdGlvbi12MiIsInByX251bWJlciI6M30K'

  const octokitDifferentUser = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // global lock check
          .mockReturnValueOnce({data: {content: lockBase64MonalisaWithTask}})
      }
    }
  }

  const result = await lock(
    octokitDifferentUser,
    contextDifferentUser,
    'octocats-feature',
    123,
    true, // sticky = true
    environment
  )

  expect(result).toStrictEqual({
    lockData: {
      branch: 'cool-new-feature',
      created_at: '2022-06-15T21:12:14.041Z',
      created_by: 'monalisa',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/3#issuecomment-123',
      reason: null,
      sticky: true,
      unlock_command: '.unlock production',
      task: 'migration-v2',
      pr_number: 3
    },
    status: false,
    globalFlag,
    environment,
    global: false
  })

  // Verify debug messages
  expect(debugMock).toHaveBeenCalledWith(
    'Lock ownership check - sameUser: false, sameBranch: false'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'Current actor: octocat, Lock owner: monalisa'
  )

  // Verify detailed error message with task information (lines 523-524)
  expect(actionStatusSpy).toHaveBeenCalledWith(
    contextDifferentUser,
    octokitDifferentUser,
    123,
    expect.stringMatching(
      /the `production` environment deployment lock \(task: `migration-v2`\) is currently claimed by __monalisa__/
    )
  )

  // Verify all lock details are present (lines 543-560)
  const errorComment = actionStatusSpy.mock.calls[0][3]
  expect(errorComment).toContain('### ⚠️ Cannot claim deployment lock')
  expect(errorComment).toContain('- __Environment__: `production`')
  expect(errorComment).toContain('- __Branch__: `cool-new-feature`')
  expect(errorComment).toContain('- __PR Number__: `#3`')
  expect(errorComment).toContain('- __Task__: `migration-v2`')
  expect(errorComment).toContain('- __Created By__: `monalisa`')
  expect(errorComment).toContain('- __Sticky__: `true`')
  expect(errorComment).toContain('- __Global__: `false`')
  expect(errorComment).toContain('- __Comment Link__')
  expect(errorComment).toContain('- __Lock Link__')

  expect(setFailedMock).toHaveBeenCalled()
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(debugMock).toHaveBeenCalledWith(
    'the lock was not claimed as it is owned by monalisa'
  )
})

test('Enhanced ownership check: different user trying to claim lock WITHOUT task - shows detailed error', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextDifferentUser = {
    actor: 'octocat', // Different user
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 10
    },
    payload: {
      comment: {
        body: '.lock'
      },
      pull_request: {
        head: {
          ref: 'octocats-feature'
        }
      }
    }
  }

  process.env.GITHUB_SERVER_URL = 'https://github.com'

  // Lock owned by monalisa with task=null (not undefined, so it uses enhanced check)
  const lockBase64MonalisaNoTask =
    'eyJyZWFzb24iOm51bGwsImJyYW5jaCI6ImNvb2wtbmV3LWZlYXR1cmUiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0xNVQyMToxMjoxNC4wNDFaIiwiY3JlYXRlZF9ieSI6Im1vbmFsaXNhIiwic3RpY2t5Ijp0cnVlLCJlbnZpcm9ubWVudCI6InByb2R1Y3Rpb24iLCJ1bmxvY2tfY29tbWFuZCI6Ii51bmxvY2sgcHJvZHVjdGlvbiIsImdsb2JhbCI6ZmFsc2UsImxpbmsiOiJodHRwczovL2dpdGh1Yi5jb20vdGVzdC1vcmcvdGVzdC1yZXBvL3B1bGwvMyNpc3N1ZWNvbW1lbnQtMTIzIiwidGFzayI6bnVsbCwicHJfbnVtYmVyIjozfQo='

  const octokitDifferentUser = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // global lock check
          .mockReturnValueOnce({data: {content: lockBase64MonalisaNoTask}})
      }
    }
  }

  const result = await lock(
    octokitDifferentUser,
    contextDifferentUser,
    'octocats-feature',
    123,
    true, // sticky = true
    environment
  )

  expect(result).toStrictEqual({
    lockData: {
      branch: 'cool-new-feature',
      created_at: '2022-06-15T21:12:14.041Z',
      created_by: 'monalisa',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/3#issuecomment-123',
      reason: null,
      sticky: true,
      unlock_command: '.unlock production',
      task: null,
      pr_number: 3
    },
    status: false,
    globalFlag,
    environment,
    global: false
  })

  // Verify debug messages
  expect(debugMock).toHaveBeenCalledWith(
    'Lock ownership check - sameUser: false, sameBranch: false'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'Current actor: octocat, Lock owner: monalisa'
  )

  // Verify detailed error message WITHOUT task information (lines 534-535)
  expect(actionStatusSpy).toHaveBeenCalledWith(
    contextDifferentUser,
    octokitDifferentUser,
    123,
    expect.stringMatching(
      /the `production` environment deployment lock is currently claimed by __monalisa__/
    )
  )

  // Verify task is not mentioned in the error message
  const errorComment = actionStatusSpy.mock.calls[0][3]
  expect(errorComment).toContain('### ⚠️ Cannot claim deployment lock')
  expect(errorComment).toContain('- __Environment__: `production`')
  expect(errorComment).toContain('- __Branch__: `cool-new-feature`')
  expect(errorComment).toContain('- __PR Number__: `#3`')
  expect(errorComment).toContain('- __Task__: `N/A`') // Task should show as N/A
  expect(errorComment).toContain('- __Created By__: `monalisa`')
  expect(errorComment).toContain('- __Sticky__: `true`')
  expect(errorComment).toContain('- __Global__: `false`')
  expect(errorComment).toContain('- __Comment Link__')
  expect(errorComment).toContain('- __Lock Link__')

  expect(setFailedMock).toHaveBeenCalled()
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(debugMock).toHaveBeenCalledWith(
    'the lock was not claimed as it is owned by monalisa'
  )
})

test('Enhanced ownership check: different user trying to claim global lock - shows detailed error', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextDifferentUser = {
    actor: 'monalisa', // Different user from lock owner
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 10
    },
    payload: {
      comment: {
        body: '.lock --global'
      },
      pull_request: {
        head: {
          ref: 'monalisa-feature'
        }
      }
    }
  }

  process.env.GITHUB_SERVER_URL = 'https://github.com'

  // Global lock owned by octocat with task field
  const lockBase64OctocatGlobalWithTask =
    'eyJyZWFzb24iOiJUZXN0aW5nIG15IG5ldyBmZWF0dXJlIHdpdGggbG90cyBvZiBjYXRzIiwiYnJhbmNoIjoib2N0b2NhdHMtZXZlcnl3aGVyZSIsImNyZWF0ZWRfYXQiOiIyMDIyLTA2LTE0VDIxOjEyOjE0LjA0MVoiLCJjcmVhdGVkX2J5Ijoib2N0b2NhdCIsInN0aWNreSI6dHJ1ZSwiZW52aXJvbm1lbnQiOm51bGwsInVubG9ja19jb21tYW5kIjoiLnVubG9jayAtLWdsb2JhbCIsImdsb2JhbCI6dHJ1ZSwibGluayI6Imh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8yI2lzc3VlY29tbWVudC00NTYiLCJ0YXNrIjoiZGVmYXVsdCIsInByX251bWJlciI6Mn0K'

  const octokitGlobalLock = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockReturnValueOnce({
            data: {content: lockBase64OctocatGlobalWithTask}
          })
      }
    }
  }

  const result = await lock(
    octokitGlobalLock,
    contextDifferentUser,
    'monalisa-feature',
    123,
    true, // sticky = true
    null // global lock
  )

  // When trying to claim the global lock itself and it's owned by someone else,
  // the function returns lockData: null because it's being blocked at line 699
  // This is intentional as the global lock pre-check blocks the request before
  // we get to the detailed error message generation (which happens for env-specific locks)
  expect(result).toStrictEqual({
    lockData: null,
    status: false,
    globalFlag,
    environment: null,
    global: true
  })

  // Verify detailed error message for global lock (lines 514-521)
  // The error is still generated by checkLockOwner even though lockData is null on return
  const errorComment = actionStatusSpy.mock.calls[0][3]
  expect(errorComment).toContain('### ⚠️ Cannot claim deployment lock')
  expect(errorComment).toContain(
    'the `global` deployment lock is currently claimed by __octocat__'
  )
  expect(errorComment).toContain(
    'A `global` deployment lock prevents all other users from deploying to any environment except for the owner of the lock'
  )
  expect(errorComment).not.toContain('- __Environment__:') // Global lock has no environment
  expect(errorComment).toContain('- __Branch__: `octocats-everywhere`')
  expect(errorComment).toContain('- __Global__: `true`')

  expect(setFailedMock).toHaveBeenCalled()
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('Enhanced ownership check: same user, same branch - sticky=false, leaveComment=false (with task)', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextWithPR = {
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 3
    },
    payload: {
      comment: {
        body: '.deploy production'
      },
      pull_request: {
        head: {
          ref: 'cool-new-feature'
        }
      }
    }
  }

  // Lock data with task - same user, same branch
  const lockBase64MonalisaWithTask =
    'eyJyZWFzb24iOm51bGwsImJyYW5jaCI6ImNvb2wtbmV3LWZlYXR1cmUiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0xNVQyMToxMjoxNC4wNDFaIiwiY3JlYXRlZF9ieSI6Im1vbmFsaXNhIiwic3RpY2t5Ijp0cnVlLCJlbnZpcm9ubWVudCI6InByb2R1Y3Rpb24iLCJ1bmxvY2tfY29tbWFuZCI6Ii51bmxvY2sgcHJvZHVjdGlvbiIsImdsb2JhbCI6ZmFsc2UsImxpbmsiOiJodHRwczovL2dpdGh1Yi5jb20vdGVzdC1vcmcvdGVzdC1yZXBvL3B1bGwvMyNpc3N1ZWNvbW1lbnQtMTIzIiwidGFzayI6Im1pZ3JhdGlvbi12MiIsInByX251bWJlciI6M30K'

  const octokitOwnerLock = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // global lock check
          .mockReturnValueOnce({data: {content: lockBase64MonalisaWithTask}})
      }
    }
  }

  const result = await lock(
    octokitOwnerLock,
    contextWithPR,
    'cool-new-feature',
    123,
    false, // sticky = false (not a direct .lock command)
    environment,
    false, // detailsOnly = false
    false, // postDeployStep = false
    false // leaveComment = false
  )

  expect(result).toStrictEqual({
    lockData: {
      branch: 'cool-new-feature',
      created_at: '2022-06-15T21:12:14.041Z',
      created_by: 'monalisa',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/3#issuecomment-123',
      reason: null,
      sticky: true,
      unlock_command: '.unlock production',
      task: 'migration-v2',
      pr_number: 3
    },
    status: 'owner',
    globalFlag,
    environment,
    global: false
  })

  // Verify debug messages for branch comparison (lines 427-438)
  expect(debugMock).toHaveBeenCalledWith(
    'Lock ownership check - sameUser: true, sameBranch: true'
  )

  // Verify info message (line 441-443)
  expect(infoMock).toHaveBeenCalledWith(
    `✅ ${COLORS.highlight}monalisa${COLORS.reset} initiated this request and owns the current lock from the same PR and branch`
  )

  // Verify actionStatus was NOT called because sticky=false or leaveComment=false (line 446 condition)
  expect(actionStatusSpy).not.toHaveBeenCalled()
})

test('Enhanced ownership check: different user with reason in lock - shows reason in error', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextDifferentUser = {
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 10
    },
    payload: {
      comment: {
        body: '.lock'
      },
      pull_request: {
        head: {
          ref: 'monalisa-feature'
        }
      }
    }
  }

  process.env.GITHUB_SERVER_URL = 'https://github.com'

  // Lock owned by octocat with a reason and task
  const lockBase64OctocatWithReasonAndTask =
    'eyJyZWFzb24iOiJUZXN0aW5nIG15IG5ldyBmZWF0dXJlIHdpdGggbG90cyBvZiBjYXRzIiwiYnJhbmNoIjoib2N0b2NhdHMtZXZlcnl3aGVyZSIsImNyZWF0ZWRfYXQiOiIyMDIyLTA2LTE0VDIxOjEyOjE0LjA0MVoiLCJjcmVhdGVkX2J5Ijoib2N0b2NhdCIsInN0aWNreSI6dHJ1ZSwiZW52aXJvbm1lbnQiOiJwcm9kdWN0aW9uIiwidW5sb2NrX2NvbW1hbmQiOiIudW5sb2NrIHByb2R1Y3Rpb24iLCJnbG9iYWwiOmZhbHNlLCJsaW5rIjoiaHR0cHM6Ly9naXRodWIuY29tL3Rlc3Qtb3JnL3Rlc3QtcmVwby9wdWxsLzIjaXNzdWVjb21tZW50LTQ1NiIsInRhc2siOiJkZWZhdWx0IiwicHJfbnVtYmVyIjoyfQo='

  const octokitWithReason = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // global lock check
          .mockReturnValueOnce({
            data: {content: lockBase64OctocatWithReasonAndTask}
          })
      }
    }
  }

  const result = await lock(
    octokitWithReason,
    contextDifferentUser,
    'monalisa-feature',
    123,
    false, // sticky = false (deployment, not lock command)
    environment
  )

  expect(result).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock production',
      task: 'default',
      pr_number: 2
    },
    status: false,
    globalFlag,
    environment,
    global: false
  })

  // Verify reason is included in error message (lines 503-508)
  const errorComment = actionStatusSpy.mock.calls[0][3]
  expect(errorComment).toContain(
    '- __Reason__: `Testing my new feature with lots of cats`'
  )

  expect(setFailedMock).toHaveBeenCalled()
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('Enhanced ownership check: different user with lock WITHOUT task - shows detailed error (covers line 528 else branch)', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextDifferentUser = {
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 10
    },
    payload: {
      comment: {
        body: '.lock'
      },
      pull_request: {
        head: {
          ref: 'monalisa-feature'
        }
      }
    }
  }

  process.env.GITHUB_SERVER_URL = 'https://github.com'

  // Lock owned by octocat WITHOUT task or pr_number fields
  const lockBase64OctocatNoTask =
    'eyJyZWFzb24iOm51bGwsImJyYW5jaCI6Im9jdG9jYXRzLWV2ZXJ5d2hlcmUiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0xNFQyMToxMjoxNC4wNDFaIiwiY3JlYXRlZF9ieSI6Im9jdG9jYXQiLCJzdGlja3kiOnRydWUsImVudmlyb25tZW50IjoicHJvZHVjdGlvbiIsInVubG9ja19jb21tYW5kIjoiLnVubG9jayBwcm9kdWN0aW9uIiwiZ2xvYmFsIjpmYWxzZSwibGluayI6Imh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8yI2lzc3VlY29tbWVudC00NTYifQo='

  const octokitNoTask = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // global lock check
          .mockReturnValueOnce({data: {content: lockBase64OctocatNoTask}})
      }
    }
  }

  const result = await lock(
    octokitNoTask,
    contextDifferentUser,
    'monalisa-feature',
    123,
    false, // sticky = false (deployment, not lock command)
    environment
  )

  expect(result).toStrictEqual({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: null,
      sticky: true,
      unlock_command: '.unlock production'
    },
    status: false,
    globalFlag,
    environment,
    global: false
  })

  // Verify error message does NOT include task text (line 528 else branch - no task)
  const errorComment = actionStatusSpy.mock.calls[0][3]
  expect(errorComment).toContain(
    'the `production` environment deployment lock is currently claimed by __octocat__'
  )
  expect(errorComment).not.toContain('(task:')

  expect(setFailedMock).toHaveBeenCalled()
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('Enhanced ownership check: different user with lock WITH task but WITHOUT pr_number - covers all branch combinations', async () => {
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })

  const contextDifferentUser = {
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 10
    },
    payload: {
      comment: {
        body: '.lock'
      },
      pull_request: {
        head: {
          ref: 'monalisa-feature'
        }
      }
    }
  }

  process.env.GITHUB_SERVER_URL = 'https://github.com'

  // Lock owned by octocat WITH task but WITHOUT pr_number
  const lockBase64WithTaskNoPR =
    'eyJyZWFzb24iOm51bGwsImJyYW5jaCI6Im9jdG9jYXRzLWV2ZXJ5d2hlcmUiLCJjcmVhdGVkX2F0IjoiMjAyMi0wNi0xNFQyMToxMjoxNC4wNDFaIiwiY3JlYXRlZF9ieSI6Im9jdG9jYXQiLCJzdGlja3kiOnRydWUsImVudmlyb25tZW50IjoicHJvZHVjdGlvbiIsInVubG9ja19jb21tYW5kIjoiLnVubG9jayBwcm9kdWN0aW9uIiwiZ2xvYmFsIjpmYWxzZSwibGluayI6Imh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8yI2lzc3VlY29tbWVudC00NTYiLCJ0YXNrIjoiYmFja2VuZCJ9Cg=='

  const octokitWithTaskNoPR = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValueOnce(new NotFoundError('file not found')) // global lock check
          .mockReturnValueOnce({data: {content: lockBase64WithTaskNoPR}})
      }
    }
  }

  const result = await lock(
    octokitWithTaskNoPR,
    contextDifferentUser,
    'monalisa-feature',
    123,
    false, // sticky = false
    environment
  )

  expect(result.status).toBe(false)

  // Verify error message includes task text but pr_number shows as N/A
  const errorComment = actionStatusSpy.mock.calls[0][3]
  expect(errorComment).toContain('(task: `backend`)')
  expect(errorComment).toContain('- __Task__: `backend`')
  expect(errorComment).toContain('- __PR Number__: `#N/A`')

  expect(setFailedMock).toHaveBeenCalled()
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})
