import {contextCheck} from '../../src/functions/context-check'
import * as core from '@actions/core'

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
})

const goodContext = {
  eventName: 'issue_comment',
  payload: {
    issue: {
      pull_request: {}
    }
  },
  pull_request: {
    number: 1
  }
}

const badContext = {
  payload: {
    issue: {
      pull_request: {}
    }
  },
  eventName: 'push'
}

test('checks the event context and finds that it is valid', async () => {
  expect(await contextCheck(goodContext)).toBe(true)
})

test('checks the event context and finds that it is invalid', async () => {
  const warningMock = jest.spyOn(core, 'warning')
  const saveStateMock = jest.spyOn(core, 'saveState')
  expect(await contextCheck(badContext)).toBe(false)
  expect(warningMock).toHaveBeenCalledWith(
    'This Action can only be run in the context of a pull request comment'
  )
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('checks the event context and throws an error', async () => {
  try {
    await contextCheck('evil')
  } catch (e) {
    expect(e.message).toBe(
      "Could not get PR event context: TypeError: Cannot read properties of undefined (reading 'issue')"
    )
  }
})
