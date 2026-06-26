import {expect, test} from 'vitest'
import {formatLockReason} from '../../src/functions/format-lock-reason.ts'
import {truncateCommentBody} from '../../src/functions/truncate-comment-body.ts'

test('formats an ordinary reason as nested Markdown code', () => {
  expect(formatLockReason('routine maintenance')).toBe(
    '- __Reason__:\n\n      routine maintenance'
  )
})

test('keeps every attacker-controlled line inside the nested code block', () => {
  const formatted = formatLockReason(
    'routine ` and `` and ```\r\n## Deployment approved\r[continue](https://example.com)\n<details open>'
  )

  expect(formatted).toBe(
    '- __Reason__:\n\n      routine ` and `` and ```\n      ## Deployment approved\n      [continue](https://example.com)\n      <details open>'
  )
  expect(formatted).not.toContain('\n## Deployment approved')
  expect(formatted).not.toContain('\n[continue](https://example.com)')
  expect(formatted).not.toContain('\n<details open>')
})

test('keeps attacker-controlled lines indented when the comment is truncated', () => {
  const link = '[continue](https://example.com)'
  const formatted = formatLockReason(`${link}\n${'a'.repeat(70000)}`)
  const truncated = truncateCommentBody(`Lock details\n\n${formatted}`)

  expect(truncated).toContain(`      ${link}`)
  expect(truncated).not.toContain(`\n${link}`)
  expect(truncated.length).toBeLessThanOrEqual(65536)
})
