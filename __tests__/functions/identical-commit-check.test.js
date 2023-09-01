import * as core from '@actions/core'
import {identicalCommitCheck} from '../../src/functions/identical-commit-check'

const setOutputMock = jest.spyOn(core, 'setOutput')
const infoMock = jest.spyOn(core, 'info')

var context
var octokit
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    sha: 'deadbeef'
  }

  octokit = {
    rest: {
      repos: {
        compareCommits: jest.fn().mockReturnValue({
          data: {
            merge_base_commit: {
              sha: 'beefdead'
            }
          }
        }),
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
        listCommits: jest.fn().mockReturnValue({
          data: [
            {
              sha: 'deadbeef',
              parents: [
                {
                  sha: 'beefdead'
                }
              ]
            }
          ]
        }),
        listDeployments: jest.fn().mockReturnValue({
          data: [
            {
              sha: 'beefdead',
              id: 785395609,
              created_at: '2023-02-01T20:26:33Z',
              payload: {
                type: 'branch-deploy'
              }
            }
          ]
        })
      }
    }
  }
})

test('checks if the default branch sha and deployment sha are identical, and they are', async () => {
  expect(
    await identicalCommitCheck(octokit, context, 'production')
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    'latest deployment sha is identical to the latest commit sha'
  )
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'false')
  expect(setOutputMock).toHaveBeenCalledWith('environment', 'production')
})

test('checks if the default branch sha and deployment sha are identical, and they are not', async () => {
  octokit.rest.repos.compareCommitsWithBasehead = jest.fn().mockReturnValue({
    data: {
      status: 'not identical'
    }
  })

  octokit.rest.repos.compareCommits = jest.fn().mockReturnValue({
    data: {
      merge_base_commit: {
        sha: 'deadbeef'
      }
    }
  })

  expect(
    await identicalCommitCheck(octokit, context, 'production')
  ).toStrictEqual(false)
  expect(infoMock).toHaveBeenCalledWith(
    'a new deployment will be created based on your configuration'
  )
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('environment', 'production')
})
