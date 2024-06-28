import {label} from '../../src/functions/label'
import * as core from '@actions/core'

var context
var octokit
beforeEach(() => {
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.clearAllMocks()

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    }
  }

  octokit = {
    rest: {
      issues: {
        addLabels: jest.fn().mockReturnValueOnce({
          data: {}
        }),
        removeLabel: jest.fn().mockReturnValueOnce({
          data: {}
        }),
        listLabelsOnIssue: jest.fn().mockReturnValueOnce({
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
  }
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
