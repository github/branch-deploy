import {label, type LabelOctokit} from '../../src/functions/label.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import {createContext} from '../test-helpers.ts'

let context: Parameters<typeof label>[0]
let octokit: Parameters<typeof label>[1]
beforeEach(() => {
  vi.clearAllMocks()

  context = createContext({
    repo: {owner: 'corp', repo: 'test'},
    issue: {number: 1}
  })

  octokit = {
    rest: {
      issues: {
        addLabels: vi.fn<LabelOctokit['rest']['issues']['addLabels']>(),
        removeLabel: vi.fn<LabelOctokit['rest']['issues']['removeLabel']>(),
        listLabelsOnIssue: vi.fn().mockResolvedValue({
          data: [
            {
              name: 'deploy-failed'
            },
            {
              name: 'noop'
            }
          ]
        })
      }
    }
  } satisfies LabelOctokit
})

test('adds a single label to a pull request and removes none', async () => {
  expect(await label(context, octokit, ['read-for-review'], [])).toStrictEqual({
    added: ['read-for-review'],
    removed: []
  })
})

test('adds two labels to a pull request and removes none', async () => {
  expect(
    await label(context, octokit, ['read-for-review', 'cool-label'], [])
  ).toStrictEqual({
    added: ['read-for-review', 'cool-label'],
    removed: []
  })
})

test('adds a single label to a pull request and tries to remove a label but it is not on the PR to begin with', async () => {
  expect(
    await label(context, octokit, ['read-for-review'], ['unknown-label'])
  ).toStrictEqual({
    added: ['read-for-review'],
    removed: []
  })
})

test('does not add or remove any labels', async () => {
  expect(await label(context, octokit, [], [])).toStrictEqual({
    added: [],
    removed: []
  })
})

test('adds a single label to a pull request and removes a single label', async () => {
  expect(
    await label(context, octokit, ['deploy-success'], ['deploy-failed'])
  ).toStrictEqual({
    added: ['deploy-success'],
    removed: ['deploy-failed']
  })
})

test('adds two labels to a pull request and removes two labels', async () => {
  expect(
    await label(
      context,
      octokit,
      ['deploy-success', 'read-for-review'],
      ['deploy-failed', 'noop']
    )
  ).toStrictEqual({
    added: ['deploy-success', 'read-for-review'],
    removed: ['deploy-failed', 'noop']
  })
})

test('does not add any labels and removes a single label', async () => {
  expect(await label(context, octokit, [], ['noop'])).toStrictEqual({
    added: [],
    removed: ['noop']
  })
})
