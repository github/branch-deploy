import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import {
  createActionInputs,
  createContext,
  createIssueCommentContext
} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'
import {
  assertCalledWith,
  createMock,
  queueMockImplementation,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type IsTimestampOlder =
  typeof import('../../src/functions/is-timestamp-older.ts')

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const warningMock = createMock<ActionsCore['warning']>()
const saveStateMock = createMock<ActionsCore['saveState']>()
const setOutputMock = createMock<ActionsCore['setOutput']>()
const isTimestampOlderMock = createMock<IsTimestampOlder['isTimestampOlder']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  info: infoMock,
  warning: warningMock,
  saveState: saveStateMock,
  setOutput: setOutputMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/is-timestamp-older.ts', import.meta.url),
  {isTimestampOlder: isTimestampOlderMock}
)

const {commitSafetyChecks} =
  await import('../../src/functions/commit-safety-checks.ts')

type CommitSafetyFixture = Parameters<typeof commitSafetyChecks>[1] & {
  commit: {
    author: {date: string}
    verification: {
      payload?: string | null
      reason?: string | null
      signature?: string | null
      verified?: boolean
      verified_at?: string | null
    }
  }
}

let data: CommitSafetyFixture
let context: Parameters<typeof commitSafetyChecks>[0]

const no_verification = {
  verified: false,
  reason: 'unsigned',
  signature: null,
  payload: null,
  verified_at: null
}

const sha = 'abc123'

beforeEach(() => {
  for (const mockFunction of [
    debugMock,
    infoMock,
    warningMock,
    saveStateMock,
    setOutputMock,
    isTimestampOlderMock
  ]) {
    mockFunction.mock.resetCalls()
  }
  isTimestampOlderMock.mock.mockImplementation(() => false)

  context = createIssueCommentContext({
    payload: {comment: {created_at: '2024-10-15T12:00:00Z'}}
  })

  data = {
    sha: sha,
    commit: {
      author: {
        date: '2024-10-15T11:00:00Z'
      },
      verification: no_verification
    },
    inputs: createActionInputs({commit_verification: false})
  }
})

test('checks a commit and finds that it is safe (date)', () => {
  assert.deepStrictEqual(commitSafetyChecks(context, data), {
    message: 'success',
    status: true,
    isVerified: false
  })
  assertCalledWith(debugMock, 'isVerified: false')
  assertCalledWith(
    debugMock,
    `🔑 commit does not contain a verified signature but ${COLORS.highlight}commit signing is not required${COLORS.reset} - ${COLORS.success}OK${COLORS.reset}`
  )
  assertCalledWith(saveStateMock, 'commit_verified', false)
  assertCalledWith(setOutputMock, 'commit_verified', false)
})

test('checks a commit and finds that it is safe (date + verification)', () => {
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: '2024-10-15T12:00:00Z'
  }
  assert.deepStrictEqual(commitSafetyChecks(context, data), {
    message: 'success',
    status: true,
    isVerified: true
  })
  assertCalledWith(debugMock, 'isVerified: true')
  assertCalledWith(
    infoMock,
    `🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`
  )
})

test('checks a commit and finds that it is not safe (date)', () => {
  isTimestampOlderMock.mock.mockImplementation(() => true)
  data.commit.author.date = '2024-10-15T12:00:01Z'

  assert.deepStrictEqual(commitSafetyChecks(context, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. It was authored after the trigger comment was created.',
    status: false,
    isVerified: false
  })
  assertCalledWith(debugMock, 'isVerified: false')
})

test('checks a commit and finds that it is not safe (verification)', () => {
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = {
    verified: false,
    reason: 'unsigned',
    signature: null,
    payload: null,
    verified_at: null
  }

  assert.deepStrictEqual(commitSafetyChecks(context, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`unsigned\`\n\n> The commit signature is not valid. Please ensure the commit has been properly signed and try again.`,
    status: false,
    isVerified: false
  })
  assertCalledWith(debugMock, 'isVerified: false')
  assertCalledWith(
    warningMock,
    `🔑 commit signature is ${COLORS.error}invalid${COLORS.reset}`
  )
  assertCalledWith(saveStateMock, 'commit_verified', false)
  assertCalledWith(setOutputMock, 'commit_verified', false)
})

