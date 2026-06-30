import assert from 'node:assert/strict'
import {after, beforeEach, mock, test, type Mock} from 'node:test'
import type {InputOptions} from '../../src/actions-core.ts'
import type {LockOctokit, LockRequest} from '../../src/functions/lock.ts'
import {COLORS} from '../../src/functions/colors.ts'
import type {ActionStatusRequest} from '../../src/functions/action-status.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  installModuleMock,
  queueMockImplementation
} from '../node-test-helpers.ts'
import type {
  IssueCommentContext,
  LockData,
  LockResponse
} from '../../src/types.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const debugMock = createMock<ActionsCore['debug']>(() => undefined)
const errorMock = createMock<ActionsCore['error']>(() => undefined)
const infoMock = createMock<ActionsCore['info']>(() => undefined)
const saveStateMock = createMock<ActionsCore['saveState']>(() => undefined)
const setFailedMock = createMock<ActionsCore['setFailed']>(() => undefined)
const setOutputMock = createMock<ActionsCore['setOutput']>(() => undefined)
const actionStatusMock = createMock<
  (request: ActionStatusRequest) => Promise<void>
>(() => Promise.resolve())

function getInput(name: string, options?: InputOptions): string {
  const value =
    process.env[`INPUT_${name.replace(/ /gu, '_').toUpperCase()}`] ?? ''
  if (options?.required === true && value === '') {
    throw new Error(`Input required and not supplied: ${name}`)
  }
  return options?.trimWhitespace === false ? value : value.trim()
}

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  error: errorMock,
  getInput,
  info: infoMock,
  saveState: saveStateMock,
  setFailed: setFailedMock,
  setOutput: setOutputMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/action-status.ts', import.meta.url),
  {actionStatus: actionStatusMock}
)

const {lock} = await import('../../src/functions/lock.ts')

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

interface LockOctokitOverrides {
  readonly git?: Partial<LockOctokit['rest']['git']>
  readonly issues?: Partial<LockOctokit['rest']['issues']>
  readonly reactions?: Partial<LockOctokit['rest']['reactions']>
  readonly repos?: Partial<LockOctokit['rest']['repos']>
}

type GetBranch = LockOctokit['rest']['repos']['getBranch']
type GetBranchResult = Awaited<ReturnType<GetBranch>>
type GetContent = LockOctokit['rest']['repos']['getContent']
type GetContentResult = Awaited<ReturnType<GetContent>>

function mockGetBranch(
  ...outcomes: readonly (GetBranchResult | Error)[]
): Mock<GetBranch> {
  let call = 0
  return createMock<GetBranch>(() => {
    const outcome = outcomes[Math.min(call++, outcomes.length - 1)]
    if (outcome instanceof Error) {
      return Promise.reject(outcome)
    }
    return Promise.resolve(outcome ?? {data: {commit: {sha: 'abc123'}}})
  })
}

function mockGetContent(
  ...outcomes: readonly (GetContentResult | Error)[]
): Mock<GetContent> {
  let call = 0
  return createMock<GetContent>(() => {
    const outcome = outcomes[Math.min(call++, outcomes.length - 1)]
    if (outcome instanceof Error) {
      return Promise.reject(outcome)
    }
    return Promise.resolve(outcome ?? {data: undefined})
  })
}

function createLockOctokit(overrides: LockOctokitOverrides = {}): LockOctokit {
  return {
    rest: {
      git: {
        createRef: createMock<LockOctokit['rest']['git']['createRef']>(() =>
          Promise.resolve(undefined)
        ),
        ...overrides.git
      },
      issues: {
        createComment: createMock<
          LockOctokit['rest']['issues']['createComment']
        >(() => Promise.resolve(undefined)),
        ...overrides.issues
      },
      reactions: {
        createForIssueComment: createMock<
          LockOctokit['rest']['reactions']['createForIssueComment']
        >(() => Promise.resolve(undefined)),
        deleteForIssueComment: createMock<
          LockOctokit['rest']['reactions']['deleteForIssueComment']
        >(() => Promise.resolve(undefined)),
        ...overrides.reactions
      },
      repos: {
        createOrUpdateFileContents: createMock<
          LockOctokit['rest']['repos']['createOrUpdateFileContents']
        >(() => Promise.resolve(undefined)),
        get: createMock<LockOctokit['rest']['repos']['get']>(() =>
          Promise.resolve({data: {default_branch: 'main'}})
        ),
        getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
          Promise.resolve({data: {commit: {sha: 'abc123'}}})
        ),
        getContent: createMock<LockOctokit['rest']['repos']['getContent']>(() =>
          Promise.resolve({data: {content: lockBase64Octocat}})
        ),
        ...overrides.repos
      }
    }
  } satisfies LockOctokit
}

