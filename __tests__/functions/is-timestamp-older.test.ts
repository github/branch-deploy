import assert from 'node:assert/strict'
import {beforeEach, describe, mock, test} from 'node:test'
import {installModuleMock} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const debugMock = mock.fn<ActionsCore['debug']>()
const errorMock = mock.fn<ActionsCore['error']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  error: errorMock
})

const {isTimestampOlder} =
  await import('../../src/functions/is-timestamp-older.ts')

beforeEach(() => {
  debugMock.mock.resetCalls()
  errorMock.mock.resetCalls()
})

describe('isTimestampOlder', () => {
  test('throws if timestampA is missing', () => {
    assert.throws(() => isTimestampOlder(undefined, '2024-10-15T11:00:00Z'), {
      message: 'One or both timestamps are missing or empty.'
    })
    assert.throws(() => isTimestampOlder(null, '2024-10-15T11:00:00Z'), {
      message: 'One or both timestamps are missing or empty.'
    })
    assert.throws(() => isTimestampOlder('', '2024-10-15T11:00:00Z'), {
      message: 'One or both timestamps are missing or empty.'
    })
  })

  test('throws if timestampB is missing', () => {
    assert.throws(() => isTimestampOlder('2024-10-15T11:00:00Z', undefined), {
      message: 'One or both timestamps are missing or empty.'
    })
    assert.throws(() => isTimestampOlder('2024-10-15T11:00:00Z', null), {
      message: 'One or both timestamps are missing or empty.'
    })
    assert.throws(() => isTimestampOlder('2024-10-15T11:00:00Z', ''), {
      message: 'One or both timestamps are missing or empty.'
    })
  })

  test('throws if both timestamps are invalid', () => {
    assert.throws(
      () => isTimestampOlder('bad', 'bad'),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    assert.throws(
      () => isTimestampOlder('notadate', '2024-10-15T11:00:00Z'),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    assert.throws(
      () => isTimestampOlder('2024-10-15T11:00:00Z', 'notadate'),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    assert.throws(
      () => isTimestampOlder({}, '2024-10-15T11:00:00Z'),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    assert.throws(
      () => isTimestampOlder('2024-10-15T11:00:00Z', {}),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    assert.throws(
      () => isTimestampOlder([], '2024-10-15T11:00:00Z'),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    assert.throws(
      () => isTimestampOlder('2024-10-15T11:00:00Z', []),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    assert.throws(
      () => isTimestampOlder('2024-10-15T11:00:00Z', 1),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    assert.throws(
      () => isTimestampOlder(1, '2024-10-15T11:00:00Z'),
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
  })

  test('returns true if timestampA is older than timestampB', () => {
    assert.strictEqual(
      isTimestampOlder('2024-10-15T11:00:00Z', '2024-10-16T11:00:00Z'),
      true
    )
    assert.deepStrictEqual(
      debugMock.mock.calls.map(call => call.arguments),
      [['2024-10-15T11:00:00Z is older than 2024-10-16T11:00:00Z']]
    )
  })

  test('returns false if timestampA is newer than timestampB', () => {
    assert.strictEqual(
      isTimestampOlder('2024-10-17T11:00:00Z', '2024-10-16T11:00:00Z'),
      false
    )
    assert.deepStrictEqual(
      debugMock.mock.calls.map(call => call.arguments),
      [['2024-10-17T11:00:00Z is not older than 2024-10-16T11:00:00Z']]
    )
  })

  test('returns false if timestampA equals timestampB', () => {
    assert.strictEqual(
      isTimestampOlder('2024-10-16T11:00:00Z', '2024-10-16T11:00:00Z'),
      false
    )
    assert.deepStrictEqual(
      debugMock.mock.calls.map(call => call.arguments),
      [['2024-10-16T11:00:00Z is not older than 2024-10-16T11:00:00Z']]
    )
  })

  test('accepts valid leap year date', () => {
    // Feb 29, 2024 is valid (leap year)
    isTimestampOlder('2024-02-29T12:00:00Z', '2024-10-15T11:00:00Z')
    assert.strictEqual(
      isTimestampOlder('2024-02-29T12:00:00Z', '2024-10-15T11:00:00Z'),
      true
    )
    assert.strictEqual(
      isTimestampOlder('2024-10-15T11:00:00Z', '2024-02-29T12:00:00Z'),
      false
    )
  })

  test('throws an error on js silent date contructor corrections', () => {
    // Invalid date: 2024-02-30T12:00:00Z actually becomes 2024-03-01T12:00:00Z (gross)
    assert.throws(
      () => isTimestampOlder('2024-02-30T12:00:00Z', '2024-10-15T11:00:00Z'),
      /Invalid date format/
    )
    assert.throws(
      () => isTimestampOlder('2024-10-15T11:00:00Z', '2024-02-30T12:00:00Z'),
      /Invalid date format/
    )
  })
})
