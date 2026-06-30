import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  assertNotCalled,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type ActionIo = typeof import('../../src/action-io.ts')
type IdenticalCommitModule =
  typeof import('../../src/functions/identical-commit-check.ts')

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const saveActionStateMock = createMock<ActionIo['saveActionState']>()
const setActionOutputMock = createMock<ActionIo['setActionOutput']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  info: infoMock
})
installModuleMock(mock, new URL('../../src/action-io.ts', import.meta.url), {
  saveActionState: saveActionStateMock,
  setActionOutput: setActionOutputMock
})

const {identicalCommitCheck} =
  await import('../../src/functions/identical-commit-check.ts')

let context: Parameters<IdenticalCommitModule['identicalCommitCheck']>[1]
let octokit: Parameters<IdenticalCommitModule['identicalCommitCheck']>[0]
type IdenticalOctokit = Parameters<
  IdenticalCommitModule['identicalCommitCheck']
>[0]
const getRepositoryMock = createMock<IdenticalOctokit['rest']['repos']['get']>()
const getBranchMock =
  createMock<IdenticalOctokit['rest']['repos']['getBranch']>()
const getCommitMock =
  createMock<IdenticalOctokit['rest']['repos']['getCommit']>()
const listDeploymentsMock =
  createMock<IdenticalOctokit['rest']['repos']['listDeployments']>()

beforeEach(() => {
  debugMock.mock.resetCalls()
  infoMock.mock.resetCalls()
  saveActionStateMock.mock.resetCalls()
  setActionOutputMock.mock.resetCalls()
  getRepositoryMock.mock.resetCalls()
  getBranchMock.mock.resetCalls()
  getCommitMock.mock.resetCalls()
  listDeploymentsMock.mock.resetCalls()

  context = createContext({repo: {owner: 'corp', repo: 'test'}})

  getRepositoryMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {default_branch: 'main'}
    })
  )
  getBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        commit: {
          sha: 'abcdef',
          commit: {tree: {sha: 'deadbeef'}}
        }
      }
    })
  )
  getCommitMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {commit: {tree: {sha: 'deadbeef'}}}
    })
  )
  listDeploymentsMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: [
        {
          sha: 'deadbeef',
          id: 123395608,
          created_at: '2023-02-01T21:30:40Z',
          payload: {type: 'some-other-type'}
        },
        {
          sha: 'beefdead',
          id: 785395609,
          created_at: '2023-02-01T20:26:33Z',
          payload: {type: 'branch-deploy'}
        }
      ]
    })
  )

  octokit = {
    rest: {
      repos: {
        get: getRepositoryMock,
        getBranch: getBranchMock,
        getCommit: getCommitMock,
        listDeployments: listDeploymentsMock
      }
    }
  }
})

test('checks if the default branch sha and deployment sha are identical, and they are', async () => {
  assert.strictEqual(
    await identicalCommitCheck(octokit, context, 'production'),
    true
  )
  assertCalledWith(
    infoMock,
    `🟰 the latest deployment tree sha is ${COLORS.highlight}equal${COLORS.reset} to the default branch tree sha`
  )
  assertCalledWith(setActionOutputMock, 'continue', 'false')
  assertCalledWith(setActionOutputMock, 'environment', 'production')
  assertNotCalled(saveActionStateMock)
  assert.strictEqual(
    setActionOutputMock.mock.calls.some(
      call => call.arguments[0] === 'sha' && call.arguments[1] === 'abcdef'
    ),
    false
  )
})

test('checks if the default branch sha and deployment sha are identical, and they are not', async () => {
  getCommitMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {commit: {tree: {sha: 'beefdead'}}}
    })
  )

  assert.strictEqual(
    await identicalCommitCheck(octokit, context, 'production'),
    false
  )
  assertCalledWith(
    infoMock,
    `📍 latest commit sha on ${COLORS.highlight}main${COLORS.reset}: ${COLORS.info}abcdef${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🌲 latest default ${COLORS.info}branch${COLORS.reset} tree sha: ${COLORS.info}deadbeef${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🌲 latest ${COLORS.info}deployment${COLORS.reset} tree sha:     ${COLORS.info}beefdead${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🚀 a ${COLORS.success}new deployment${COLORS.reset} will be created based on your configuration`
  )
  assertCalledWith(setActionOutputMock, 'continue', 'true')
  assertCalledWith(setActionOutputMock, 'environment', 'production')
  assertCalledWith(setActionOutputMock, 'sha', 'abcdef')
  assertCalledWith(saveActionStateMock, 'sha', 'abcdef')
})