function contextFor(body: string, actor = 'monalisa'): IssueCommentContext {
  return createIssueCommentContext({
    actor,
    issue: {number: 1},
    payload: {comment: {body, id: 123}},
    repo: {owner: 'corp', repo: 'test'}
  })
}

let context: IssueCommentContext
let octokit: LockOctokit
let octokitOtherUserHasLock: LockOctokit
let createdLock: LockResponse
let monalisaOwner: LockResponse
let noLockFound: LockResponse
let failedToCreateLock: LockResponse

function lockRequest(overrides: Partial<LockRequest> = {}): LockRequest {
  return {
    context,
    environment,
    leaveComment: true,
    mode: {postDeployStep: false, type: 'acquire'},
    octokit,
    reactionId: 123,
    ref: 'cool-new-feature',
    sticky: false,
    ...overrides
  }
}

function latestActionStatusRequest(): ActionStatusRequest {
  const call = actionStatusMock.mock.calls.at(-1)
  assert.ok(call !== undefined, 'expected actionStatus to have been called')
  return call.arguments[0]
}

function assertSetFailedMatches(pattern: RegExp): void {
  assert.ok(
    setFailedMock.mock.calls.some(call => {
      const message = call.arguments[0]
      return typeof message === 'string' && pattern.test(message)
    }),
    `expected setFailed to have been called with ${String(pattern)}`
  )
}

const inputEnvironment = {
  INPUT_ENVIRONMENT: 'production',
  INPUT_GLOBAL_LOCK_FLAG: '--global',
  INPUT_LOCK_INFO_ALIAS: '.wcid',
  INPUT_LOCK_TRIGGER: '.lock'
} as const
const originalInputEnvironment = new Map(
  Object.keys(inputEnvironment).map(name => [name, process.env[name]])
)

after(() => {
  for (const [name, value] of originalInputEnvironment) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
})

beforeEach(() => {
  for (const mockFunction of [
    actionStatusMock,
    debugMock,
    errorMock,
    infoMock,
    saveStateMock,
    setFailedMock,
    setOutputMock
  ]) {
    mockFunction.mock.resetCalls()
  }
  actionStatusMock.mock.mockImplementation(() => Promise.resolve())

  for (const [name, value] of Object.entries(inputEnvironment)) {
    process.env[name] = value
  }

  createdLock = {
    lockData: null,
    status: true,
    globalFlag,
    environment,
    global: false
  } satisfies LockResponse
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
  } satisfies LockResponse
  noLockFound = {
    lockData: null,
    status: null,
    globalFlag,
    environment,
    global: false
  } satisfies LockResponse
  failedToCreateLock = {
    lockData: null,
    status: false,
    globalFlag,
    environment,
    global: false
  } satisfies LockResponse

  context = contextFor('.lock')
  const getBranch = createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
    Promise.resolve({data: {commit: {sha: 'abc123'}}})
  )
  queueMockImplementation(
    getBranch,
    () => Promise.reject(new NotFoundError('Reference does not exist')),
    () => Promise.resolve({data: {commit: {sha: 'abc123'}}})
  )
  octokit = createLockOctokit({
    repos: {
      getBranch,
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      createOrUpdateFileContents: createMock<
        LockOctokit['rest']['repos']['createOrUpdateFileContents']
      >(() => Promise.resolve({})),
      getContent: createMock<LockOctokit['rest']['repos']['getContent']>(() =>
        Promise.reject(new NotFoundError('file not found'))
      )
    },
    git: {
      createRef: createMock<LockOctokit['rest']['git']['createRef']>(() =>
        Promise.resolve({status: 201})
      )
    },
    issues: {
      createComment: createMock<LockOctokit['rest']['issues']['createComment']>(
        () => Promise.resolve({})
      )
    }
  })

  const otherUserGetContent = createMock<
    LockOctokit['rest']['repos']['getContent']
  >(() => Promise.resolve({data: {content: lockBase64Octocat}}))
  queueMockImplementation(otherUserGetContent, () =>
    Promise.resolve({data: {content: lockBase64Octocat}})
  )
  octokitOtherUserHasLock = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: otherUserGetContent
    }
  })
})

