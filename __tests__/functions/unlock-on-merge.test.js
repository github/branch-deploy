import * as core from '@actions/core'
import {unlockOnMerge} from '../../src/functions/unlock-on-merge'

// const setOutputMock = jest.spyOn(core, 'setOutput')
const infoMock = jest.spyOn(core, 'info')
const setFailedMock = jest.spyOn(core, 'setFailed')
// const debugMock = jest.spyOn(core, 'debug')

var context
var octokit
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'error').mockImplementation(() => {})

  context = {
    eventName: 'pull_request',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    payload: {
      action: 'closed',
      pull_request: {
        merged: true
      }
    }
  }

  octokit = {
    rest: {
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
        }),
        compareCommitsWithBasehead: jest.fn().mockReturnValue({
          data: {
            status: 'identical'
          }
        })
      }
    }
  }
})

test('fails due to the context not being a PR merge', async () => {
  context.payload.action = 'opened'
  context.payload.pull_request.merged = false
  context.payload.eventName = 'pull_request'
  expect(await unlockOnMerge(octokit, context)).toStrictEqual(false)
  expect(infoMock).toHaveBeenCalledWith(
    'event name: pull_request, action: opened, merged: false'
  )
  expect(setFailedMock).toHaveBeenCalledWith(
    'This workflow can only run in the context of a merged pull request'
  )
})
