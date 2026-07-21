import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {installModuleMock} from '../node-test-helpers.ts'
import {COLORS} from '../../src/functions/colors.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const color = COLORS.highlight
const colorReset = COLORS.reset
const infoMock = mock.fn<ActionsCore['info']>()
const debugMock = mock.fn<ActionsCore['debug']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  info: infoMock,
  debug: debugMock
})

const {triggerCheck} = await import('../../src/functions/trigger-check.ts')

beforeEach(() => {
  infoMock.mock.resetCalls()
  debugMock.mock.resetCalls()
})

test('checks a message and finds a standard trigger', () => {
  const body = '.deploy'
  const trigger = '.deploy'
  assert.strictEqual(triggerCheck(body, trigger), true)
  assert.deepStrictEqual(
    infoMock.mock.calls.map(call => call.arguments),
    [[`✅ comment body starts with trigger: ${color}.deploy${colorReset}`]]
  )
})

test('checks a message and does not find trigger', () => {
  const body = '.bad'
  const trigger = '.deploy'
  assert.strictEqual(triggerCheck(body, trigger), false)
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [[`comment body does not start with trigger: ${color}.deploy${colorReset}`]]
  )
})

test('checks a message and finds a global trigger', () => {
  const body = 'I want to .deploy'
  const trigger = '.deploy'
  assert.strictEqual(triggerCheck(body, trigger), false)
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [[`comment body does not start with trigger: ${color}.deploy${colorReset}`]]
  )
})

test('checks a message and finds a trigger with an environment and a variable', () => {
  const trigger = '.deploy'
  assert.strictEqual(triggerCheck('.deploy dev something', trigger), true)
  assert.strictEqual(triggerCheck('.deploy something', trigger), true)
  assert.strictEqual(triggerCheck('.deploy dev something', trigger), true)
  assert.strictEqual(triggerCheck('.deploy dev something', trigger), true)
})

test('checks a message and does not find global trigger', () => {
  const body = 'I want to .ping a website'
  const trigger = '.deploy'
  assert.strictEqual(triggerCheck(body, trigger), false)
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [[`comment body does not start with trigger: ${color}.deploy${colorReset}`]]
  )
})

test('does not match when body starts with a longer command sharing prefix', () => {
  const body = '.deploy-two to prod'
  const trigger = '.deploy'
  assert.strictEqual(triggerCheck(body, trigger), false)
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [
      [
        `comment body starts with trigger but is not complete: ${color}.deploy${colorReset}`
      ]
    ]
  )
})

test('does not match when immediately followed by alphanumeric', () => {
  const body = '.deploy1'
  const trigger = '.deploy'
  assert.strictEqual(triggerCheck(body, trigger), false)
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [
      [
        `comment body starts with trigger but is not complete: ${color}.deploy${colorReset}`
      ]
    ]
  )
})

test('matches when followed by a newline (whitespace)', () => {
  const body = `.deploy\ndev`
  const trigger = '.deploy'
  assert.strictEqual(triggerCheck(body, trigger), true)
})

for (const whitespace of ['\t', '\r\n', '\u00a0']) {
  test(`matches when followed by ${JSON.stringify(whitespace)} whitespace`, () => {
    assert.strictEqual(
      triggerCheck(`.deploy${whitespace}production`, '.deploy'),
      true
    )
  })
}

test('treats regex-significant characters in custom triggers literally', () => {
  const trigger = '.deploy[prod]+?'

  assert.strictEqual(triggerCheck(`${trigger} production`, trigger), true)
  assert.strictEqual(triggerCheck('.deployprod production', trigger), false)
  assert.strictEqual(triggerCheck(`${trigger}-canary`, trigger), false)
})
