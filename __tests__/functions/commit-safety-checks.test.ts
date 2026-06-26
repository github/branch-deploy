import {vi, expect, test, beforeEach} from 'vitest'
import {commitSafetyChecks} from '../../src/functions/commit-safety-checks.ts'
import {COLORS} from '../../src/functions/colors.ts'
import * as core from '@actions/core'

vi.mock('../../src/functions/is-timestamp-older.ts', () => ({
  isTimestampOlder: vi.fn()
}))
import {isTimestampOlder} from '../../src/functions/is-timestamp-older.ts'
import {asMock} from '../test-helpers.ts'

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

var data: CommitSafetyFixture
var context: Parameters<typeof commitSafetyChecks>[0]

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

  context = {
    payload: {
      comment: {
        created_at: '2024-10-15T12:00:00Z'
      }
    }
  } as unknown as typeof context

  data = {
    sha: sha,
    commit: {
      author: {
        date: '2024-10-15T11:00:00Z'
      },
      verification: no_verification
    },
    inputs: {
      commit_verification: false
    }
  } as unknown as typeof data
})

test('checks a commit and finds that it is safe (date)', async () => {
  asMock(isTimestampOlder).mockReturnValue(false)
  expect(await commitSafetyChecks(context, data)).toStrictEqual({
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

test('checks a commit and finds that it is safe (date + verification)', async () => {
  asMock(isTimestampOlder).mockReturnValue(false)
  data.inputs.commit_verification = true
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: '2024-10-15T12:00:00Z'
  }
  expect(await commitSafetyChecks(context, data)).toStrictEqual({
    message: 'success',
    status: true,
    isVerified: true
  })
  expect(debugMock).toHaveBeenCalledWith('isVerified: true')
  expect(infoMock).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`
  )
})

test('checks a commit and finds that it is not safe (date)', async () => {
  asMock(isTimestampOlder).mockReturnValue(true)
  data.commit.author.date = '2024-10-15T12:00:01Z'

  expect(await commitSafetyChecks(context, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. It was authored after the trigger comment was created.',
    status: false,
    isVerified: false
  })
  expect(debugMock).toHaveBeenCalledWith('isVerified: false')
})

test('checks a commit and finds that it is not safe (verification)', async () => {
  asMock(isTimestampOlder).mockReturnValue(false)
  data.inputs.commit_verification = true
  data.commit.verification = {
    verified: false,
    reason: 'unsigned',
    signature: null,
    payload: null,
    verified_at: null
  }

  expect(await commitSafetyChecks(context, data)).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`${data.commit.verification.reason}\`\n\n> The commit signature is not valid. Please ensure the commit has been properly signed and try again.`,
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

test('checks a commit and finds that it is not safe (verification time) even though it is verified - rejected due to timestamp', async () => {
  // First call: commit_created_at check (should be false), second call: verified_at check (should be true)
  asMock(isTimestampOlder)
    .mockImplementationOnce(() => false)
    .mockImplementationOnce(() => true)
  data.inputs.commit_verification = true
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: '2024-10-15T12:00:01Z' // occurred after the trigger comment was created
  }

  expect(await commitSafetyChecks(context, data)).toStrictEqual({
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

test('raises an error if the date format is invalid', async () => {
  // Simulate isTimestampOlder throwing
  asMock(isTimestampOlder).mockImplementation(() => {
    throw new Error(
      'Invalid date format. Please ensure the dates are valid UTC timestamps.'
    )
  })
  data.commit.author.date = '2024-10-15T12:00:uhoh'
  await expect(commitSafetyChecks(context, data)).rejects.toThrow(
    'Invalid date format. Please ensure the dates are valid UTC timestamps.'
  )
})

test('throws if context.payload.comment.created_at is missing', async () => {
  const brokenContext = {payload: {comment: {}}} as unknown as Parameters<
    typeof commitSafetyChecks
  >[0]
  await expect(commitSafetyChecks(brokenContext, data)).rejects.toThrow(
    'Missing context.payload.comment.created_at'
  )
})

test('throws if commit.author.date is missing', async () => {
  const brokenData = JSON.parse(JSON.stringify(data)) as unknown as {
    commit: {author: {date?: string}}
  }
  delete brokenData.commit.author.date
  await expect(
    commitSafetyChecks(context, brokenData as unknown as typeof data)
  ).rejects.toThrow('Missing commit.author.date')
})

test('rejects a deployment if commit.verification.verified_at is null and commit_verification is true', async () => {
  asMock(isTimestampOlder).mockReturnValue(false)
  data.inputs.commit_verification = true
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD',
    verified_at: null
  }

  await expect(commitSafetyChecks(context, data)).resolves.toEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`valid\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
    status: false,
    isVerified: true
  })
})

test('rejects a deployment if commit.verification.verified_at is missing and commit_verification is true', async () => {
  asMock(isTimestampOlder).mockReturnValue(false)
  data.inputs.commit_verification = true
  data.commit.verification = {
    verified: true,
    reason: 'valid',
    signature: 'SOME_SIGNATURE',
    payload: 'SOME_PAYLOAD'
  }

  await expect(commitSafetyChecks(context, data)).resolves.toEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`valid\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
    status: false,
    isVerified: true
  })
})

test('isTimestampOlder covers else branch (not older)', async () => {
  asMock(isTimestampOlder).mockReturnValue(false)
  const context = {
    payload: {comment: {created_at: '2024-10-15T12:00:00Z'}}
  } as unknown as Parameters<typeof commitSafetyChecks>[0]
  const data = {
    sha: 'abc123',
    commit: {
      author: {date: '2024-10-15T11:00:00Z'},
      verification: {
        verified: false,
        reason: 'unsigned',
        signature: null,
        payload: null,
        verified_at: null
      }
    },
    inputs: {commit_verification: false}
  } as unknown as Parameters<typeof commitSafetyChecks>[1]
  await commitSafetyChecks(context, data)
  expect(debugMock).toHaveBeenCalledWith('isVerified: false')
})
