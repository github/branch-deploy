import {expect, test} from 'vitest'
import {githubRunAttempt} from '../../src/functions/github-run-attempt.js'

test('parses a positive run attempt', () => {
  expect(githubRunAttempt('12')).toBe(12)
})

test.each([undefined, ''])('defaults a missing run attempt to one', value => {
  expect(githubRunAttempt(value)).toBe(1)
})

test.each(['0', '-1', '+1', '1.5', '1x', ' 1'])(
  'rejects an invalid run attempt: %s',
  value => {
    expect(() => githubRunAttempt(value)).toThrow(
      'GITHUB_RUN_ATTEMPT must be a positive integer'
    )
  }
)

test('rejects an unsafe run attempt', () => {
  expect(() => githubRunAttempt('9007199254740992')).toThrow(
    'GITHUB_RUN_ATTEMPT must be a safe integer'
  )
})
