import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {installModuleMock} from '../node-test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const debugMock = mock.fn<ActionsCore['debug']>()
const errorMock = mock.fn<ActionsCore['error']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  error: errorMock
})

const {stringToArray} = await import('../../src/functions/string-to-array.ts')

beforeEach(() => {
  debugMock.mock.resetCalls()
  errorMock.mock.resetCalls()
})

test('successfully converts a string to an array', () => {
  assert.deepStrictEqual(stringToArray('production,staging,development'), [
    'production',
    'staging',
    'development'
  ])
})

test('successfully converts a single string item string to an array', () => {
  assert.deepStrictEqual(stringToArray('production,'), ['production'])

  assert.deepStrictEqual(stringToArray('production'), ['production'])
})

test('successfully converts an empty string to an empty array', () => {
  assert.deepStrictEqual(stringToArray(''), [])

  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [
      [
        'in stringToArray(), an empty String was found so an empty Array was returned'
      ]
    ]
  )
})

test('successfully converts garbage to an empty array', () => {
  assert.deepStrictEqual(stringToArray(',,,'), [])
})

test('trims surrounding whitespace and filters empty comma-separated items', () => {
  assert.deepStrictEqual(
    stringToArray(' \tproduction , , staging,\n development,\t '),
    ['production', 'staging', 'development']
  )
})

test('treats whitespace-only input as an empty array', () => {
  assert.deepStrictEqual(stringToArray(' \t\r\n '), [])
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [
      [
        'in stringToArray(), an empty String was found so an empty Array was returned'
      ]
    ]
  )
})

test('throws an error when string processing fails', () => {
  // Pass a non-string value to trigger the error
  assert.throws(
    () =>
      stringToArray(
        unsafeInvalidValue<Parameters<typeof stringToArray>[0]>(null)
      ),
    /could not convert String to Array/
  )
  assert.strictEqual(errorMock.mock.callCount(), 1)
})
