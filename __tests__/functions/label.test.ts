import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import type {LabelOctokit} from '../../src/functions/label.ts'
import {createContext} from '../test-helpers.ts'
import {createMock, installModuleMock} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type LabelModule = typeof import('../../src/functions/label.ts')

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  info: infoMock
})

const {label} = await import('../../src/functions/label.ts')

let context: Parameters<LabelModule['label']>[0]
let octokit: Parameters<LabelModule['label']>[1]

beforeEach(() => {
  debugMock.mock.resetCalls()
  infoMock.mock.resetCalls()

  context = createContext({
    repo: {owner: 'corp', repo: 'test'},
    issue: {number: 1}
  })

  octokit = {
    rest: {
      issues: {
        addLabels: createMock<LabelOctokit['rest']['issues']['addLabels']>(),
        removeLabel:
          createMock<LabelOctokit['rest']['issues']['removeLabel']>(),
        listLabelsOnIssue: createMock<
          LabelOctokit['rest']['issues']['listLabelsOnIssue']
        >(() =>
          Promise.resolve({
            data: [
              {
                name: 'deploy-failed'
              },
              {
                name: 'noop'
              }
            ]
          })
        )
      }
    }
  } satisfies LabelOctokit
})

test('adds a single label to a pull request and removes none', async () => {
  assert.deepStrictEqual(
    await label(context, octokit, ['read-for-review'], []),
    {
      added: ['read-for-review'],
      removed: []
    }
  )
})

test('adds two labels to a pull request and removes none', async () => {
  assert.deepStrictEqual(
    await label(context, octokit, ['read-for-review', 'cool-label'], []),
    {
      added: ['read-for-review', 'cool-label'],
      removed: []
    }
  )
})

test('adds a single label to a pull request and tries to remove a label but it is not on the PR to begin with', async () => {
  assert.deepStrictEqual(
    await label(context, octokit, ['read-for-review'], ['unknown-label']),
    {
      added: ['read-for-review'],
      removed: []
    }
  )
})

test('does not add or remove any labels', async () => {
  assert.deepStrictEqual(await label(context, octokit, [], []), {
    added: [],
    removed: []
  })
})

test('adds a single label to a pull request and removes a single label', async () => {
  assert.deepStrictEqual(
    await label(context, octokit, ['deploy-success'], ['deploy-failed']),
    {
      added: ['deploy-success'],
      removed: ['deploy-failed']
    }
  )
})

test('adds two labels to a pull request and removes two labels', async () => {
  assert.deepStrictEqual(
    await label(
      context,
      octokit,
      ['deploy-success', 'read-for-review'],
      ['deploy-failed', 'noop']
    ),
    {
      added: ['deploy-success', 'read-for-review'],
      removed: ['deploy-failed', 'noop']
    }
  )
})

test('does not add any labels and removes a single label', async () => {
  assert.deepStrictEqual(await label(context, octokit, [], ['noop']), {
    added: [],
    removed: ['noop']
  })
})
