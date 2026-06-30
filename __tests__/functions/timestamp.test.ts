import assert from 'node:assert/strict'
import {test} from 'node:test'
import {timestamp} from '../../src/functions/timestamp.ts'

test('should return the current date in ISO 8601 format', context => {
  const mockDate = new Date('2025-01-01T00:00:00.000Z')
  context.mock.timers.enable({apis: ['Date'], now: mockDate})

  const result = timestamp()

  assert.strictEqual(result, '2025-01-01T00:00:00.000Z')
})
