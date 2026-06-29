import {vi, expect, test, beforeEach} from 'vitest'
import {commitSafetyChecks} from '../../src/functions/commit-safety-checks.ts'
import {COLORS} from '../../src/functions/colors.ts'
import * as core from '../../src/actions-core.ts'
import {
  createActionInputs,
  createContext,
  createIssueCommentContext
} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

vi.mock(import('../../src/functions/is-timestamp-older.ts'), () => ({
  isTimestampOlder: vi.fn()
}))
import {isTimestampOlder} from '../../src/functions/is-timestamp-older.ts'

const debugMock = vi.spyOn(core, 'debug')
const infoMock = vi.spyOn(core, 'info')
const warningMock = vi.spyOn(core, 'warning')
const saveStateMock = vi.spyOn(core, 'saveState')
const setOutputMock = vi.spyOn(core, 'setOutput')

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
  vi.clearAllMocks()
  debugMock.mockClear()
  infoMock.mockClear()
  warningMock.mockClear()
  saveStateMock.mockClear()
  setOutputMock.mockClear()

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
  vi.mocked(isTimestampOlder).mockReturnValue(false)
  expect(commitSafetyChecks(context, data)).toStrictEqual({
    message: 'success',
    status: true,
    isVerified: false
  })
  expect(debugMock).toHaveBeenCalledWith('isVerified: false')
  expect(debugMock).toHaveBeenCalledWith(
    `🔑 commit does not contain a verified signature but ${COLORS.highlight}commit signing is not required${COLORS.reset} - ${COLORS.success}OK${COLORS.reset}`
  )
  expect(saveStateMock).toHaveBeenCalledWith('commit_verified', false)
  expect(setOutputMock).toHaveBeenCalledWith('commit_verified', false)
})

