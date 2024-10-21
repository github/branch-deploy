import {commitSafetyChecks} from '../../src/functions/commit-safety-checks'
import * as core from '@actions/core'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})

var data
var context
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'debug').mockImplementation(() => {})

  context = {
    payload: {
      comment: {
        created_at: '2024-10-15T12:00:00Z'
      }
    }
  }

  data = {
    commit: {
      author: {
        date: '2024-10-15T11:00:00Z'
      }
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
})

test('raises an error if the date format is invalid', async () => {
  data.commit.author.date = '2024-10-15T12:00:uhoh'
  await expect(commitSafetyChecks(context, data)).rejects.toThrow(
    'Invalid date format. Please ensure the dates are valid UTC timestamps.'
  )
})
