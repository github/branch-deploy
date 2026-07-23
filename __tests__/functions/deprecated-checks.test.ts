import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import type {DeprecatedChecksOctokit} from '../../src/functions/deprecated-checks.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const warningMock = createMock<ActionsCore['warning']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  warning: warningMock
})

const {isDeprecated} = await import('../../src/functions/deprecated-checks.ts')

const docsLink =
  'https://github.com/github/branch-deploy/blob/main/docs/deprecated.md'

let context: Parameters<typeof isDeprecated>[2]
let octokit: Parameters<typeof isDeprecated>[1]

beforeEach(() => {
  warningMock.mock.resetCalls()

  context = createIssueCommentContext({
    repo: {owner: 'corp', repo: 'test'},
    issue: {number: 1},
    payload: {comment: {id: 1}}
  })

  octokit = {
    rest: {
      reactions: {
        createForIssueComment:
          createMock<
            DeprecatedChecksOctokit['rest']['reactions']['createForIssueComment']
          >()
      },
      issues: {
        createComment:
          createMock<
            DeprecatedChecksOctokit['rest']['issues']['createComment']
          >()
      }
    }
  } satisfies DeprecatedChecksOctokit
})

test('checks a deployment message and does not find anything that is deprecated', async () => {
  const body = '.deploy to production'
  assert.strictEqual(await isDeprecated(body, octokit, context), false)
})

test('checks a deployment message and finds the old "noop" style command which is now deprecated', async () => {
  const body = '.deploy noop'
  assert.strictEqual(await isDeprecated(body, octokit, context), true)
  assertCalledWith(
    warningMock,
    `'.deploy noop' is deprecated. Please view the docs for more information: ${docsLink}#deploy-noop`
  )
})
