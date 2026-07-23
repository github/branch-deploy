import assert from 'node:assert/strict'
import {beforeEach, test} from 'node:test'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {selectedRefMatches} from '../../src/functions/selected-ref-check.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  assertNotCalled,
  createMock
} from '../node-test-helpers.ts'

type Octokit = Parameters<typeof selectedRefMatches>[0]

const getPullMock = createMock<Octokit['rest']['pulls']['get']>()
const getBranchMock = createMock<Octokit['rest']['repos']['getBranch']>()
const octokit: Octokit = {
  rest: {
    pulls: {get: getPullMock},
    repos: {getBranch: getBranchMock}
  }
}
const context = createContext({
  issue: {number: 42},
  repo: {owner: 'corp', repo: 'test'}
})
const request = {
  exactSha: false,
  expectedSha: 'expected',
  isFork: false,
  stableBranch: 'main',
  stableBranchUsed: false
} as const

beforeEach(() => {
  getPullMock.mock.resetCalls()
  getBranchMock.mock.resetCalls()
})

for (const immutable of [
  {...request, exactSha: true},
  {...request, isFork: true}
] as const) {
  test(`does not re-fetch immutable ref ${JSON.stringify(immutable)}`, async () => {
    assert.strictEqual(
      await selectedRefMatches(octokit, context, immutable),
      true
    )
    assertNotCalled(getPullMock)
    assertNotCalled(getBranchMock)
  })
}

test('re-fetches and accepts an unchanged pull request head', async () => {
  getPullMock.mock.mockImplementation(() =>
    Promise.resolve({data: {head: {sha: 'expected'}}})
  )

  assert.strictEqual(await selectedRefMatches(octokit, context, request), true)
  assertCalledWith(getPullMock, {
    owner: 'corp',
    repo: 'test',
    pull_number: 42,
    headers: API_HEADERS
  })
})

test('rejects a changed pull request head', async () => {
  getPullMock.mock.mockImplementation(() =>
    Promise.resolve({data: {head: {sha: 'changed'}}})
  )

  assert.strictEqual(await selectedRefMatches(octokit, context, request), false)
})

test('re-fetches the selected stable branch', async () => {
  getBranchMock.mock.mockImplementation(() =>
    Promise.resolve({data: {commit: {sha: 'expected'}}})
  )
  const stableRequest = {...request, stableBranchUsed: true}

  assert.strictEqual(
    await selectedRefMatches(octokit, context, stableRequest),
    true
  )
  assertCalledWith(getBranchMock, {
    owner: 'corp',
    repo: 'test',
    branch: 'main',
    headers: API_HEADERS
  })
  assertNotCalled(getPullMock)
})

test('rejects a changed stable branch', async () => {
  getBranchMock.mock.mockImplementation(() =>
    Promise.resolve({data: {commit: {sha: 'changed'}}})
  )

  assert.strictEqual(
    await selectedRefMatches(octokit, context, {
      ...request,
      stableBranchUsed: true
    }),
    false
  )
})

for (const [description, actualSha, matches] of [
  ['unchanged', 'expected', true],
  ['changed', 'changed', false]
] as const) {
  test(`re-fetches an ${description} stable branch selected from a fork`, async () => {
    getBranchMock.mock.mockImplementation(() =>
      Promise.resolve({data: {commit: {sha: actualSha}}})
    )

    assert.strictEqual(
      await selectedRefMatches(octokit, context, {
        ...request,
        isFork: true,
        stableBranchUsed: true
      }),
      matches
    )
    assertCalledWith(getBranchMock, {
      owner: 'corp',
      repo: 'test',
      branch: 'main',
      headers: API_HEADERS
    })
    assertNotCalled(getPullMock)
  })
}
