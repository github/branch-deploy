import assert from 'node:assert/strict'
import {beforeEach, mock, test, type Mock} from 'node:test'
import type {ConditionalUnlockOctokit} from '../../src/functions/unlock-if-unchanged.ts'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {createIssueCommentContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const actualCore = await import('../../src/actions-core.ts')
const infoMock = createMock<ActionsCore['info']>()
const warningMock = createMock<ActionsCore['warning']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  ...actualCore,
  info: infoMock,
  warning: warningMock
})

const {unlockIfUnchanged} =
  await import('../../src/functions/unlock-if-unchanged.ts')

const context = createIssueCommentContext({
  repo: {owner: 'corp', repo: 'test'}
})
const expectedSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

let getRepositoryMock: Mock<ConditionalUnlockOctokit['rest']['repos']['get']>
let graphqlMock: Mock<ConditionalUnlockOctokit['graphql']>
let octokit: ConditionalUnlockOctokit

beforeEach(() => {
  infoMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  getRepositoryMock = createMock<
    ConditionalUnlockOctokit['rest']['repos']['get']
  >(() => Promise.resolve({data: {node_id: 'R_test'}}))
  graphqlMock = createMock<ConditionalUnlockOctokit['graphql']>(() =>
    Promise.resolve({updateRefs: {clientMutationId: null}})
  )
  octokit = {
    graphql: graphqlMock,
    rest: {repos: {get: getRepositoryMock}}
  }
})

test('removes the original lock with an atomic ref precondition', async () => {
  assert.strictEqual(
    await unlockIfUnchanged(octokit, context, 'Production West', expectedSha),
    true
  )

  assertCalledWith(getRepositoryMock, {
    owner: 'corp',
    repo: 'test',
    headers: API_HEADERS
  })
  const call = graphqlMock.mock.calls[0]
  assert.ok(call)
  assert.match(call.arguments[0], /updateRefs\(input: \$input\)/u)
  assert.deepStrictEqual(call.arguments[1], {
    input: {
      repositoryId: 'R_test',
      refUpdates: [
        {
          name: 'refs/heads/Production-West-branch-deploy-lock',
          beforeOid: expectedSha,
          afterOid: '0000000000000000000000000000000000000000'
        }
      ]
    }
  })
  assertCalledWith(
    infoMock,
    '🔓 successfully removed the original deployment lock'
  )
})

test('leaves a replacement lock in place when its ref no longer matches', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.reject(new Error('reference no longer points to the expected OID'))
  )

  assert.strictEqual(
    await unlockIfUnchanged(octokit, context, 'production', expectedSha),
    false
  )
  assertCalledWith(
    warningMock,
    'could not remove the original deployment lock; leaving the current lock in place: reference no longer points to the expected OID'
  )
})

test('leaves the lock in place when the repository identity cannot be read', async () => {
  getRepositoryMock.mock.mockImplementation(() =>
    Promise.reject(new Error('repository unavailable'))
  )

  assert.strictEqual(
    await unlockIfUnchanged(octokit, context, 'production', expectedSha),
    false
  )
  assertCalledWith(
    warningMock,
    'could not remove the original deployment lock; leaving the current lock in place: repository unavailable'
  )
})
