import assert from 'node:assert/strict'
import {beforeEach, test} from 'node:test'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {selectedRefMatches} from '../../src/functions/selected-ref-check.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledTimes,
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
  {...request, isFork: true},
  {...request, exactSha: true, expectNoStack: true},
  {...request, isFork: true, expectNoStack: false},
  {...request, exactSha: true, isFork: true, expectNoStack: true}
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

test('rechecks stack membership for a same-repository PR hosted in a fork', async () => {
  getPullMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        head: {sha: 'expected'},
        stack: {number: 7, position: 2, base: {ref: 'main'}}
      }
    })
  )

  assert.strictEqual(
    await selectedRefMatches(octokit, context, {
      ...request,
      isFork: true,
      expectNoStack: true
    }),
    false
  )
  assertCalledTimes(getPullMock, 1)
  assertNotCalled(getBranchMock)
})

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

for (const [description, marker] of [
  ['absent', {}],
  ['undefined', {stack: undefined}],
  ['null', {stack: null}]
] as const) {
  test(`accepts unchanged ordinary PR stack metadata: ${description}`, async () => {
    getPullMock.mock.mockImplementation(() =>
      Promise.resolve({data: {head: {sha: 'expected'}, ...marker}})
    )

    assert.strictEqual(
      await selectedRefMatches(octokit, context, {
        ...request,
        expectNoStack: true
      }),
      true
    )
    assertCalledTimes(getPullMock, 1)
    assertNotCalled(getBranchMock)
  })

  for (const headSha of ['expected', 'changed']) {
    test(`preserves the checked fork SHA with ${description} membership and head ${headSha}`, async () => {
      getPullMock.mock.mockImplementation(() =>
        Promise.resolve({data: {head: {sha: headSha}, ...marker}})
      )

      assert.strictEqual(
        await selectedRefMatches(octokit, context, {
          ...request,
          isFork: true,
          expectNoStack: true
        }),
        true
      )
      assertCalledTimes(getPullMock, 1)
      assertNotCalled(getBranchMock)
    })
  }
}

for (const [description, stack] of [
  ['native', {id: 7}],
  ['empty object', {}],
  ['array', []],
  ['false', false],
  ['zero', 0],
  ['empty string', '']
] as const) {
  for (const isFork of [false, true]) {
    test(
      `rejects newly present stack metadata (${description}) with an unchanged head` +
        (isFork ? ' in a fork repository' : ''),
      async () => {
        getPullMock.mock.mockImplementation(() =>
          Promise.resolve({data: {head: {sha: 'expected'}, stack}})
        )

        assert.strictEqual(
          await selectedRefMatches(octokit, context, {
            ...request,
            isFork,
            expectNoStack: true
          }),
          false
        )
        assertCalledTimes(getPullMock, 1)
        assertNotCalled(getBranchMock)
      }
    )
  }
}

test('does not accept a fork membership recheck when the pull lookup fails', async () => {
  const error = new Error('Pull request unavailable')
  getPullMock.mock.mockImplementation(() => Promise.reject(error))

  await assert.rejects(
    selectedRefMatches(octokit, context, {
      ...request,
      isFork: true,
      expectNoStack: true
    }),
    error
  )
  assertCalledTimes(getPullMock, 1)
  assertNotCalled(getBranchMock)
})

for (const ordinaryRequest of [request, {...request, expectNoStack: false}]) {
  test(`ignores stack membership without an opt-in ${JSON.stringify(ordinaryRequest)}`, async () => {
    getPullMock.mock.mockImplementation(() =>
      Promise.resolve({data: {head: {sha: 'expected'}, stack: {id: 7}}})
    )

    assert.strictEqual(
      await selectedRefMatches(octokit, context, ordinaryRequest),
      true
    )
    assertCalledTimes(getPullMock, 1)
    assertNotCalled(getBranchMock)
  })
}

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

for (const isFork of [false, true]) {
  test(`keeps stable-branch rechecks independent of stack membership with fork ${String(isFork)}`, async () => {
    getBranchMock.mock.mockImplementation(() =>
      Promise.resolve({data: {commit: {sha: 'expected'}}})
    )

    assert.strictEqual(
      await selectedRefMatches(octokit, context, {
        ...request,
        expectNoStack: true,
        isFork,
        stableBranchUsed: true
      }),
      true
    )
    assertCalledTimes(getBranchMock, 1)
    assertNotCalled(getPullMock)
  })
}

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
