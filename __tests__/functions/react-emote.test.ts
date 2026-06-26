import {
  reactEmote,
  type ReactEmoteOctokit
} from '../../src/functions/react-emote.ts'
import {vi, expect, test} from 'vitest'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'
import {createIssueCommentContext} from '../test-helpers.ts'

const context = createIssueCommentContext({
  repo: {owner: 'corp', repo: 'test'},
  payload: {comment: {id: 1}}
})

const octokit = {
  rest: {
    reactions: {
      createForIssueComment: vi.fn().mockResolvedValue({data: {id: 1}})
    }
  }
} satisfies ReactEmoteOctokit

test('adds a reaction emote to a comment', async () => {
  expect(await reactEmote('eyes', context, octokit)).toStrictEqual({
    data: {id: 1}
  })
})

test('returns if no reaction is specified', async () => {
  expect(await reactEmote('', context, octokit)).toBe(undefined)
  expect(
    await reactEmote(
      unsafeInvalidValue<Parameters<typeof reactEmote>[0]>(null),
      context,
      octokit
    )
  ).toBe(undefined)
})

test('throws an error if a bad emote is used', async () => {
  await expect(reactEmote('bad', context, octokit)).rejects.toThrow(
    'Reaction "bad" is not a valid preset'
  )
})