test('successfully obtains a deployment lock (non-sticky) by creating the branch and lock file', async () => {
  assert.deepStrictEqual(await lock(lockRequest()), createdLock)
  assertCalledWith(
    infoMock,
    `🔒 created lock branch: ${COLORS.highlight}production-branch-deploy-lock`
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Determines that another user has the lock (GLOBAL) and exits - during a lock claim on deployment', async () => {
  assert.deepStrictEqual(
    await lock(lockRequest({octokit: octokitOtherUserHasLock})),
    failedToCreateLock
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  const request = latestActionStatusRequest()
  assert.strictEqual(request.context, context)
  assert.strictEqual(request.octokit, octokitOtherUserHasLock)
  assert.strictEqual(request.reactionId, 123)
  assert.match(
    request.message,
    /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
  )
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertSetFailedMatches(
    /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
  )
})

test('Determines that another user has the lock (non-global) and exits - during a lock claim on deployment', async () => {
  assert.deepStrictEqual(
    await lock(lockRequest({octokit: octokitOtherUserHasLock})),
    failedToCreateLock
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  const request = latestActionStatusRequest()
  assert.strictEqual(request.context, context)
  assert.strictEqual(request.octokit, octokitOtherUserHasLock)
  assert.strictEqual(request.reactionId, 123)
  assert.match(
    request.message,
    /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
  )
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertSetFailedMatches(
    /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
  )
})

test('preserves strict global handling for malformed lock JSON', async () => {
  const malformedLockData = {
    branch: 'octocats-everywhere',
    created_at: '2022-06-14T21:12:14.041Z',
    created_by: 'octocat',
    environment: 'production',
    global: 'false',
    link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
    reason: null,
    sticky: true,
    unlock_command: '.unlock production'
  }
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found'), {
        data: {
          content: Buffer.from(JSON.stringify(malformedLockData)).toString(
            'base64'
          )
        }
      })
    }
  })

  const result = await lock(lockRequest({octokit}))
  assert.strictEqual(result.status, false)
  const message = latestActionStatusRequest().message
  assert.ok(message.includes('the `production` environment deployment lock'))
  assert.ok(!message.includes('the `global` deployment lock'))
})

test('Determines that another user has the lock (GLOBAL) and exits - during a direct lock claim with .lock --global', async () => {
  context = contextFor('.lock --global')
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found'), {
        data: {content: lockBase64OctocatGlobal}
      })
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({context, environment: null, octokit, sticky: true})
    ),
    {
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
    }
  )
  assertCalledWith(debugMock, `detected lock env: null`)
  assertCalledWith(debugMock, `detected lock global: true`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: global-branch-deploy-lock`
  )
  const request = latestActionStatusRequest()
  assert.strictEqual(request.context, context)
  assert.strictEqual(request.octokit, octokit)
  assert.strictEqual(request.reactionId, 123)
  assert.match(
    request.message,
    /Sorry __monalisa__, the `global` deployment lock is currently claimed by __octocat__/
  )
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertSetFailedMatches(/Cannot claim deployment lock/)
  assert.ok(
    request.message.includes(
      '- __Reason__:\n\n      Testing my new feature with lots of cats'
    )
  )
})

test('Determines that another user has the lock (non-global) and exits - during a direct lock claim with .lock', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found'), {
        data: {content: lockBase64Octocat}
      })
    }
  })
  assert.deepStrictEqual(await lock(lockRequest({octokit, sticky: true})), {
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
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  const request = latestActionStatusRequest()
  assert.strictEqual(request.context, context)
  assert.strictEqual(request.octokit, octokit)
  assert.strictEqual(request.reactionId, 123)
  assert.match(
    request.message,
    /Sorry __monalisa__, the `production` environment deployment lock is currently claimed by __octocat__/
  )
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertSetFailedMatches(/Cannot claim deployment lock/)
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
  } satisfies LockData
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found'), {
        data: {
          content: Buffer.from(JSON.stringify(lockData)).toString('base64')
        }
      })
    }
  })

  const result = await lock(
    lockRequest({environment: collisionEnvironment, octokit})
  )
  assert.strictEqual(result.status, false)
  assert.deepStrictEqual(result.lockData, lockData)

  const comment = latestActionStatusRequest().message
  assert.ok(
    comment.includes(
      '- __Reason__:\n\n      routine `\n      \n      ## Deployment approved\n      [continue](https://example.com)\n\n- __Environment__: `__BRANCH_DEPLOY_LOCK_REASON__`'
    )
  )
  assert.ok(!comment.includes('\n## Deployment approved'))
  assert.ok(!comment.includes('\n[continue](https://example.com)'))
})

