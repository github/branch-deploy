import * as core from '@actions/core'
import {isMergeCommitIdentical} from '../../src/functions/identical-commit-check'

const setOutputMock = jest.spyOn(core, 'setOutput')
const infoMock = jest.spyOn(core, 'info')
// const debugMock = jest.spyOn(core, 'debug')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

const context = {
  repo: {
    owner: 'corp',
    repo: 'test'
  },
  payload: {
    comment: {
      id: '1'
    }
  }
}

const octokit = {
  repos: {
    get: jest.fn().mockReturnValue({
      data: {
        default_branch: 'main'
      }
    }),
    getBranch: jest.fn().mockReturnValue({
      data: {
        commit: {
          sha: 'deadbeef'
        }
      }
    }),
    listDeployments: jest.fn().mockReturnValue({
      data: [
        {
          sha: 'beefdead'
        }
      ]
    }),
    compareCommits: jest.fn().mockReturnValue({
      data: {
        status: 'identical'
      }
    })
  }
}

test('checks if the default branch sha and deployment sha are identical, and they are', async () => {
  expect(
    await isMergeCommitIdentical(octokit, context, 'production')
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    'latest deployment sha is identical to the latest commit sha'
  )
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'false')
})

test('checks if the default branch sha and deployment sha are identical, and they are not', async () => {
  const octokitWithNoMatchingSha = {
    repos: {
      get: jest.fn().mockReturnValue({
        data: {
          default_branch: 'main'
        }
      }),
      getBranch: jest.fn().mockReturnValue({
        data: {
          commit: {
            sha: 'deadbeef'
          }
        }
      }),
      listDeployments: jest.fn().mockReturnValue({
        data: [
          {
            sha: 'beefdead'
          }
        ]
      }),
      compareCommits: jest.fn().mockReturnValue({
        data: {
          status: 'not identical'
        }
      })
    }
  }

  expect(
    await isMergeCommitIdentical(
      octokitWithNoMatchingSha,
      context,
      'production'
    )
  ).toStrictEqual(false)
  expect(infoMock).toHaveBeenCalledWith(
    'a new deployment will be created based on your configuration'
  )
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
})
