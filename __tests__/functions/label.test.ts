import assert from 'node:assert/strict'
import {beforeEach, mock, test, type Mock} from 'node:test'
import type {LabelOctokit} from '../../src/functions/label.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledTimes,
  assertCalledWith,
  assertNotCalled,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'

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
let addLabelsMock: Mock<LabelOctokit['rest']['issues']['addLabels']>
let listLabelsMock: Mock<LabelOctokit['rest']['issues']['listLabelsOnIssue']>
let removeLabelMock: Mock<LabelOctokit['rest']['issues']['removeLabel']>

beforeEach(() => {
  debugMock.mock.resetCalls()
  infoMock.mock.resetCalls()

  context = createContext({
    repo: {owner: 'corp', repo: 'test'},
    issue: {number: 1}
  })

  addLabelsMock = createMock<LabelOctokit['rest']['issues']['addLabels']>()
  removeLabelMock = createMock<LabelOctokit['rest']['issues']['removeLabel']>()
  listLabelsMock = createMock<
    LabelOctokit['rest']['issues']['listLabelsOnIssue']
  >(() =>
    Promise.resolve({
      data: [{name: 'deploy-failed'}, {name: 'noop'}]
    })
  )

  octokit = {
    rest: {
      issues: {
        addLabels: addLabelsMock,
        removeLabel: removeLabelMock,
        listLabelsOnIssue: listLabelsMock
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

test('removes a label after the first page of issue labels', async () => {
  listLabelsMock.mock.mockImplementation(parameters =>
    Promise.resolve({
      data:
        parameters?.page === 1
          ? Array.from({length: 100}, (_, index) => ({
              name: `unrelated-${String(index)}`
            }))
          : [{name: 'deploy-failed'}]
    })
  )

  assert.deepStrictEqual(
    await label(context, octokit, ['deploy-success'], ['deploy-failed']),
    {added: ['deploy-success'], removed: ['deploy-failed']}
  )
  assertCalledTimes(listLabelsMock, 2)
  assertCalledWith(listLabelsMock, {
    owner: 'corp',
    repo: 'test',
    issue_number: 1,
    per_page: 100,
    page: 1,
    headers: API_HEADERS
  })
  assertCalledWith(listLabelsMock, {
    owner: 'corp',
    repo: 'test',
    issue_number: 1,
    per_page: 100,
    page: 2,
    headers: API_HEADERS
  })
  assertCalledWith(removeLabelMock, {
    owner: 'corp',
    repo: 'test',
    issue_number: 1,
    name: 'deploy-failed',
    headers: API_HEADERS
  })
})

test('stops after an empty page when the first label page is full', async () => {
  listLabelsMock.mock.mockImplementation(parameters =>
    Promise.resolve({
      data:
        parameters?.page === 1
          ? Array.from({length: 100}, (_, index) => ({
              name: `unrelated-${String(index)}`
            }))
          : []
    })
  )

  assert.deepStrictEqual(await label(context, octokit, [], ['missing']), {
    added: [],
    removed: []
  })
  assertCalledTimes(listLabelsMock, 2)
  assertNotCalled(removeLabelMock)
})

test('does not mutate labels when a later page cannot be read', async () => {
  const error = new Error('label page unavailable')
  listLabelsMock.mock.mockImplementation(parameters =>
    parameters?.page === 1
      ? Promise.resolve({
          data: Array.from({length: 100}, (_, index) => ({
            name: `unrelated-${String(index)}`
          }))
        })
      : Promise.reject(error)
  )

  await assert.rejects(
    label(context, octokit, ['deploy-success'], ['deploy-failed']),
    candidate => candidate === error
  )
  assertCalledTimes(listLabelsMock, 2)
  assertNotCalled(addLabelsMock)
  assertNotCalled(removeLabelMock)
})
