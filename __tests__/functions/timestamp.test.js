import {timestamp} from '../../src/functions/timestamp.js'
import {
  jest,
  expect,
  describe,
  test,
  beforeEach,
  afterEach
} from '@jest/globals'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('timestamp', () => {
  it('should return the current date in ISO 8601 format', () => {
    const mockDate = new Date('2025-01-01T00:00:00.000Z')
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate)

    const result = timestamp()

    expect(result).toBe(mockDate.toISOString())

    // Restore the original Date implementation
    global.Date.mockRestore()
  })
})
