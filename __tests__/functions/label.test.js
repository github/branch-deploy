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
        })
      }
    }
  }
})

test('adds a single label to a pull request', async () => {
  expect(await label(context, octokit, ['read-for-review'])).toStrictEqual({
    data: {}
  })
})

test('adds two labels to a pull request', async () => {
  expect(
    await label(context, octokit, ['read-for-review', 'cool-label'])
  ).toStrictEqual({
    data: {}
  })
})

test('returns if no labels are specified', async () => {
  expect(await label(context, octokit, [])).toBe(undefined)
})
