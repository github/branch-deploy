import * as core from '@actions/core'
import {
  jest,
  expect,
  describe,
  test,
  beforeEach,
  afterEach
} from '@jest/globals'
import {identicalCommitCheck} from '../../src/functions/identical-commit-check.js'
import {COLORS} from '../../src/functions/colors.js'

const saveStateMock = jest.spyOn(core, 'saveState')
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
  jest.spyOn(core, 'saveState').mockImplementation(() => {})

  context = {
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
              sha: 'abcdef',
              commit: {
                tree: {
                  sha: 'deadbeef'
                }
              }
            }
          }
        }),
        getCommit: jest.fn().mockReturnValue({
          data: {
            commit: {
              tree: {
                sha: 'deadbeef'
              }
            }
          }
        }),
        listDeployments: jest.fn().mockReturnValue({
          data: [
            {
              sha: 'deadbeef',
              id: 123395608,
              created_at: '2023-02-01T21:30:40Z',
              payload: {
                type: 'some-other-type'
              }
            },
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
    `🟰 the latest deployment tree sha is ${COLORS.highlight}equal${COLORS.reset} to the default branch tree sha`
  )
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'false')
  expect(setOutputMock).toHaveBeenCalledWith('environment', 'production')
  expect(setOutputMock).not.toHaveBeenCalledWith('sha', 'abcdef')
  expect(saveStateMock).not.toHaveBeenCalledWith('sha', 'abcdef')
})

test('checks if the default branch sha and deployment sha are identical, and they are not', async () => {
  octokit.rest.repos.getCommit = jest.fn().mockReturnValue({
    data: {
      commit: {
        tree: {
          sha: 'beefdead'
        }
      }
    }
  })

  expect(
    await identicalCommitCheck(octokit, context, 'production')
  ).toStrictEqual(false)
  expect(infoMock).toHaveBeenCalledWith(
    `📍 latest commit sha on ${COLORS.highlight}main${COLORS.reset}: ${COLORS.info}abcdef${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🌲 latest default ${COLORS.info}branch${COLORS.reset} tree sha: ${COLORS.info}deadbeef${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🌲 latest ${COLORS.info}deployment${COLORS.reset} tree sha:     ${COLORS.info}beefdead${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🚀 a ${COLORS.success}new deployment${COLORS.reset} will be created based on your configuration`
  )
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('environment', 'production')
  expect(setOutputMock).toHaveBeenCalledWith('sha', 'abcdef')
  expect(saveStateMock).toHaveBeenCalledWith('sha', 'abcdef')
})