test('checks a commit and finds that it is safe (date + verification)', () => {
  vi.mocked(isTimestampOlder).mockReturnValue(false)
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: '2024-10-15T12:00:00Z'
  }
  expect(commitSafetyChecks(context, data)).toStrictEqual({
    message: 'success',
    status: true,
    isVerified: true
  })
  expect(debugMock).toHaveBeenCalledWith('isVerified: true')
  expect(infoMock).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`
  )
})

test('checks a commit and finds that it is not safe (date)', () => {
  vi.mocked(isTimestampOlder).mockReturnValue(true)
  data.commit.author.date = '2024-10-15T12:00:01Z'

  expect(commitSafetyChecks(context, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. It was authored after the trigger comment was created.',
    status: false,
    isVerified: false
  })
  expect(debugMock).toHaveBeenCalledWith('isVerified: false')
})

test('checks a commit and finds that it is not safe (verification)', () => {
  vi.mocked(isTimestampOlder).mockReturnValue(false)
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = {
    verified: false,
    reason: 'unsigned',
    signature: null,
    payload: null,
    verified_at: null
  }

  expect(commitSafetyChecks(context, data)).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`unsigned\`\n\n> The commit signature is not valid. Please ensure the commit has been properly signed and try again.`,
    status: false,
    isVerified: false
  })
  expect(debugMock).toHaveBeenCalledWith('isVerified: false')
  expect(warningMock).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.error}invalid${COLORS.reset}`
  )
  expect(saveStateMock).toHaveBeenCalledWith('commit_verified', false)
  expect(setOutputMock).toHaveBeenCalledWith('commit_verified', false)
})

test('checks a commit and finds that it is not safe (verification time) even though it is verified - rejected due to timestamp', () => {
  // First call: commit_created_at check (should be false), second call: verified_at check (should be true)
  vi.mocked(isTimestampOlder)
    .mockImplementationOnce(() => false)
    .mockImplementationOnce(() => true)
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: '2024-10-15T12:00:01Z' // occurred after the trigger comment was created
  }

  expect(commitSafetyChecks(context, data)).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. The commit signature was verified after the trigger comment was created. Please try again if you recently pushed a new commit.`,
    status: false,
    isVerified: true
  })
  expect(debugMock).toHaveBeenCalledWith('isVerified: true')
  expect(infoMock).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`
  )
  expect(saveStateMock).toHaveBeenCalledWith('commit_verified', true)
  expect(setOutputMock).toHaveBeenCalledWith('commit_verified', true)
})

test('raises an error if the date format is invalid', () => {
  // Simulate isTimestampOlder throwing
  vi.mocked(isTimestampOlder).mockImplementation(() => {
    throw new Error(
      'Invalid date format. Please ensure the dates are valid UTC timestamps.'
    )
  })
  data.commit.author.date = '2024-10-15T12:00:uhoh'
  expect(() => commitSafetyChecks(context, data)).toThrow(
    'Invalid date format. Please ensure the dates are valid UTC timestamps.'
  )
})

test('throws if context.payload.comment.created_at is missing', () => {
  const brokenContext = createContext({payload: {comment: {}}})
  expect(() => commitSafetyChecks(brokenContext, data)).toThrow(
    'Missing context.payload.comment.created_at'
  )
})

test.each([null, undefined])(
  'preserves the missing-comment error when the webhook payload is %s',
  payload => {
    const brokenContext = unsafeInvalidValue<
      Parameters<typeof commitSafetyChecks>[0]
    >({...context, payload})
    expect(() => commitSafetyChecks(brokenContext, data)).toThrow(
      'Missing context.payload.comment.created_at'
    )
  }
)

test('throws if commit.author.date is missing', () => {
  const brokenData: Parameters<typeof commitSafetyChecks>[1] = {
    ...data,
    commit: {
      ...data.commit,
      author: {}
    }
  }
  expect(() => commitSafetyChecks(context, brokenData)).toThrow(
    'Missing commit.author.date'
  )
})

test.each([null, undefined])(
  'preserves the missing-author error when the external commit is %s',
  commit => {
    expect(() => commitSafetyChecks(context, {...data, commit})).toThrow(
      'Missing commit.author.date'
    )
  }
)

test.each([false, 0])(
  'preserves the missing-comment error for the falsy external timestamp %s',
  createdAt => {
    const brokenContext = createIssueCommentContext({
      payload: {
        comment: {created_at: unsafeInvalidValue<string>(createdAt)}
      }
    })
    expect(() => commitSafetyChecks(brokenContext, data)).toThrow(
      'Missing context.payload.comment.created_at'
    )
  }
)

test.each([false, 0])(
  'preserves the missing-author error for the falsy external timestamp %s',
  date => {
    const brokenData: Parameters<typeof commitSafetyChecks>[1] = {
      ...data,
      commit: {
        ...data.commit,
        author: {date: unsafeInvalidValue<string>(date)}
      }
    }
    expect(() => commitSafetyChecks(context, brokenData)).toThrow(
      'Missing commit.author.date'
    )
  }
)

test('rejects a deployment if commit.verification.verified_at is null and commit_verification is true', () => {
  vi.mocked(isTimestampOlder).mockReturnValue(false)
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: null
  }

  expect(commitSafetyChecks(context, data)).toEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`valid\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
    status: false,
    isVerified: true
  })
})

test.each([false, 0])(
  'preserves the invalid-verification result for the falsy external timestamp %s',
  verifiedAt => {
    vi.mocked(isTimestampOlder).mockReturnValue(false)
    data = {...data, inputs: createActionInputs({commit_verification: true})}
    data.commit.verification = {
      verified: true,
      reason: 'valid',
      verified_at: unsafeInvalidValue<string>(verifiedAt)
    }

    expect(commitSafetyChecks(context, data)).toEqual({
      message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`valid\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
      status: false,
      isVerified: true
    })
  }
)

test('rejects a deployment if commit.verification.verified_at is missing and commit_verification is true', () => {
  vi.mocked(isTimestampOlder).mockReturnValue(false)
  data = {...data, inputs: createActionInputs({commit_verification: true})}
  data.commit.verification = unsafeInvalidValue<
    NonNullable<typeof data.commit.verification>
  >({
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD'
  })

  expect(commitSafetyChecks(context, data)).toEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`valid\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
    status: false,
    isVerified: true
  })
})

test('isTimestampOlder covers else branch (not older)', () => {
  vi.mocked(isTimestampOlder).mockReturnValue(false)
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
  expect(debugMock).toHaveBeenCalledWith('isVerified: false')
})
