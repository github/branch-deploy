import assert from 'node:assert/strict'
import {mock, test} from 'node:test'
import {
  reactEmote,
  type ReactEmoteOctokit
} from '../../src/functions/react-emote.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'
import {createIssueCommentContext} from '../test-helpers.ts'

const context = createIssueCommentContext({
  repo: {owner: 'corp', repo: 'test'},
  payload: {comment: {id: 1}}
})

const octokit = {
  rest: {
    reactions: {
      createForIssueComment: mock.fn(() => Promise.resolve({data: {id: 1}}))
    }
  }
} satisfies ReactEmoteOctokit

test('adds a reaction emote to a comment', async () => {
  assert.strictEqual(await reactEmote('eyes', context, octokit), 1)
})

test('returns if no reaction is specified', async () => {
  assert.strictEqual(await reactEmote('', context, octokit), null)
  assert.strictEqual(
    await reactEmote(
      unsafeInvalidValue<Parameters<typeof reactEmote>[0]>(null),
      context,
      octokit
    ),
    null
  )
})

test('throws an error if a bad emote is used', async () => {
  await assert.rejects(reactEmote('bad', context, octokit), {
    message: 'Reaction "bad" is not a valid preset'
  })
})

test('warns and continues when a valid decorative reaction cannot be created', async () => {
  const failingOctokit = {
    rest: {
      reactions: {
        createForIssueComment: mock.fn(() =>
          Promise.reject(new Error('reaction unavailable'))
        )
      }
    }
  } satisfies ReactEmoteOctokit

  assert.strictEqual(await reactEmote('eyes', context, failingOctokit), null)
})
