import * as core from '@actions/core'
import {isOutdated} from '../../src/functions/outdated-check'
// import {COLORS} from '../../src/functions/colors'

// const infoMock = jest.spyOn(core, 'info')

var context
var octokit
var data

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})

  data = {
    mergeStateStatus: 'CLEAN',
    baseBranch: {
      data: {
        commit: {sha: 'deadbeef'},
        name: 'test-branch'
      },
      status: 200
    },
    pr: {
      data: {
        head: {
          ref: 'test-ref',
          sha: 'abc123'
        },
        base: {
          ref: 'base-ref'
        }
      },
      status: 200
    }
  }

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    }
  }

  octokit = {
    rest: {
      repos: {
        compareCommits: jest
          .fn()
          .mockReturnValueOnce({data: {behind_by: 0}, status: 200})
      }
    }
  }
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not', async () => {
  expect(await isOutdated(context, octokit, data)).toStrictEqual(false)
})

test('checks if the branch is out-of-date via commit comparison and finds that it is', async () => {
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 1}, status: 200})
  expect(await isOutdated(context, octokit, data)).toStrictEqual(true)
})

test('checks the mergeStateStatus and finds that it is BEHIND', async () => {
  data.mergeStateStatus = 'BEHIND'
  expect(await isOutdated(context, octokit, data)).toStrictEqual(true)
})