test('Request detailsOnly on the lock file and gets lock file data successfully', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      // The global lookup fails before the environment lock is found.
      getContent: mockGetContent(new NotFoundError('file not found'), {
        data: {content: lockBase64Octocat}
      })
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    {
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
    }
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully - global lock', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found'), {
        data: {content: lockBase64OctocatGlobal}
      })
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    {
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
    }
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully -- .wcid', async () => {
  context = contextFor('.wcid')

  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found'), {
        data: {content: lockBase64Octocat}
      })
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({
        context,
        environment: null,
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    {
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
    }
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully -- .wcid --global', async () => {
  context = contextFor('.wcid --global')

  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent({
        data: {content: lockBase64OctocatGlobal}
      })
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({
        context,
        environment: null,
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    {
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
    }
  )
  assertCalledWith(debugMock, `detected lock env: null`)
  assertCalledWith(debugMock, `detected lock global: true`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: global-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and does not find a lock --global', async () => {
  context = contextFor('.lock -i --global')

  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found'))
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({
        context,
        environment: null,
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    {
      lockData: null,
      status: null,
      environment: null,
      globalFlag,
      global: true
    }
  )
  assertCalledWith(debugMock, `detected lock env: null`)
  assertCalledWith(debugMock, `detected lock global: true`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: global-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file and gets lock file data successfully with --details flag', async () => {
  context = contextFor('.lock --details')

  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found'), {
        data: {content: lockBase64Octocat}
      })
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({
        context,
        environment: null,
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    {
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
    }
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file when the lock branch exists but no lock file exists', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found')),
      createOrUpdateFileContents: createMock<
        LockOctokit['rest']['repos']['createOrUpdateFileContents']
      >(() => Promise.resolve({}))
    },
    issues: {
      createComment: createMock<LockOctokit['rest']['issues']['createComment']>(
        () => Promise.resolve({})
      )
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    noLockFound
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('preserves legacy truthiness for malformed falsy global lock JSON', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(
        {data: {content: Buffer.from('null').toString('base64')}},
        new NotFoundError('file not found')
      )
    }
  })

  assert.deepStrictEqual(
    await lock(
      lockRequest({
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    noLockFound
  )
})

test('Request detailsOnly on the lock file when no branch exists', async () => {
  context = contextFor('.lock --details')
  const octokit = createLockOctokit({
    repos: {
      getBranch: mockGetBranch(new NotFoundError('Reference does not exist'), {
        data: {commit: {sha: 'abc123'}}
      }),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      createOrUpdateFileContents: createMock<
        LockOctokit['rest']['repos']['createOrUpdateFileContents']
      >(() => Promise.resolve({})),
      getContent: mockGetContent(new NotFoundError('file not found'))
    },
    git: {
      createRef: createMock<LockOctokit['rest']['git']['createRef']>(() =>
        Promise.resolve({status: 201})
      )
    },
    issues: {
      createComment: createMock<LockOctokit['rest']['issues']['createComment']>(
        () => Promise.resolve({})
      )
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({
        context,
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    noLockFound
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Request detailsOnly on the lock file when no branch exists and hits an error when trying to check the branch', async () => {
  context = contextFor('.lock --details')
  const octokit = createLockOctokit({
    repos: {
      getBranch: mockGetBranch(new BigBadError('oh no - 500')),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      createOrUpdateFileContents: createMock<
        LockOctokit['rest']['repos']['createOrUpdateFileContents']
      >(() => Promise.resolve({})),
      getContent: mockGetContent(new NotFoundError('file not found'))
    }
  })

  await assert.rejects(
    lock(
      lockRequest({
        context,
        mode: {postDeployStep: false, type: 'details'},
        octokit,
        sticky: null
      })
    ),
    /Error: oh no - 500/u
  )
  assertCalledWith(
    errorMock,
    'an unexpected status code was returned while checking for the lock branch'
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Determines that the lock request is coming from current owner of the lock and exits - non-sticky', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent({data: {content: lockBase64Monalisa}})
    }
  })
  assert.deepStrictEqual(await lock(lockRequest({octokit})), monalisaOwner)
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  assertCalledWith(
    infoMock,
    `✅ ${COLORS.highlight}monalisa${COLORS.reset} initiated this request and is also the owner of the current lock`
  )
})

test('Determines that the lock request is coming from current owner of the lock and exits - sticky', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent({data: {content: lockBase64Monalisa}})
    }
  })
  assert.deepStrictEqual(
    await lock(lockRequest({octokit, sticky: true})),
    monalisaOwner
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  assertCalledWith(
    infoMock,
    `✅ ${COLORS.highlight}monalisa${COLORS.reset} initiated this request and is also the owner of the current lock`
  )
})

test('checks a lock and finds that it is from another owner and that no reason was set - it was a lock for the production environment', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent({
        data: {content: lockBase64OctocatNoReason}
      })
    }
  })
  assert.deepStrictEqual(await lock(lockRequest({octokit, sticky: true})), {
    environment: 'production',
    global: false,
    globalFlag: '--global',
    lockData: null,
    status: false
  })
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  assertCalledWith(debugMock, `no reason detected`)
  assertCalledWith(
    debugMock,
    `the lock was not claimed as it is owned by octocat`
  )
})

