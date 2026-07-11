import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {installModuleMock} from '../node-test-helpers.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const warningMock = mock.fn<ActionsCore['warning']>()
const saveStateMock = mock.fn<ActionsCore['saveState']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  warning: warningMock,
  saveState: saveStateMock
})

const {contextCheck} = await import('../../src/functions/context-check.ts')

let context: Parameters<typeof contextCheck>[0]
beforeEach(() => {
  warningMock.mock.resetCalls()
  saveStateMock.mock.resetCalls()

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
  assert.strictEqual(contextCheck(context), true)
})

test('checks the event context and finds that it is invalid', () => {
  context = createIssueCommentContext({
    eventName: 'push',
    payload: {issue: {number: 1, pull_request: {}}}
  })
  assert.strictEqual(contextCheck(context), false)
  assert.deepStrictEqual(
    warningMock.mock.calls.map(call => call.arguments),
    [['This Action can only be run in the context of a pull request comment']]
  )
  assert.deepStrictEqual(
    saveStateMock.mock.calls.map(call => call.arguments),
    [['bypass', 'true']]
  )
})

test('safely rejects a malformed event context', () => {
  assert.strictEqual(
    contextCheck(
      unsafeInvalidValue<Parameters<typeof contextCheck>[0]>('evil')
    ),
    false
  )
})
