import {contextCheck} from '../../src/functions/context-check'
import * as core from '@actions/core'

const warningMock = jest.spyOn(core, 'warning')
const saveStateMock = jest.spyOn(core, 'saveState')

var context
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})

  context = {
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
})

test('checks the event context and finds that it is valid', async () => {
  expect(await contextCheck(context)).toBe(true)
})

test('checks the event context and finds that it is invalid', async () => {
  context.eventName = 'push'
  expect(await contextCheck(context)).toBe(false)
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
