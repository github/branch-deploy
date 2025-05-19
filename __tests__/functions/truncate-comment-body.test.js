import {test, expect, jest, beforeEach} from '@jest/globals'

import * as core from '@actions/core'
import {truncateCommentBody} from '../../src/functions/truncate-comment-body.js'

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
})

test('truncates a long message', () => {
  const message = 'a'.repeat(65537)
  const got = truncateCommentBody(message)
  expect(got).toContain('The message is too large to be posted as a comment.')
  expect(got.length).toBeLessThanOrEqual(65536)
})

test('does not truncate a short message', () => {
  const message = 'a'.repeat(65536)
  const got = truncateCommentBody(message)
  expect(got).toEqual(message)
})