test('checks a lock and finds that it is from another owner and that no reason was set - it was a lock for the production environment and sticky is set to false', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent({
        data: {content: lockBase64OctocatNoReason}
      })
    }
  })
  assert.deepStrictEqual(await lock(lockRequest({octokit})), {
    environment: 'production',
    global: false,
    globalFlag: '--global',
    lockData: null,
    status: false
  })
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  assertCalledWith(debugMock, `no reason detected`)
  assertCalledWith(
    debugMock,
    `the lock was not claimed as it is owned by octocat`
  )
})

test('Determines that the lock request is coming from current owner of the lock (GLOBAL lock) and exits - sticky', async () => {
  context = contextFor('.lock --global', 'octocat')
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent({data: {content: lockBase64OctocatGlobal}})
    }
  })
  assert.deepStrictEqual(
    await lock(
      lockRequest({context, environment: null, octokit, sticky: true})
    ),
    {
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
    }
  )
  assertCalledWith(debugMock, `detected lock env: null`)
  assertCalledWith(debugMock, `detected lock global: true`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: global-branch-deploy-lock`
  )
  assertCalledWith(
    infoMock,
    `✅ ${COLORS.highlight}octocat${COLORS.reset} initiated this request and is also the owner of the current lock`
  )
})

test('fails to decode the lock file contents', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent({data: {content: null}})
    }
  })

  await assert.rejects(
    lock(lockRequest({octokit, sticky: true})),
    /The first argument must be of type string or an instance of Buffer/u
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
})

test('Creates a lock when the lock branch exists but no lock file exists', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: createMock<LockOctokit['rest']['repos']['getBranch']>(() =>
        Promise.resolve({data: {commit: {sha: 'abc123'}}})
      ),
      get: createMock<LockOctokit['rest']['repos']['get']>(() =>
        Promise.resolve({data: {default_branch: 'main'}})
      ),
      getContent: mockGetContent(new NotFoundError('file not found')),
      createOrUpdateFileContents: createMock<
        LockOctokit['rest']['repos']['createOrUpdateFileContents']
      >(() => Promise.resolve({}))
    },
    issues: {
      createComment: createMock<LockOctokit['rest']['issues']['createComment']>(
        () => Promise.resolve({})
      )
    }
  })
  assert.deepStrictEqual(await lock(lockRequest({octokit})), createdLock)
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  assertCalledWith(infoMock, '✅ deployment lock obtained')
})

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file - with a --reason', async () => {
  context = contextFor('.lock --reason testing a super cool new feature')
  assert.deepStrictEqual(
    await lock(lockRequest({context, sticky: true})),
    createdLock
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  assertCalledWith(infoMock, '✅ deployment lock obtained')
  assertCalledWith(infoMock, `🍯 deployment lock is ${COLORS.highlight}sticky`)
  assertCalledWith(
    infoMock,
    `🔒 created lock branch: ${COLORS.highlight}production-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file - with an empty --reason', async () => {
  context = contextFor('.lock --reason ')
  assert.deepStrictEqual(
    await lock(lockRequest({context, sticky: true})),
    createdLock
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  assertCalledWith(infoMock, '✅ deployment lock obtained')
  assertCalledWith(infoMock, `🍯 deployment lock is ${COLORS.highlight}sticky`)
  assertCalledWith(
    infoMock,
    `🔒 created lock branch: ${COLORS.highlight}production-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky and global) by creating the branch and lock file', async () => {
  context = contextFor('.lock --global')
  assert.deepStrictEqual(
    await lock(lockRequest({context, environment: null, sticky: true})),
    {...createdLock, environment: null, global: true}
  )
  assertCalledWith(debugMock, `detected lock env: null`)
  assertCalledWith(debugMock, `detected lock global: true`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: global-branch-deploy-lock`
  )
  assertCalledWith(
    infoMock,
    `🌎 this is a request for a ${COLORS.highlight}global${COLORS.reset} deployment lock`
  )
  assertCalledWith(infoMock, '✅ deployment lock obtained')
  assertCalledWith(infoMock, `🍯 deployment lock is ${COLORS.highlight}sticky`)
  assertCalledWith(
    infoMock,
    `🔒 created lock branch: ${COLORS.highlight}global-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky and global) by creating the branch and lock file with a --reason', async () => {
  context = contextFor('.lock --reason because something is broken --global')
  assert.deepStrictEqual(
    await lock(lockRequest({context, environment: null, sticky: true})),
    {...createdLock, environment: null, global: true}
  )
  assertCalledWith(debugMock, `detected lock env: null`)
  assertCalledWith(debugMock, `detected lock global: true`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: global-branch-deploy-lock`
  )
  assertCalledWith(debugMock, 'reason: because something is broken')
  assertCalledWith(
    infoMock,
    `🌎 this is a request for a ${COLORS.highlight}global${COLORS.reset} deployment lock`
  )
  assertCalledWith(infoMock, '✅ deployment lock obtained')
  assertCalledWith(infoMock, `🍯 deployment lock is ${COLORS.highlight}sticky`)
  assertCalledWith(
    infoMock,
    `🔒 created lock branch: ${COLORS.highlight}global-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky and global) by creating the branch and lock file with a --reason at the end of the string', async () => {
  context = contextFor(
    '.lock --global  --reason because something is broken badly  '
  )
  assert.deepStrictEqual(
    await lock(lockRequest({context, environment: null, sticky: true})),
    {...createdLock, environment: null, global: true}
  )
  assertCalledWith(debugMock, 'reason: because something is broken badly')
  assertCalledWith(debugMock, `detected lock env: null`)
  assertCalledWith(debugMock, `detected lock global: true`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: global-branch-deploy-lock`
  )
  assertCalledWith(
    infoMock,
    `🌎 this is a request for a ${COLORS.highlight}global${COLORS.reset} deployment lock`
  )
  assertCalledWith(infoMock, '✅ deployment lock obtained')
  assertCalledWith(infoMock, `🍯 deployment lock is ${COLORS.highlight}sticky`)
  assertCalledWith(
    infoMock,
    `🔒 created lock branch: ${COLORS.highlight}global-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file with a --reason at the end of the string', async () => {
  context = contextFor(
    '.lock development  --reason because something is broken badly  '
  )
  assert.deepStrictEqual(
    await lock(lockRequest({context, environment: null, sticky: true})),
    {...createdLock, environment: 'development'}
  )
  assertCalledWith(debugMock, `detected lock env: development`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: development-branch-deploy-lock`
  )
  assertCalledWith(debugMock, 'reason: because something is broken badly')
  assertCalledWith(infoMock, '✅ deployment lock obtained')
  assertCalledWith(infoMock, `🍯 deployment lock is ${COLORS.highlight}sticky`)
  assertCalledWith(
    infoMock,
    `🔒 created lock branch: ${COLORS.highlight}development-branch-deploy-lock`
  )
})

