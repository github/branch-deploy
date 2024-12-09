import {commitSafetyChecks} from '../../src/functions/commit-safety-checks'
import {COLORS} from '../../src/functions/colors'
import * as core from '@actions/core'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const infoMock = jest.spyOn(core, 'info').mockImplementation(() => {})
const warningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})
const saveStateMock = jest.spyOn(core, 'saveState').mockImplementation(() => {})
const setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation(() => {})

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
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})

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
  expect(await commitSafetyChecks(context, data)).toStrictEqual({
    message: 'success',
    status: true
  })
  expect(debugMock).toHaveBeenCalledWith(
    '2024-10-15T12:00:00Z is not older than 2024-10-15T11:00:00Z'
  )
  expect(debugMock).toHaveBeenCalledWith('isVerified: false')
  expect(debugMock).toHaveBeenCalledWith(
    `🔑 commit does not contain a verified signature but ${COLORS.highlight}commit signing is not required${COLORS.reset} - ${COLORS.success}OK${COLORS.reset}`
  )
  expect(saveStateMock).toHaveBeenCalledWith('commit_verified', false)
  expect(setOutputMock).toHaveBeenCalledWith('commit_verified', false)
})

test('checks a commit and finds that it is safe (date + verification)', async () => {
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
    status: true
  })
  expect(debugMock).toHaveBeenCalledWith(
    '2024-10-15T12:00:00Z is not older than 2024-10-15T11:00:00Z'
  )
  expect(debugMock).toHaveBeenCalledWith('isVerified: true')
  expect(infoMock).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`
  )
})

test('checks a commit and finds that it is not safe (date)', async () => {
  data.commit.author.date = '2024-10-15T12:00:01Z'

  expect(await commitSafetyChecks(context, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. It was authored after the trigger comment was created.',
    status: false
  })
  expect(debugMock).toHaveBeenCalledWith(
    '2024-10-15T12:00:00Z is older than 2024-10-15T12:00:01Z'
  )
  expect(debugMock).not.toHaveBeenCalledWith('isVerified: false')
})

test('checks a commit and finds that it is not safe (verification)', async () => {
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
    status: false
  })
  expect(debugMock).toHaveBeenCalledWith(
    '2024-10-15T12:00:00Z is not older than 2024-10-15T11:00:00Z'
  )
  expect(debugMock).toHaveBeenCalledWith('isVerified: false')
  expect(warningMock).toHaveBeenCalledWith(
    `🔑 commit signature is ${COLORS.error}invalid${COLORS.reset}`
  )
  expect(saveStateMock).toHaveBeenCalledWith('commit_verified', false)
  expect(setOutputMock).toHaveBeenCalledWith('commit_verified', false)
})

test('raises an error if the date format is invalid', async () => {
  data.commit.author.date = '2024-10-15T12:00:uhoh'
  await expect(commitSafetyChecks(context, data)).rejects.toThrow(
    'Invalid date format. Please ensure the dates are valid UTC timestamps.'
  )
})
