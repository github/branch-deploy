import * as core from '@actions/core'
import * as unlock from '../../src/functions/unlock'
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
  jest.spyOn(unlock, 'unlock').mockImplementation(() => {
    return 'removed lock - silent'
  })

  context = {
    eventName: 'pull_request',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    payload: {
      action: 'closed',
      pull_request: {
        merged: true,
        head: {
          ref: 'deadbeef'
        }
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
        listDeployments: jest.fn().mockReturnValue({
          data: [
            {
              sha: 'deadbeef',
              id: 785395609,
              created_at: '2023-02-01T20:26:33Z',
              payload: {
                type: 'branch-deploy'
              },
              environment: 'development'
            },
            {
              sha: 'deadbeef',
              id: 785395610,
              created_at: '2023-02-01T21:26:33Z',
              payload: {
                type: 'branch-deploy'
              },
              environment: 'production'
            }
          ]
        })
      }
    }
  }
})

test('successfully unlocks development and production on a pull request merge', async () => {
  expect(await unlockOnMerge(octokit, context)).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    'removed lock - environment: development'
  )
  expect(infoMock).toHaveBeenCalledWith(
    'removed lock - environment: production'
  )
})

test('exits early when there are no deployments for a pull request', async () => {
  octokit.rest.repos.listDeployments = jest.fn().mockReturnValue({
    data: []
  })
  expect(await unlockOnMerge(octokit, context)).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    'No deployments found for corp/test with ref deadbeef'
  )
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
