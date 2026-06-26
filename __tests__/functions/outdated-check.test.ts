import * as core from '@actions/core'
import {vi, expect, test, beforeEach} from 'vitest'
import {isOutdated} from '../../src/functions/outdated-check.ts'
import {COLORS} from '../../src/functions/colors.ts'
import {createContext} from '../test-helpers.ts'

const debugMock = vi.spyOn(core, 'debug')
const warningMock = vi.spyOn(core, 'warning')

let context: Parameters<typeof isOutdated>[0]
let octokit: Parameters<typeof isOutdated>[1]
let data: Parameters<typeof isOutdated>[2]
const compareCommitsMock =
  vi.fn<Parameters<typeof isOutdated>[1]['rest']['repos']['compareCommits']>()

beforeEach(() => {
  vi.clearAllMocks()

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

  compareCommitsMock.mockResolvedValue({data: {behind_by: 0}})
  octokit = {
    rest: {
      repos: {
        compareCommits: compareCommitsMock
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

  compareCommitsMock.mockResolvedValue({data: {behind_by: 1}})

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
  compareCommitsMock.mockResolvedValue({data: {behind_by: 1}})
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
  compareCommitsMock.mockResolvedValue({data: {behind_by: 45}})
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
  compareCommitsMock
    .mockResolvedValueOnce({data: {behind_by: 0}})
    .mockResolvedValueOnce({data: {behind_by: 1}})
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