test('successfully obtains a deployment lock (sticky) by creating the branch and lock file with a --reason and assuming a null environment to start (but it is production)', async () => {
  context = contextFor('.lock --reason because something is broken')
  assert.deepStrictEqual(
    await lock(lockRequest({context, environment: null, sticky: true})),
    createdLock
  )
  assertCalledWith(debugMock, `detected lock env: ${environment}`)
  assertCalledWith(debugMock, `detected lock global: false`)
  assertCalledWith(
    debugMock,
    `constructed lock branch name: ${environment}-branch-deploy-lock`
  )
  assertCalledWith(debugMock, 'reason: because something is broken')
  assertCalledWith(infoMock, '✅ deployment lock obtained')
  assertCalledWith(infoMock, `🍯 deployment lock is ${COLORS.highlight}sticky`)
  assertCalledWith(
    infoMock,
    `🔒 created lock branch: ${COLORS.highlight}production-branch-deploy-lock`
  )
})

test('throws an error if an unhandled exception occurs', async () => {
  const octokit = createLockOctokit({
    repos: {
      getBranch: mockGetBranch(new Error('oh no')),
      getContent: mockGetContent(new Error('oh no'))
    }
  })

  await assert.rejects(
    lock(lockRequest({octokit, sticky: true})),
    /Error: oh no/u
  )
})
