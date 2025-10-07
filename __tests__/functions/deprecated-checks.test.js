import {isDeprecated} from '../../src/functions/deprecated-checks.js'
import {vi, expect, test, beforeEach} from 'vitest'
import * as core from '@actions/core'

const docsLink =
  'https://github.com/github/branch-deploy/blob/main/docs/deprecated.md'
const warningMock = vi.spyOn(core, 'warning')

var context
var octokit

beforeEach(() => {
  vi.clearAllMocks()

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
    },
    payload: {
      comment: {
        id: '1'
      }
    }
  }

  octokit = {
    rest: {
      reactions: {
        createForIssueComment: vi.fn().mockReturnValueOnce({
          data: {}
        })
      },
      issues: {
        createComment: vi.fn().mockReturnValueOnce({
          data: {}
        })
      }
    }
  }
})

test('checks a deployment message and does not find anything that is deprecated', async () => {
  const body = '.deploy to production'
  expect(await isDeprecated(body, octokit, context)).toBe(false)
})

test('checks a deployment message and finds the old "noop" style command which is now deprecated', async () => {
  const body = '.deploy noop'
  expect(await isDeprecated(body, octokit, context)).toBe(true)
  expect(warningMock).toHaveBeenCalledWith(
    `'.deploy noop' is deprecated. Please view the docs for more information: ${docsLink}#deploy-noop`
  )
})
