const {test, expect, jest, beforeEach} = require('@jest/globals')

const {
  commitSafetyChecks
} = require('../../src/functions/commit-safety-checks.js')
const {COLORS} = require('../../src/functions/colors.js')

jest.mock('../../src/functions/is-timestamp-older.js', () => ({
  isTimestampOlder: jest.fn()
}))
const {isTimestampOlder} = require('../../src/functions/is-timestamp-older.js')

const debugMock = jest
  .spyOn(require('@actions/core'), 'debug')
  .mockImplementation(() => {})
const infoMock = jest
  .spyOn(require('@actions/core'), 'info')
  .mockImplementation(() => {})
const warningMock = jest
  .spyOn(require('@actions/core'), 'warning')
  .mockImplementation(() => {})
const saveStateMock = jest
  .spyOn(require('@actions/core'), 'saveState')
  .mockImplementation(() => {})
const setOutputMock = jest
  .spyOn(require('@actions/core'), 'setOutput')
  .mockImplementation(() => {})

var data
var context

const no_verification = {
  verified: false,
  reason: 'unsigned',
  signature: null,
  payload: null,
  verified_at: null
}

const sha = 'abc123'

beforeEach(() => {
  jest.clearAllMocks()

  context = {
    payload: {
      comment: {
        created_at: '2024-10-15T12:00:00Z'
      }
    }
  }

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
  }
})

test('checks a commit and finds that it is safe (date)', async () => {
  isTimestampOlder.mockReturnValue(false)
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

// Test data setup
var data
var context

const no_verification = {
  verified: false,
  reason: 'unsigned',
  signature: null,
  payload: null,
  verified_at: null
}

const sha = 'abc123'

beforeEach(() => {
  jest.clearAllMocks()

  context = {
    payload: {
      comment: {
        created_at: '2024-10-15T12:00:00Z'
      }
    }
  }

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
  }
})

test('checks a commit and finds that it is safe (date)', async () => {
  isTimestampOlder.mockReturnValue(false)
  expect(await commitSafetyChecks(context, data)).toStrictEqual({
    message: 'success',
    status: true,
    isVerified: false
  })
  expect(core.debug).toHaveBeenCalledWith('isVerified: false')
  expect(core.debug).toHaveBeenCalledWith(
    `🔑 commit does not contain a verified signature but ${COLORS.highlight}commit signing is not required${COLORS.reset} - ${COLORS.success}OK${COLORS.reset}`
  )
  expect(core.saveState).toHaveBeenCalledWith('commit_verified', false)
  expect(core.setOutput).toHaveBeenCalledWith('commit_verified', false)
})

test('checks a commit and finds that it is safe (date + verification)', async () => {
  isTimestampOlder.mockReturnValue(false)
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
  expect(core.debug).toHaveBeenCalledWith('isVerified: true')
  expect(core.info).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`
  )
})

test('checks a commit and finds that it is not safe (date)', async () => {
  isTimestampOlder.mockReturnValue(true)
  data.commit.author.date = '2024-10-15T12:00:01Z'

  expect(await commitSafetyChecks(context, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. It was authored after the trigger comment was created.',
    status: false,
    isVerified: false
  })
  expect(core.debug).toHaveBeenCalledWith('isVerified: false')
})

test('checks a commit and finds that it is not safe (verification)', async () => {
  isTimestampOlder.mockReturnValue(false)
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
  expect(core.debug).toHaveBeenCalledWith('isVerified: false')
  expect(core.warning).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.error}invalid${COLORS.reset}`
  )
  expect(core.saveState).toHaveBeenCalledWith('commit_verified', false)
  expect(core.setOutput).toHaveBeenCalledWith('commit_verified', false)
})

test('checks a commit and finds that it is not safe (verification time) even though it is verified - rejected due to timestamp', async () => {
  // First call: commit_created_at check (should be false), second call: verified_at check (should be true)
  isTimestampOlder
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
  expect(core.debug).toHaveBeenCalledWith('isVerified: true')
  expect(core.info).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`
  )
  expect(core.saveState).toHaveBeenCalledWith('commit_verified', true)
  expect(core.setOutput).toHaveBeenCalledWith('commit_verified', true)
})

test('raises an error if the date format is invalid', async () => {
  // Simulate isTimestampOlder throwing
  isTimestampOlder.mockImplementation(() => {
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
  const brokenContext = {payload: {comment: {}}}
  await expect(commitSafetyChecks(brokenContext, data)).rejects.toThrow(
    'Missing context.payload.comment.created_at'
  )
})

test('throws if commit.author.date is missing', async () => {
  const brokenData = JSON.parse(JSON.stringify(data))
  delete brokenData.commit.author.date
  await expect(commitSafetyChecks(context, brokenData)).rejects.toThrow(
    'Missing commit.author.date'
  )
})

test('rejects a deployment if commit.verification.verified_at is null and commit_verification is true', async () => {
  isTimestampOlder.mockReturnValue(false)
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
  isTimestampOlder.mockReturnValue(false)
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
  isTimestampOlder.mockReturnValue(false)
  const context = {payload: {comment: {created_at: '2024-10-15T12:00:00Z'}}}
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
  }
  await commitSafetyChecks(context, data)
  expect(core.debug).toHaveBeenCalledWith('isVerified: false')
})
