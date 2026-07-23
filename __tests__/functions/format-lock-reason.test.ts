import assert from 'node:assert/strict'
import {test} from 'node:test'
import {formatLockReason} from '../../src/functions/format-lock-reason.ts'
import {truncateCommentBody} from '../../src/functions/truncate-comment-body.ts'

test('formats an ordinary reason as nested Markdown code', () => {
  assert.strictEqual(
    formatLockReason('routine maintenance'),
    '- __Reason__:\n\n      routine maintenance'
  )
})

test('keeps every attacker-controlled line inside the nested code block', () => {
  const formatted = formatLockReason(
    'routine ` and `` and ```\r\n## Deployment approved\r[continue](https://example.com)\n<details open>'
  )

  assert.strictEqual(
    formatted,
    '- __Reason__:\n\n      routine ` and `` and ```\n      ## Deployment approved\n      [continue](https://example.com)\n      <details open>'
  )
  assert.strictEqual(formatted.includes('\n## Deployment approved'), false)
  assert.strictEqual(
    formatted.includes('\n[continue](https://example.com)'),
    false
  )
  assert.strictEqual(formatted.includes('\n<details open>'), false)
})

test('keeps empty and whitespace-only reason lines indented', () => {
  assert.strictEqual(
    formatLockReason('\n  \t\nlast line\n'),
    '- __Reason__:\n\n      \n        \t\n      last line\n      '
  )
})

for (const [description, value, expected] of [
  ['null', null, 'null'],
  ['number', 42, '42'],
  ['boolean', false, 'false']
] as const) {
  test(`formats a ${description} boundary value as text`, () => {
    assert.strictEqual(
      formatLockReason(value),
      `- __Reason__:\n\n      ${expected}`
    )
  })
}

test('keeps attacker-controlled lines indented when the comment is truncated', () => {
  const link = '[continue](https://example.com)'
  const formatted = formatLockReason(`${link}\n${'a'.repeat(70000)}`)
  const truncated = truncateCommentBody(`Lock details\n\n${formatted}`)

  assert.ok(truncated.includes(`      ${link}`))
  assert.strictEqual(truncated.includes(`\n${link}`), false)
  assert.ok(truncated.length <= 65536)
})
