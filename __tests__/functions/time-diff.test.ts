import assert from 'node:assert/strict'
import {test} from 'node:test'
import {timeDiff} from '../../src/functions/time-diff.ts'

test('checks the time elapsed between two dates - days apart', () => {
  assert.strictEqual(
    timeDiff('2022-06-08T14:28:50.149Z', '2022-06-10T20:55:18.356Z'),
    '2d:6h:26m:28s'
  )
})

test('checks the time elapsed between two dates - seconds apart', () => {
  assert.strictEqual(
    timeDiff('2022-06-10T20:55:20.999Z', '2022-06-10T20:55:50.356Z'),
    '0d:0h:0m:29s'
  )
})
