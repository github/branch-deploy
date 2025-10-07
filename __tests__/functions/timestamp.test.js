import {timestamp} from '../../src/functions/timestamp.js'
import {vi, expect, beforeEach} from 'vitest'

beforeEach(() => {
  vi.clearAllMocks()
})

test('timestamp', () => {
  expect('should return the current date in ISO 8601 format', () => {
    const mockDate = new Date('2025-01-01T00:00:00.000Z')
    vi.spyOn(global, 'Date').mockImplementation(() => mockDate)

    const result = timestamp()

    expect(result).toBe(mockDate.toISOString())

    // Restore the original Date implementation
    global.Date.mockRestore()
  })
})
