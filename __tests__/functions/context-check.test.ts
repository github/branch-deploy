import {contextCheck} from '../../src/functions/context-check.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import * as core from '../../src/actions-core.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

const warningMock = vi.spyOn(core, 'warning')
const saveStateMock = vi.spyOn(core, 'saveState')

let context: Parameters<typeof contextCheck>[0]
beforeEach(() => {
  vi.clearAllMocks()

  context = createIssueCommentContext({
    eventName: 'issue_comment',
    payload: {
      issue: {
        number: 1,
        pull_request: {}
      }
    }
  })
})

test('checks the event context and finds that it is valid', () => {
  expect(contextCheck(context)).toBe(true)
})

test('checks the event context and finds that it is invalid', () => {
  context = createIssueCommentContext({
    eventName: 'push',
    payload: {issue: {number: 1, pull_request: {}}}
  })
  expect(contextCheck(context)).toBe(false)
  expect(warningMock).toHaveBeenCalledWith(
    'This Action can only be run in the context of a pull request comment'
  )
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('checks the event context and throws an error', () => {
  expect(() =>
    contextCheck(unsafeInvalidValue<Parameters<typeof contextCheck>[0]>('evil'))
  ).toThrow(
    "Could not get PR event context: TypeError: Cannot read properties of undefined (reading 'issue')"
  )
})
