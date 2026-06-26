import * as core from '@actions/core'
import {vi, expect, test, beforeEach} from 'vitest'
import {lock} from '../../src/functions/lock.ts'
import {COLORS} from '../../src/functions/colors.ts'
import * as actionStatus from '../../src/functions/action-status.ts'
import {asMock} from '../test-helpers.ts'

class NotFoundError extends Error {
  declare status: number

  constructor(message: string) {
    super(message)
    this.status = 404
  }
}

class BigBadError extends Error {
  declare status: number

  constructor(message: string) {
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

type TestMock = ReturnType<typeof vi.fn>
type TestLock = (...args: unknown[]) => ReturnType<typeof lock>

interface ExpectedLockData {
  branch: string
  created_at: string
  created_by: string
  environment: string | null
  global: boolean
  link: string
  reason: string | null
  sticky: boolean
  unlock_command: string
}

interface ExpectedLockResponse {
  environment: string | null
  global: boolean
  globalFlag: string
  lockData: ExpectedLockData | null
  status: boolean | null | string
}

interface TestLockOctokit {
  rest: {
    git: {createRef: TestMock}
    issues: {createComment: TestMock}
    repos: {
      createOrUpdateFileContents: TestMock
      get: TestMock
      getBranch: TestMock
      getContent: TestMock
    }
  }
}

interface TestExistingLockOctokit {
  rest: {
    repos: {
      get: TestMock
      getBranch: TestMock
      getContent: TestMock
    }
  }
}

var octokit: TestLockOctokit
var octokitOtherUserHasLock: TestExistingLockOctokit
var createdLock: ExpectedLockResponse
var monalisaOwner: ExpectedLockResponse
var noLockFound: ExpectedLockResponse
var failedToCreateLock: ExpectedLockResponse

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
    await (lock as TestLock)(octokit, context, ref, 123, false, environment)
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
  const actionStatusSpy = asMock(
    vi.spyOn(actionStatus, 'actionStatus')
  ).mockImplementation(() => {
    return undefined
  })
  expect(
    await (lock as TestLock)(
      octokitOtherUserHasLock,
      context,
      ref,
      123,
      false,
      environment
    )
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
  const actionStatusSpy = asMock(
    vi.spyOn(actionStatus, 'actionStatus')
  ).mockImplementation(() => {
    return undefined
  })
  expect(
    await (lock as TestLock)(
      octokitOtherUserHasLock,
      context,
      ref,
      123,
      false,
      environment
    )
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
  const actionStatusSpy = asMock(
    vi.spyOn(actionStatus, 'actionStatus')
  ).mockImplementation(() => {
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
  expect(
    await (lock as TestLock)(octokit, context, ref, 123, true, null)
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
  expect(actionStatusSpy.mock.calls[0]![3]).toContain(
    '- __Reason__:\n\n      Testing my new feature with lots of cats'
  )
})

test('Determines that another user has the lock (non-global) and exits - during a direct lock claim with .lock', async () => {
  const actionStatusSpy = asMock(
    vi.spyOn(actionStatus, 'actionStatus')
  ).mockImplementation(() => {
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
    await (lock as TestLock)(octokit, context, ref, 123, true, environment)
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

test('renders a stored multiline lock reason as inert code when another user encounters the lock', async () => {
  const collisionEnvironment = '__BRANCH_DEPLOY_LOCK_REASON__'
  const injectedReason =
    'routine `\n\n## Deployment approved\n[continue](https://example.com)'
  const lockData = {
    branch: 'octocats-everywhere',
    created_at: '2022-06-14T21:12:14.041Z',
    created_by: 'octocat',
    environment: collisionEnvironment,
    global: false,
    link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
    reason: injectedReason,
    sticky: true,
    unlock_command: `.unlock ${collisionEnvironment}`
  }
  const actionStatusSpy = asMock(
    vi.spyOn(actionStatus, 'actionStatus')
  ).mockImplementation(() => undefined)
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
          .mockReturnValueOnce({
            data: {
              content: Buffer.from(JSON.stringify(lockData)).toString('base64')
            }
          })
      }
    }
  }

  expect(
    await (lock as TestLock)(
      octokit,
      context,
      ref,
      123,
      false,
      collisionEnvironment
    )
  ).toMatchObject({status: false, lockData})

  const comment = actionStatusSpy.mock.calls[0]![3]
  expect(comment).toContain(
    '- __Reason__:\n\n      routine `\n      \n      ## Deployment approved\n      [continue](https://example.com)\n\n- __Environment__: `__BRANCH_DEPLOY_LOCK_REASON__`'
  )
  expect(comment).not.toContain('\n## Deployment approved')
  expect(comment).not.toContain('\n[continue](https://example.com)')
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
    await (lock as TestLock)(
      octokit,
      context,
      ref,
      123,
      null,
      environment,
      true
    )
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
    await (lock as TestLock)(
      octokit,
      context,
      ref,
      123,
      null,
      environment,
      true
    )
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
    await (lock as TestLock)(octokit, context, ref, 123, null, null, true)
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
    await (lock as TestLock)(octokit, context, ref, 123, null, null, true)
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
    await (lock as TestLock)(octokit, context, ref, 123, null, null, true)
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
    await (lock as TestLock)(octokit, context, ref, 123, null, null, true)
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
    await (lock as TestLock)(
      octokit,
      context,
      ref,
      123,
      null,
      environment,
      true
    )
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
    await (lock as TestLock)(
      octokit,
      context,
      ref,
      123,
      null,
      environment,
      true
    )
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
    await (lock as TestLock)(
      octokit,
      context,
      ref,
      123,
      null,
      environment,
      true
    )
  } catch (error) {
    expect(errorMock).toHaveBeenCalledWith(
      'an unexpected status code was returned while checking for the lock branch'
    )
    expect((error as Error).message).toBe('Error: oh no - 500')
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
    await (lock as TestLock)(octokit, context, ref, 123, false, environment)
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
    await (lock as TestLock)(octokit, context, ref, 123, true, environment)
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
    await (lock as TestLock)(octokit, context, ref, 123, true, environment)
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
    await (lock as TestLock)(octokit, context, ref, 123, false, environment)
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
  expect(
    await (lock as TestLock)(octokit, context, ref, 123, true, null)
  ).toStrictEqual({
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
    await (lock as TestLock)(octokit, context, ref, 123, true, environment)
  } catch (error) {
    expect((error as Error).message).toBe(
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
    await (lock as TestLock)(octokit, context, ref, 123, false, environment)
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
    await (lock as TestLock)(octokit, context, ref, 123, true, environment)
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
    await (lock as TestLock)(octokit, context, ref, 123, true, environment)
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
  expect(
    await (lock as TestLock)(octokit, context, ref, 123, true, null)
  ).toStrictEqual(createdLock)
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
  expect(
    await (lock as TestLock)(octokit, context, ref, 123, true, null)
  ).toStrictEqual(createdLock)
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
  expect(
    await (lock as TestLock)(octokit, context, ref, 123, true, null)
  ).toStrictEqual(createdLock)
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
  expect(
    await (lock as TestLock)(octokit, context, ref, 123, true, null)
  ).toStrictEqual(createdLock)
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
  expect(
    await (lock as TestLock)(octokit, context, ref, 123, true)
  ).toStrictEqual(createdLock)
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
    await (lock as TestLock)(octokit, context, ref, 123, true, environment)
  } catch (e) {
    expect((e as Error).message).toBe('Error: oh no')
  }
})