test('checks a commit and finds that it is not safe (verification time) even though it is verified - rejected due to timestamp', () => {
  // First call: commit_created_at check (should be false), second call: verified_at check (should be true)
  queueMockImplementation(
    isTimestampOlderMock,
    () => false,
    () => true
  )
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: '2024-10-15T12:00:01Z' // occurred after the trigger comment was created
  }

  assert.deepStrictEqual(commitSafetyChecks(context, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. The commit signature was verified after the trigger comment was created. Please try again if you recently pushed a new commit.`,
    status: false,
    isVerified: true
  })
  assertCalledWith(debugMock, 'isVerified: true')
  assertCalledWith(
    infoMock,
    `🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`
  )
  assertCalledWith(saveStateMock, 'commit_verified', true)
  assertCalledWith(setOutputMock, 'commit_verified', true)
})

test('raises an error if the date format is invalid', () => {
  // Simulate isTimestampOlder throwing
  isTimestampOlderMock.mock.mockImplementation(() => {
    throw new Error(
      'Invalid date format. Please ensure the dates are valid UTC timestamps.'
    )
  })
  data.commit.author.date = '2024-10-15T12:00:uhoh'
  assert.throws(() => commitSafetyChecks(context, data), {
    message:
      'Invalid date format. Please ensure the dates are valid UTC timestamps.'
  })
})

test('throws if context.payload.comment.created_at is missing', () => {
  const brokenContext = createContext({payload: {comment: {}}})
  assert.throws(() => commitSafetyChecks(brokenContext, data), {
    message: 'Missing context.payload.comment.created_at'
  })
})

for (const payload of [null, undefined]) {
  test(`preserves the missing-comment error when the webhook payload is ${String(payload)}`, () => {
    const brokenContext = unsafeInvalidValue<
      Parameters<typeof commitSafetyChecks>[0]
    >({...context, payload})
    assert.throws(() => commitSafetyChecks(brokenContext, data), {
      message: 'Missing context.payload.comment.created_at'
    })
  })
}

test('throws if commit.author.date is missing', () => {
  const brokenData: Parameters<typeof commitSafetyChecks>[1] = {
    ...data,
    commit: {
      ...data.commit,
      author: {}
    }
  }
  assert.throws(() => commitSafetyChecks(context, brokenData), {
    message: 'Missing commit.author.date'
  })
})

for (const commit of [null, undefined]) {
  test(`preserves the missing-author error when the external commit is ${String(commit)}`, () => {
    assert.throws(() => commitSafetyChecks(context, {...data, commit}), {
      message: 'Missing commit.author.date'
    })
  })
}

for (const createdAt of [false, 0]) {
  test(`preserves the missing-comment error for the falsy external timestamp ${String(createdAt)}`, () => {
    const brokenContext = createIssueCommentContext({
      payload: {
        comment: {created_at: unsafeInvalidValue<string>(createdAt)}
      }
    })
    assert.throws(() => commitSafetyChecks(brokenContext, data), {
      message: 'Missing context.payload.comment.created_at'
    })
  })
}

for (const date of [false, 0]) {
  test(`preserves the missing-author error for the falsy external timestamp ${String(date)}`, () => {
    const brokenData: Parameters<typeof commitSafetyChecks>[1] = {
      ...data,
      commit: {
        ...data.commit,
        author: {date: unsafeInvalidValue<string>(date)}
      }
    }
    assert.throws(() => commitSafetyChecks(context, brokenData), {
      message: 'Missing commit.author.date'
    })
  })
}

test('rejects a deployment if commit.verification.verified_at is null and commit_verification is true', () => {
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: null
  }

  assert.deepStrictEqual(commitSafetyChecks(context, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`valid\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
    status: false,
    isVerified: true
  })
})

for (const verifiedAt of [false, 0]) {
  test(`preserves the invalid-verification result for the falsy external timestamp ${String(verifiedAt)}`, () => {
    data = {...data, inputs: createActionInputs({commit_verification: true})}
    data.commit.verification = {
      verified: true,
      reason: 'valid',
      verified_at: unsafeInvalidValue<string>(verifiedAt)
    }

    assert.deepStrictEqual(commitSafetyChecks(context, data), {
      message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`valid\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
      status: false,
      isVerified: true
    })
  })
}

test('rejects a deployment if commit.verification.verified_at is missing and commit_verification is true', () => {
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = unsafeInvalidValue<
    NonNullable<typeof data.commit.verification>
  >({
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD'
  })

  assert.deepStrictEqual(commitSafetyChecks(context, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`valid\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
    status: false,
    isVerified: true
  })
})

test('isTimestampOlder covers else branch (not older)', () => {
  const context = createIssueCommentContext({
    payload: {comment: {created_at: '2024-10-15T12:00:00Z'}}
  })
  const data: Parameters<typeof commitSafetyChecks>[1] = {
    sha: 'abc123',
    commit: {
      author: {date: '2024-10-15T11:00:00Z'},
      verification: {
        verified: false,
        reason: 'unsigned',
        verified_at: null
      }
    },
    inputs: createActionInputs({commit_verification: false})
  }
  commitSafetyChecks(context, data)
  assertCalledWith(debugMock, 'isVerified: false')
})
