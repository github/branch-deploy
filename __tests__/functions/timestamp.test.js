import {timestamp} from '../../src/functions/timestamp.js'
import {vi, expect, test, beforeEach, afterEach} from 'vitest'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

test('should return the current date in ISO 8601 format', () => {
  const mockDate = new Date('2025-01-01T00:00:00.000Z')
  vi.setSystemTime(mockDate)

  const result = timestamp()

  expect(result).toBe('2025-01-01T00:00:00.000Z')
})
