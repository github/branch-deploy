import * as core from '@actions/core'
import {
  jest,
  expect,
  describe,
  test,
  beforeEach,
  afterEach
} from '@jest/globals'
import {isOutdated} from '../../src/functions/outdated-check.js'
import {COLORS} from '../../src/functions/colors.js'

const debugMock = jest.spyOn(core, 'debug')
const warningMock = jest.spyOn(core, 'warning')

var context
var octokit
var data

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})

  data = {
    outdated_mode: 'strict',
    mergeStateStatus: 'CLEAN',
    stableBaseBranch: {
      data: {
        commit: {sha: 'beefdead'},
        name: 'stable-branch'
      },
      status: 200
    },
    baseBranch: {
      data: {
        commit: {sha: 'deadbeef'},
        name: 'test-branch'
      },
      status: 200
    },
    pr: {
      data: {
        head: {
          ref: 'test-ref',
          sha: 'abc123'
        },
        base: {
          ref: 'base-ref'
        }
      },
      status: 200
    }
  }

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    }
  }

  octokit = {
    rest: {
      repos: {
        compareCommits: jest
          .fn()
          .mockReturnValue({data: {behind_by: 0}, status: 200})
      }
    }
  }
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not', async () => {
  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'test-branch|stable-branch',
    outdated: false
  })
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not, when the stable branch and base branch are the same (i.e a PR to main)', async () => {
  data.baseBranch = data.stableBaseBranch
  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'stable-branch|stable-branch',
    outdated: false
  })
})

test('checks if the branch is out-of-date via commit comparison and finds that it is, when the stable branch and base branch are the same (i.e a PR to main)', async () => {
  data.baseBranch = data.stableBaseBranch

  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValue({data: {behind_by: 1}, status: 200})

  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'stable-branch',
    outdated: true
  })
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not using outdated_mode pr_base', async () => {
  data.outdated_mode = 'pr_base'
  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'test-branch',
    outdated: false
  })
  expect(debugMock).toHaveBeenCalledWith(
    'checking isOutdated with pr_base mode'
  )
})

test('checks if the branch is out-of-date via commit comparison and finds that it is not using outdated_mode default_branch', async () => {
  data.outdated_mode = 'default_branch'
  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'stable-branch',
    outdated: false
  })
  expect(debugMock).toHaveBeenCalledWith(
    'checking isOutdated with default_branch mode'
  )
})

test('checks if the branch is out-of-date via commit comparison and finds that it is', async () => {
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValue({data: {behind_by: 1}, status: 200})
  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'test-branch',
    outdated: true
  })
  expect(debugMock).toHaveBeenCalledWith('checking isOutdated with strict mode')
  expect(warningMock).toHaveBeenCalledWith(
    `The PR branch is behind the base branch by ${COLORS.highlight}1 commit${COLORS.reset}`
  )
})

test('checks if the branch is out-of-date via commit comparison and finds that it is by many commits', async () => {
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValue({data: {behind_by: 45}, status: 200})
  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'test-branch',
    outdated: true
  })
  expect(debugMock).toHaveBeenCalledWith('checking isOutdated with strict mode')
  expect(warningMock).toHaveBeenCalledWith(
    `The PR branch is behind the base branch by ${COLORS.highlight}45 commits${COLORS.reset}`
  )
})

test('checks if the branch is out-of-date via commit comparison and finds that it is only behind the stable branch', async () => {
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockImplementationOnce(() =>
      Promise.resolve({data: {behind_by: 0}, status: 200})
    )
    .mockImplementationOnce(() =>
      Promise.resolve({data: {behind_by: 1}, status: 200})
    )
  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'stable-branch',
    outdated: true
  })
  expect(debugMock).toHaveBeenCalledWith('checking isOutdated with strict mode')
})

test('checks the mergeStateStatus and finds that it is BEHIND', async () => {
  data.mergeStateStatus = 'BEHIND'
  expect(await isOutdated(context, octokit, data)).toStrictEqual({
    branch: 'test-branch',
    outdated: true
  })
  expect(debugMock).toHaveBeenCalledWith(
    'mergeStateStatus is BEHIND - exiting isOutdated logic early'
  )
})
