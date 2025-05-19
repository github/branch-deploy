import { describe, test, expect, jest, beforeEach } from '@jest/globals';

import * as core from '@actions/core'
import {isTimestampOlder} from '../../src/functions/is-timestamp-older.js.js'

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'error').mockImplementation(() => {})
})

describe('isTimestampOlder', () => {
  test('throws if timestampA is missing', () => {
    expect(() => isTimestampOlder(undefined, '2024-10-15T11:00:00Z')).toThrow(
      'One or both timestamps are missing or empty.'
    )
    expect(() => isTimestampOlder(null, '2024-10-15T11:00:00Z')).toThrow(
      'One or both timestamps are missing or empty.'
    )
    expect(() => isTimestampOlder('', '2024-10-15T11:00:00Z')).toThrow(
      'One or both timestamps are missing or empty.'
    )
  })

  test('throws if timestampB is missing', () => {
    expect(() => isTimestampOlder('2024-10-15T11:00:00Z', undefined)).toThrow(
      'One or both timestamps are missing or empty.'
    )
    expect(() => isTimestampOlder('2024-10-15T11:00:00Z', null)).toThrow(
      'One or both timestamps are missing or empty.'
    )
    expect(() => isTimestampOlder('2024-10-15T11:00:00Z', '')).toThrow(
      'One or both timestamps are missing or empty.'
    )
  })

  test('throws if both timestamps are invalid', () => {
    expect(() => isTimestampOlder('bad', 'bad')).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    expect(() => isTimestampOlder('notadate', '2024-10-15T11:00:00Z')).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    expect(() => isTimestampOlder('2024-10-15T11:00:00Z', 'notadate')).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    expect(() => isTimestampOlder({}, '2024-10-15T11:00:00Z')).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    expect(() => isTimestampOlder('2024-10-15T11:00:00Z', {})).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    expect(() => isTimestampOlder([], '2024-10-15T11:00:00Z')).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    expect(() => isTimestampOlder('2024-10-15T11:00:00Z', [])).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    expect(() => isTimestampOlder('2024-10-15T11:00:00Z', 1)).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
    expect(() => isTimestampOlder(1, '2024-10-15T11:00:00Z')).toThrow(
      /format YYYY-MM-DDTHH:MM:SSZ/
    )
  })

  test('returns true if timestampA is older than timestampB', () => {
    expect(
      isTimestampOlder('2024-10-15T11:00:00Z', '2024-10-16T11:00:00Z')
    ).toBe(true)
    expect(core.debug).toHaveBeenCalledWith(
      '2024-10-15T11:00:00Z is older than 2024-10-16T11:00:00Z'
    )
  })

  test('returns false if timestampA is newer than timestampB', () => {
    expect(
      isTimestampOlder('2024-10-17T11:00:00Z', '2024-10-16T11:00:00Z')
    ).toBe(false)
    expect(core.debug).toHaveBeenCalledWith(
      '2024-10-17T11:00:00Z is not older than 2024-10-16T11:00:00Z'
    )
  })

  test('returns false if timestampA equals timestampB', () => {
    expect(
      isTimestampOlder('2024-10-16T11:00:00Z', '2024-10-16T11:00:00Z')
    ).toBe(false)
    expect(core.debug).toHaveBeenCalledWith(
      '2024-10-16T11:00:00Z is not older than 2024-10-16T11:00:00Z'
    )
  })

  test('accepts valid leap year date', () => {
    // Feb 29, 2024 is valid (leap year)
    expect(() =>
      isTimestampOlder('2024-02-29T12:00:00Z', '2024-10-15T11:00:00Z')
    ).not.toThrow()
    expect(
      isTimestampOlder('2024-02-29T12:00:00Z', '2024-10-15T11:00:00Z')
    ).toBe(true)
    expect(
      isTimestampOlder('2024-10-15T11:00:00Z', '2024-02-29T12:00:00Z')
    ).toBe(false)
  })

  test('throws an error on js silent date contructor corrections', () => {
    // Invalid date: 2024-02-30T12:00:00Z actually becomes 2024-03-01T12:00:00Z (gross)
    expect(() =>
      isTimestampOlder('2024-02-30T12:00:00Z', '2024-10-15T11:00:00Z')
    ).toThrow(/Invalid date format/)
    expect(() =>
      isTimestampOlder('2024-10-15T11:00:00Z', '2024-02-30T12:00:00Z')
    ).toThrow(/Invalid date format/)
  })
})
