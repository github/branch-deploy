import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type OutdatedCheckModule =
  typeof import('../../src/functions/outdated-check.ts')

const debugMock = createMock<ActionsCore['debug']>()
const warningMock = createMock<ActionsCore['warning']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  warning: warningMock
})

const {isOutdated} = await import('../../src/functions/outdated-check.ts')

let context: Parameters<OutdatedCheckModule['isOutdated']>[0]
let octokit: Parameters<OutdatedCheckModule['isOutdated']>[1]
let data: Parameters<OutdatedCheckModule['isOutdated']>[2]
const compareCommitsMock =
  createMock<
    Parameters<
      OutdatedCheckModule['isOutdated']
    >[1]['rest']['repos']['compareCommits']
  >()

beforeEach(() => {
  debugMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  compareCommitsMock.mock.resetCalls()

  data = {
    outdated_mode: 'strict',
    mergeStateStatus: 'CLEAN',
    stableBaseBranch: {
      data: {
        commit: {sha: 'beefdead'},
        name: 'stable-branch'
      }
    },
    baseBranch: {
      data: {
        commit: {sha: 'deadbeef'},
        name: 'test-branch'
      }
    },
    pr: {data: {head: {sha: 'abc123'}}}
  }

  context = createContext({
    repo: {
      owner: 'corp',
      repo: 'test'
    }
  })

  compareCommitsMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {behind_by: 0}
    })
  )
  octokit = {
    rest: {
      repos: {
        compareCommits: compareCommitsMock
      }
    }
  }
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not', async () => {
  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'test-branch|stable-branch',
    outdated: false
  })
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not, when the stable branch and base branch are the same (i.e a PR to main)', async () => {
  data.baseBranch = data.stableBaseBranch
  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'stable-branch|stable-branch',
    outdated: false
  })
})

test('checks if the branch is out-of-date via commit comparison and finds that it is, when the stable branch and base branch are the same (i.e a PR to main)', async () => {
  data.baseBranch = data.stableBaseBranch

  compareCommitsMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {behind_by: 1}
    })
  )

  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'stable-branch',
    outdated: true
  })
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not using outdated_mode pr_base', async () => {
  data.outdated_mode = 'pr_base'
  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'test-branch',
    outdated: false
  })
  assertCalledWith(debugMock, 'checking isOutdated with pr_base mode')
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not using outdated_mode default_branch', async () => {
  data.outdated_mode = 'default_branch'
  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'stable-branch',
    outdated: false
  })
  assertCalledWith(debugMock, 'checking isOutdated with default_branch mode')
})

test('checks if the branch is out-of-date via commit comparison and finds that it is', async () => {
  compareCommitsMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {behind_by: 1}
    })
  )
  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'test-branch',
    outdated: true
  })
  assertCalledWith(debugMock, 'checking isOutdated with strict mode')
  assertCalledWith(
    warningMock,
    `The PR branch is behind the base branch by ${COLORS.highlight}1 commit${COLORS.reset}`
  )
})

test('checks if the branch is out-of-date via commit comparison and finds that it is by many commits', async () => {
  compareCommitsMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {behind_by: 45}
    })
  )
  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'test-branch',
    outdated: true
  })
  assertCalledWith(debugMock, 'checking isOutdated with strict mode')
  assertCalledWith(
    warningMock,
    `The PR branch is behind the base branch by ${COLORS.highlight}45 commits${COLORS.reset}`
  )
})

test('checks if the branch is out-of-date via commit comparison and finds that it is only behind the stable branch', async () => {
  compareCommitsMock.mock.mockImplementationOnce(
    () => Promise.resolve({data: {behind_by: 0}}),
    0
  )
  compareCommitsMock.mock.mockImplementationOnce(
    () => Promise.resolve({data: {behind_by: 1}}),
    1
  )
  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'stable-branch',
    outdated: true
  })
  assertCalledWith(debugMock, 'checking isOutdated with strict mode')
})

test('checks the mergeStateStatus and finds that it is BEHIND', async () => {
  data.mergeStateStatus = 'BEHIND'
  assert.deepStrictEqual(await isOutdated(context, octokit, data), {
    branch: 'test-branch',
    outdated: true
  })
  assertCalledWith(
    debugMock,
    'mergeStateStatus is BEHIND - exiting isOutdated logic early'
  )
})
