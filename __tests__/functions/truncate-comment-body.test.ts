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
