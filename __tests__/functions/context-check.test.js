import { contextCheck } from '../../src/functions/context-check'
import * as core from '@actions/core'

const goodContext = {
  eventName: 'issue_comment',
  payload: {
    issue: {
      pull_request: {
      }
    }
  },
  pull_request: {
    number: 1
  }
}

const badContext = {
  payload: {
    issue: {
      pull_request: {
      }
    }
  },
  eventName: 'push'
}

test('checks the event context and finds that it is valid', async () => {
  expect(await contextCheck(goodContext)).toBe(true)
})

test('checks the event context and finds that it is invalid', async () => {
  const setFailedMock = jest.spyOn(core, 'setFailed')
  expect(await contextCheck(badContext)).toBe(false)
  expect(setFailedMock).toHaveBeenCalledWith('This Action can only be run in the context of a pull request comment')
})

test('checks the event context and throws an error', async () => {
  try {
    await contextCheck("evil")
  } catch (e) {
    expect(e.message).toBe("Could not get PR event context: TypeError: Cannot read properties of undefined (reading 'issue')");
  }
})
