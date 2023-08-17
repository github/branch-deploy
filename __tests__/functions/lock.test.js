import * as core from '@actions/core'
import {lock} from '../../src/functions/lock'
import {COLORS} from '../../src/functions/colors'
import * as actionStatus from '../../src/functions/action-status'

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

const lockBase64OctocatGlobal =
  'ewogICAgInJlYXNvbiI6ICJUZXN0aW5nIG15IG5ldyBmZWF0dXJlIHdpdGggbG90cyBvZiBjYXRzIiwKICAgICJicmFuY2giOiAib2N0b2NhdHMtZXZlcnl3aGVyZSIsCiAgICAiY3JlYXRlZF9hdCI6ICIyMDIyLTA2LTE0VDIxOjEyOjE0LjA0MVoiLAogICAgImNyZWF0ZWRfYnkiOiAib2N0b2NhdCIsCiAgICAic3RpY2t5IjogdHJ1ZSwKICAgICJlbnZpcm9ubWVudCI6IG51bGwsCiAgICAidW5sb2NrX2NvbW1hbmQiOiAiLnVubG9jayAtLWdsb2JhbCIsCiAgICAiZ2xvYmFsIjogdHJ1ZSwKICAgICJsaW5rIjogImh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8yI2lzc3VlY29tbWVudC00NTYiCn0K'

const saveStateMock = jest.spyOn(core, 'saveState')
const setFailedMock = jest.spyOn(core, 'setFailed')
const infoMock = jest.spyOn(core, 'info')
const debugMock = jest.spyOn(core, 'debug')
const errorMock = jest.spyOn(core, 'error')

var octokit
var octokitOtherUserHasLock
var createdLock
var monalisaOwner
var noLockFound
var failedToCreateLock

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'error').mockImplementation(() => {})

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

  octokitOtherUserHasLock = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
  const actionStatusSpy = jest
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
  const actionStatusSpy = jest
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
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })
  const octokit = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
  const actionStatusSpy = jest
    .spyOn(actionStatus, 'actionStatus')
    .mockImplementation(() => {
      return undefined
    })
  const octokit = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValue(new NotFoundError('file not found')),
        createOrUpdateFileContents: jest.fn().mockReturnValue({})
      },
      issues: {
        createComment: jest.fn().mockReturnValue({})
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
        getBranch: jest
          .fn()
          .mockRejectedValueOnce(new BigBadError('oh no - 500')),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        createOrUpdateFileContents: jest.fn().mockReturnValue({}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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

test('Determines that the lock request is coming from current owner of the lock (GLOBAL lock) and exits - sticky', async () => {
  context.actor = 'octocat'
  context.payload.comment.body = '.lock --global'
  const octokit = {
    rest: {
      repos: {
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest.fn().mockReturnValue({data: {content: null}})
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
        getBranch: jest
          .fn()
          .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
        get: jest.fn().mockReturnValue({data: {default_branch: 'main'}}),
        getContent: jest
          .fn()
          .mockRejectedValue(new NotFoundError('file not found')),
        createOrUpdateFileContents: jest.fn().mockReturnValue({})
      },
      issues: {
        createComment: jest.fn().mockReturnValue({})
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

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file with a --reason', async () => {
  context.payload.comment.body = '.lock --reason because something is broken'
  expect(await lock(octokit, context, ref, 123, true, null)).toStrictEqual(
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
        getBranch: jest.fn().mockRejectedValueOnce(new Error('oh no')),
        getContent: jest.fn().mockRejectedValue(new Error('oh no'))
      }
    }
  }
  try {
    await lock(octokit, context, ref, 123, true, environment)
  } catch (e) {
    expect(e.message).toBe('Error: oh no')
  }
})
