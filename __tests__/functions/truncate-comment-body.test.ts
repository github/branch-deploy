import assert from 'node:assert/strict'
import {test} from 'node:test'
import {truncateCommentBody} from '../../src/functions/truncate-comment-body.ts'

test('truncates a long message', () => {
  const message = 'a'.repeat(65537)
  const got = truncateCommentBody(message)
  assert.ok(got.includes('The message is too large to be posted as a comment.'))
  assert.ok(got.length <= 65536)
})

test('does not truncate a short message', () => {
  const message = 'a'.repeat(65536)
  const got = truncateCommentBody(message)
  assert.strictEqual(got, message)
})

for (const length of [0, 65535, 65536]) {
  test(`preserves a comment at the ${length}-character boundary`, () => {
    const message = 'a'.repeat(length)

    assert.strictEqual(truncateCommentBody(message), message)
  })
}

for (const length of [65537, 131072]) {
  test(`wraps and caps a ${length}-character comment`, () => {
    const rendered = truncateCommentBody('a'.repeat(length))

    assert.strictEqual(rendered.length, 65536)
    assert.ok(
      rendered.startsWith(
        'The message is too large to be posted as a comment.\n<details><summary>Click to see the truncated message</summary>\n'
      )
    )
    assert.ok(rendered.endsWith('\n</details>'))
  })
}
