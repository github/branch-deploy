import * as core from '@actions/core'
import {vi, expect, test, beforeEach} from 'vitest'
import {identicalCommitCheck} from '../../src/functions/identical-commit-check.ts'
import {COLORS} from '../../src/functions/colors.ts'

const saveStateMock = vi.spyOn(core, 'saveState')
const setOutputMock = vi.spyOn(core, 'setOutput')
const infoMock = vi.spyOn(core, 'info')

var context: Parameters<typeof identicalCommitCheck>[1]
var octokit: Parameters<typeof identicalCommitCheck>[0]
beforeEach(() => {
  vi.clearAllMocks()

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
  } as unknown as typeof context

  octokit = {
    rest: {
      repos: {
        get: vi.fn().mockReturnValue({
          data: {
            default_branch: 'main'
          }
        }),
        getBranch: vi.fn().mockReturnValue({
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
        getCommit: vi.fn().mockReturnValue({
          data: {
            commit: {
              tree: {
                sha: 'deadbeef'
              }
            }
          }
        }),
        listDeployments: vi.fn().mockReturnValue({
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
  } as unknown as typeof octokit
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
  octokit.rest.repos.getCommit = vi.fn().mockReturnValue({
    data: {
      commit: {
        tree: {
          sha: 'beefdead'
        }
      }
    }
  }) as unknown as typeof octokit.rest.repos.getCommit

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
