import assert from 'node:assert/strict'
import {beforeEach, test} from 'node:test'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {
  parsePrStackMembership,
  prStackSnapshotMatches,
  resolvePrStack,
  type PrStackPull,
  type PrStackRequest,
  type PrStackSnapshot,
  type PrStacksOctokit
} from '../../src/functions/pr-stacks.ts'
import {
  assertCalledTimes,
  assertNotCalled,
  createMock,
  queueMockImplementation
} from '../node-test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

const REPOSITORY = {id: 'R_example', nameWithOwner: 'example/project'}
const STACK_ID = 'S_example'
const TRUNK_SHA = '0'.repeat(40)

interface WirePull {
  id: string
  number: number
  baseRefName: string
  baseRefOid: string
  headRefName: string
  headRefOid: string
  state: PrStackPull['state']
  isDraft: boolean
  repository: {id: string; nameWithOwner: string}
  headRepository: {id: string; nameWithOwner: string}
}

interface WireEntry {
  id: string
  position: number
  stack: {id: string}
  pullRequest: WirePull
}

interface ResponseOptions {
  readonly nodes?: readonly WireEntry[]
  readonly size?: number
  readonly stableSha?: string
  readonly hasNextPage?: boolean
  readonly endCursor?: string | null
}

function commitSha(position: number): string {
  return position.toString(16).padStart(40, '0')
}

function members(count = 3): WireEntry[] {
  const result: WireEntry[] = []
  let baseRef = 'main'
  let baseSha = TRUNK_SHA
  for (let position = 1; position <= count; position++) {
    const headRef = `layer-${position}`
    const headSha = commitSha(position)
    result.push({
      id: `SE_${position}`,
      position,
      stack: {id: STACK_ID},
      pullRequest: {
        id: `PR_${100 + position}`,
        number: 100 + position,
        baseRefName: baseRef,
        baseRefOid: baseSha,
        headRefName: headRef,
        headRefOid: headSha,
        state: 'OPEN',
        isDraft: false,
        repository: {...REPOSITORY},
        headRepository: {...REPOSITORY}
      }
    })
    baseRef = headRef
    baseSha = headSha
  }
  return result
}

function entryAt(entries: readonly WireEntry[], index: number): WireEntry {
  const entry = entries[index]
  assert.ok(entry !== undefined)
  return entry
}

function response(
  entries = members(),
  selectedPosition = entries.length,
  options: ResponseOptions = {}
) {
  const size = options.size ?? entries.length
  return {
    repository: {
      ...REPOSITORY,
      ref: {name: 'main', target: {oid: options.stableSha ?? TRUNK_SHA}},
      pullRequest: {
        ...entryAt(entries, selectedPosition - 1).pullRequest,
        stackEntry: {position: selectedPosition},
        stack: {
          id: STACK_ID,
          number: 7,
          size,
          baseRefName: 'main',
          entries: {
            totalCount: size,
            pageInfo: {
              hasNextPage: options.hasNextPage ?? false,
              endCursor: options.endCursor ?? null
            },
            nodes: options.nodes ?? entries
          }
        }
      }
    }
  }
}

function standalone() {
  const result = response()
  return {
    repository: {
      ...result.repository,
      pullRequest: {
        ...result.repository.pullRequest,
        headRepository: {id: 'R_fork', nameWithOwner: 'contributor/project'},
        stack: null,
        stackEntry: null
      }
    }
  }
}

function invalidResponse(path: readonly string[], value: unknown): unknown {
  const result = response()
  let target = unsafeInvalidValue<Record<string, unknown>>(result)
  for (const key of path.slice(0, -1)) {
    target = unsafeInvalidValue<Record<string, unknown>>(target[key])
  }
  const key = path.at(-1)
  assert.ok(key !== undefined)
  target[key] = value
  return result
}

function requestFor(position: number): PrStackRequest {
  return {
    owner: 'example',
    repo: 'project',
    pullNumber: 100 + position,
    expectedHeadSha: commitSha(position),
    stableBranch: 'main'
  }
}

function snapshotPull(entry: WireEntry): PrStackPull {
  const pull = entry.pullRequest
  return {
    id: pull.id,
    number: pull.number,
    position: entry.position,
    baseRef: pull.baseRefName,
    baseSha: pull.baseRefOid,
    headRef: pull.headRefName,
    headSha: pull.headRefOid,
    state: pull.state,
    isDraft: pull.isDraft
  }
}

function expectedSnapshot(
  entries = members(),
  selectedPosition = entries.length
): PrStackSnapshot {
  return {
    repositoryId: REPOSITORY.id,
    repository: REPOSITORY.nameWithOwner,
    stackId: STACK_ID,
    stackNumber: 7,
    stableBranch: 'main',
    stableSha: TRUNK_SHA,
    selectedPullNumber: 100 + selectedPosition,
    selectedPosition,
    selectedHeadSha: commitSha(selectedPosition),
    pullRequests: entries.slice(0, selectedPosition).map(snapshotPull)
  }
}

const graphqlMock = createMock<PrStacksOctokit['graphql']>()
const compareMock =
  createMock<PrStacksOctokit['rest']['repos']['compareCommits']>()
const octokit: PrStacksOctokit = {
  graphql: graphqlMock,
  rest: {repos: {compareCommits: compareMock}}
}
const request = requestFor(3)

beforeEach(() => {
  graphqlMock.mock.resetCalls()
  compareMock.mock.resetCalls()
  graphqlMock.mock.mockImplementation(() => Promise.resolve(response()))
  compareMock.mock.mockImplementation(parameters => {
    assert.ok(parameters !== undefined)
    return Promise.resolve({
      data: {
        status: parameters.base === parameters.head ? 'identical' : 'ahead',
        behind_by: 0,
        base_commit: {sha: parameters.base},
        merge_base_commit: {sha: parameters.base}
      }
    })
  })
})

for (const value of [undefined, null]) {
  test('accepts absent REST stack membership: ' + String(value), () => {
    assert.strictEqual(parsePrStackMembership(value), null)
  })
}

test('reads only the REST stack membership fields needed for validation', () => {
  assert.deepStrictEqual(
    parsePrStackMembership({number: 7, position: 1, base: {ref: 'main'}}),
    {number: 7, position: 1, baseRef: 'main'}
  )
  assert.deepStrictEqual(
    parsePrStackMembership({
      id: 123456,
      number: 7,
      position: 3,
      size: 4,
      base: {ref: 'main', sha: null}
    }),
    {number: 7, position: 3, baseRef: 'main'}
  )
})

for (const [description, value] of [
  ['false', false],
  ['zero', 0],
  ['empty string', ''],
  ['array', []],
  ['missing number', {}],
  ['invalid number', {number: '7', position: 1, base: {ref: 'main'}}],
  ['missing position', {number: 7, base: {ref: 'main'}}],
  ['invalid position', {number: 7, position: 0, base: {ref: 'main'}}],
  ['missing base', {number: 7, position: 1}],
  ['null base', {number: 7, position: 1, base: null}],
  ['missing base ref', {number: 7, position: 1, base: {}}],
  ['empty base ref', {number: 7, position: 1, base: {ref: ''}}]
] as const) {
  test('rejects malformed REST stack membership: ' + description, () => {
    assert.throws(
      () => parsePrStackMembership(value),
      /Cannot verify pull request stack:/u
    )
  })
}

test('resolves the ordered native stack prefix at exact commit SHAs', async () => {
  assert.deepStrictEqual(
    await resolvePrStack(octokit, request),
    expectedSnapshot()
  )
  const firstCall = graphqlMock.mock.calls[0]
  assert.ok(firstCall !== undefined)
  assert.match(firstCall.arguments[0], /query BranchDeployPullRequestStack\(/u)
  assert.deepStrictEqual(firstCall.arguments[1], {
    owner: 'example',
    repo: 'project',
    pullNumber: 103,
    stableRef: 'refs/heads/main',
    cursor: null
  })
  assert.deepStrictEqual(
    compareMock.mock.calls.map(call => call.arguments[0]),
    members().map(entry => ({
      owner: 'example',
      repo: 'project',
      base: entry.pullRequest.baseRefOid,
      head: entry.pullRequest.headRefOid,
      headers: API_HEADERS
    }))
  )
})

test('returns null only for a confirmed standalone pull request', async () => {
  graphqlMock.mock.mockImplementation(() => Promise.resolve(standalone()))
  assert.strictEqual(await resolvePrStack(octokit, request), null)
  assertNotCalled(compareMock)
})

test('allows repository names with different letter casing', async () => {
  assert.deepStrictEqual(
    await resolvePrStack(octokit, {
      ...request,
      owner: 'Example',
      repo: 'Project'
    }),
    {...expectedSnapshot(), repository: 'Example/Project'}
  )
})

test('ignores unrelated later layers when deploying a middle layer', async () => {
  const entries = members()
  const later = entryAt(entries, 2).pullRequest
  later.state = 'CLOSED'
  later.isDraft = true
  later.baseRefName = 'unrelated'
  later.baseRefOid = commitSha(20)
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(response(entries, 2))
  )
  assert.deepStrictEqual(
    await resolvePrStack(octokit, requestFor(2)),
    expectedSnapshot(entries, 2)
  )
  assertCalledTimes(compareMock, 2)
})

test('resolves a bottom stack member targeting the stable branch', async () => {
  const entries = members()
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(response(entries, 1))
  )

  assert.deepStrictEqual(
    await resolvePrStack(octokit, requestFor(1)),
    expectedSnapshot(entries, 1)
  )
  assertCalledTimes(compareMock, 1)
})

test('preserves draft state for the caller to evaluate', async () => {
  const entries = members()
  entryAt(entries, 0).pullRequest.isDraft = true
  graphqlMock.mock.mockImplementation(() => Promise.resolve(response(entries)))
  assert.deepStrictEqual(
    await resolvePrStack(octokit, request),
    expectedSnapshot(entries)
  )
})

test('skips merged lower layers and validates the current trunk', async () => {
  const entries = members()
  entryAt(entries, 0).pullRequest.state = 'MERGED'
  const firstUnmerged = entryAt(entries, 1).pullRequest
  firstUnmerged.baseRefName = 'main'
  firstUnmerged.baseRefOid = commitSha(20)
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(response(entries, 3, {stableSha: commitSha(20)}))
  )
  assert.deepStrictEqual(await resolvePrStack(octokit, request), {
    ...expectedSnapshot(entries),
    stableSha: commitSha(20),
    pullRequests: entries.slice(1).map(snapshotPull)
  })
  assert.deepStrictEqual(
    compareMock.mock.calls.map(call => call.arguments[0]?.base),
    [commitSha(20), commitSha(2)]
  )
})

test('resolves the last remaining member after lower stack PRs merge', async () => {
  const entries = members()
  entryAt(entries, 0).pullRequest.state = 'MERGED'
  entryAt(entries, 1).pullRequest.state = 'MERGED'
  const selected = entryAt(entries, 2).pullRequest
  selected.baseRefName = 'main'
  selected.baseRefOid = commitSha(20)
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(response(entries, 3, {stableSha: commitSha(20)}))
  )

  assert.deepStrictEqual(await resolvePrStack(octokit, request), {
    ...expectedSnapshot(entries),
    stableSha: commitSha(20),
    pullRequests: entries.slice(2).map(snapshotPull)
  })
  assertCalledTimes(compareMock, 1)
})

test('accepts an identical parent commit without weakening ancestry checks', async () => {
  const entries = members()
  entryAt(entries, 0).pullRequest.headRefOid = TRUNK_SHA
  entryAt(entries, 1).pullRequest.baseRefOid = TRUNK_SHA
  graphqlMock.mock.mockImplementation(() => Promise.resolve(response(entries)))
  assert.deepStrictEqual(
    await resolvePrStack(octokit, request),
    expectedSnapshot(entries)
  )
})

test('normalizes complete uppercase 64-character commit SHAs', async () => {
  const entries = members(1)
  const selected = entryAt(entries, 0).pullRequest
  selected.baseRefOid = 'A'.repeat(64)
  selected.headRefOid = 'B'.repeat(64)
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(response(entries, 1, {stableSha: 'A'.repeat(64)}))
  )
  const result = await resolvePrStack(octokit, {
    ...requestFor(1),
    expectedHeadSha: 'B'.repeat(64)
  })
  assert.ok(result !== null)
  assert.strictEqual(result.stableSha, 'a'.repeat(64))
  assert.strictEqual(result.selectedHeadSha, 'b'.repeat(64))
  assert.deepStrictEqual(result.pullRequests[0], {
    ...snapshotPull(entryAt(entries, 0)),
    baseSha: 'a'.repeat(64),
    headSha: 'b'.repeat(64)
  })
})

test('paginates a stack prefix larger than 100 entries', async () => {
  const entries = members(101)
  queueMockImplementation(
    graphqlMock,
    () =>
      Promise.resolve(
        response(entries, 101, {
          nodes: entries.slice(0, 100),
          hasNextPage: true,
          endCursor: 'cursor-100'
        })
      ),
    () =>
      Promise.resolve(
        response(entries, 101, {
          nodes: entries.slice(100),
          endCursor: 'cursor-101'
        })
      )
  )
  assert.deepStrictEqual(
    await resolvePrStack(octokit, requestFor(101)),
    expectedSnapshot(entries)
  )
  assertCalledTimes(graphqlMock, 2)
  assert.strictEqual(
    graphqlMock.mock.calls[1]?.arguments[1]['cursor'],
    'cursor-100'
  )
  assertCalledTimes(compareMock, 101)
})

test('permits an upper layer to be added while reading an unchanged prefix', async () => {
  const entries = members()
  queueMockImplementation(
    graphqlMock,
    () =>
      Promise.resolve(
        response(entries, 3, {
          nodes: entries.slice(0, 1),
          hasNextPage: true,
          endCursor: 'cursor-1'
        })
      ),
    () =>
      Promise.resolve(response(entries, 3, {nodes: entries.slice(1), size: 4}))
  )
  assert.deepStrictEqual(
    await resolvePrStack(octokit, request),
    expectedSnapshot()
  )
})

const invalidPaths: readonly (readonly [string, readonly string[], unknown])[] =
  [
    ['missing repository', ['repository'], undefined],
    ['array repository', ['repository'], []],
    ['empty repository ID', ['repository', 'id'], ''],
    ['wrong repository', ['repository', 'nameWithOwner'], 'example/other'],
    ['missing selected PR', ['repository', 'pullRequest'], null],
    ['wrong selected number', ['repository', 'pullRequest', 'number'], 104],
    ['non-number PR number', ['repository', 'pullRequest', 'number'], '103'],
    ['fractional PR number', ['repository', 'pullRequest', 'number'], 103.5],
    ['zero PR number', ['repository', 'pullRequest', 'number'], 0],
    [
      'invalid selected SHA',
      ['repository', 'pullRequest', 'headRefOid'],
      'main'
    ],
    [
      'changed selected SHA',
      ['repository', 'pullRequest', 'headRefOid'],
      commitSha(4)
    ],
    ['missing stack', ['repository', 'pullRequest', 'stack'], undefined],
    [
      'null stack with membership',
      ['repository', 'pullRequest', 'stack'],
      null
    ],
    [
      'missing selected entry',
      ['repository', 'pullRequest', 'stackEntry'],
      null
    ],
    ['missing trunk', ['repository', 'ref'], null],
    ['wrong trunk', ['repository', 'ref', 'name'], 'release'],
    [
      'invalid trunk SHA',
      ['repository', 'ref', 'target', 'oid'],
      'g'.repeat(40)
    ],
    [
      'wrong stack base',
      ['repository', 'pullRequest', 'stack', 'baseRefName'],
      'release'
    ],
    [
      'invalid stack number',
      ['repository', 'pullRequest', 'stack', 'number'],
      Number.NaN
    ],
    [
      'position outside stack',
      ['repository', 'pullRequest', 'stackEntry', 'position'],
      4
    ],
    [
      'wrong total count',
      ['repository', 'pullRequest', 'stack', 'entries', 'totalCount'],
      4
    ],
    [
      'missing entries',
      ['repository', 'pullRequest', 'stack', 'entries', 'nodes'],
      null
    ],
    [
      'invalid page boolean',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'pageInfo',
        'hasNextPage'
      ],
      1
    ],
    [
      'missing cursor',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'pageInfo',
        'endCursor'
      ],
      undefined
    ],
    [
      'empty cursor',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'pageInfo',
        'endCursor'
      ],
      ''
    ],
    [
      'wrong selected repository ID',
      ['repository', 'pullRequest', 'repository', 'id'],
      'R_other'
    ],
    [
      'wrong selected head repository',
      ['repository', 'pullRequest', 'headRepository', 'nameWithOwner'],
      'contributor/project'
    ],
    [
      'invalid selected draft state',
      ['repository', 'pullRequest', 'isDraft'],
      null
    ],
    [
      'invalid selected state',
      ['repository', 'pullRequest', 'state'],
      'UNKNOWN'
    ],
    [
      'invalid selected base SHA',
      ['repository', 'pullRequest', 'baseRefOid'],
      `${commitSha(2)}\n`
    ],
    [
      'invalid selected head ref',
      ['repository', 'pullRequest', 'headRefName'],
      2
    ],
    [
      'missing entry',
      ['repository', 'pullRequest', 'stack', 'entries', 'nodes', '0'],
      null
    ],
    [
      'wrong entry stack',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '0',
        'stack',
        'id'
      ],
      'S_other'
    ],
    [
      'wrong entry position',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '0',
        'position'
      ],
      2
    ],
    [
      'duplicate entry ID',
      ['repository', 'pullRequest', 'stack', 'entries', 'nodes', '1', 'id'],
      'SE_1'
    ],
    [
      'duplicate pull ID',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '1',
        'pullRequest',
        'id'
      ],
      'PR_101'
    ],
    [
      'duplicate pull number',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '1',
        'pullRequest',
        'number'
      ],
      101
    ],
    [
      'duplicate head ref',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '1',
        'pullRequest',
        'headRefName'
      ],
      'layer-1'
    ],
    [
      'head ref equals trunk',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '0',
        'pullRequest',
        'headRefName'
      ],
      'main'
    ],
    [
      'cross-repository member',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '0',
        'pullRequest',
        'headRepository',
        'id'
      ],
      'R_fork'
    ],
    [
      'missing head repository',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '0',
        'pullRequest',
        'headRepository'
      ],
      null
    ],
    [
      'selected entry mismatch',
      [
        'repository',
        'pullRequest',
        'stack',
        'entries',
        'nodes',
        '2',
        'pullRequest',
        'id'
      ],
      'PR_other'
    ]
  ]

for (const [name, path, value] of invalidPaths) {
  test(`rejects ${name}`, async () => {
    graphqlMock.mock.mockImplementation(() =>
      Promise.resolve(invalidResponse(path, value))
    )
    await assert.rejects(
      resolvePrStack(octokit, request),
      /Cannot verify pull request stack:/u
    )
    assertNotCalled(compareMock)
  })
}

for (const value of [null, [], 'invalid'] as const) {
  test(`rejects malformed GraphQL result ${JSON.stringify(value)}`, async () => {
    graphqlMock.mock.mockImplementation(() => Promise.resolve(value))
    await assert.rejects(
      resolvePrStack(octokit, request),
      /incomplete response/u
    )
  })
}

test('rejects a response larger than the requested page', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(response(members(101)))
  )
  await assert.rejects(
    resolvePrStack(octokit, requestFor(101)),
    /invalid stack page size/u
  )
})

const incompletePages: readonly (readonly [string, ResponseOptions])[] = [
  ['no progress', {nodes: [], hasNextPage: true, endCursor: 'cursor-1'}],
  ['truncated membership', {nodes: members().slice(0, 1)}],
  ['missing next cursor', {nodes: members().slice(0, 1), hasNextPage: true}]
]

for (const [name, options] of incompletePages) {
  test(`rejects pagination with ${name}`, async () => {
    graphqlMock.mock.mockImplementation(() =>
      Promise.resolve(response(members(), 3, options))
    )
    await assert.rejects(
      resolvePrStack(octokit, request),
      /incomplete stack membership/u
    )
    assertNotCalled(compareMock)
  })
}

test('rejects a repeated pagination cursor', async () => {
  const entries = members()
  queueMockImplementation(
    graphqlMock,
    () =>
      Promise.resolve(
        response(entries, 3, {
          nodes: entries.slice(0, 1),
          hasNextPage: true,
          endCursor: 'same-cursor'
        })
      ),
    () =>
      Promise.resolve(
        response(entries, 3, {
          nodes: entries.slice(1, 2),
          hasNextPage: true,
          endCursor: 'same-cursor'
        })
      )
  )
  await assert.rejects(
    resolvePrStack(octokit, request),
    /incomplete stack membership/u
  )
})

for (const change of ['membership', 'identity', 'selected'] as const) {
  test(`rejects changing ${change} between stack pages`, async () => {
    const entries = members()
    const next = response(entries, 3, {nodes: entries.slice(1)})
    if (change === 'identity') next.repository.pullRequest.stack.id = 'S_other'
    if (change === 'selected') next.repository.pullRequest.isDraft = true
    queueMockImplementation(
      graphqlMock,
      () =>
        Promise.resolve(
          response(entries, 3, {
            nodes: entries.slice(0, 1),
            hasNextPage: true,
            endCursor: 'cursor-1'
          })
        ),
      () => Promise.resolve(change === 'membership' ? standalone() : next)
    )
    await assert.rejects(
      resolvePrStack(octokit, request),
      /stack changed while it was being read/u
    )
    assertNotCalled(compareMock)
  })
}

for (const change of ['closed', 'merged', 'base-ref', 'base-sha'] as const) {
  test(`rejects invalid prefix ${change}`, async () => {
    const entries = members()
    const middle = entryAt(entries, 1).pullRequest
    if (change === 'closed') middle.state = 'CLOSED'
    if (change === 'merged') middle.state = 'MERGED'
    if (change === 'base-ref') middle.baseRefName = 'other'
    if (change === 'base-sha') middle.baseRefOid = commitSha(20)
    graphqlMock.mock.mockImplementation(() =>
      Promise.resolve(response(entries))
    )
    await assert.rejects(
      resolvePrStack(octokit, request),
      /Cannot verify pull request stack:/u
    )
  })
}

test('rejects an already merged selected pull request', async () => {
  const entries = members()
  for (const entry of entries) entry.pullRequest.state = 'MERGED'
  graphqlMock.mock.mockImplementation(() => Promise.resolve(response(entries)))
  await assert.rejects(
    resolvePrStack(octokit, request),
    /selected pull request is not open/u
  )
  assertNotCalled(compareMock)
})

const invalidComparisons: readonly unknown[] = [
  null,
  {status: 'diverged', behind_by: 0},
  {status: 'ahead', behind_by: 1},
  {status: 'ahead', behind_by: 0, base_commit: null},
  {
    status: 'ahead',
    behind_by: 0,
    base_commit: {sha: commitSha(10)}
  },
  {
    status: 'ahead',
    behind_by: 0,
    base_commit: {sha: TRUNK_SHA},
    merge_base_commit: {sha: commitSha(10)}
  }
]

for (const [index, data] of invalidComparisons.entries()) {
  test(`rejects invalid ancestry comparison ${index + 1}`, async () => {
    compareMock.mock.mockImplementation(() => Promise.resolve({data}))
    await assert.rejects(
      resolvePrStack(octokit, request),
      /Cannot verify pull request stack:/u
    )
  })
}

test('propagates stack API errors', async () => {
  const failure = new Error('Stack API unavailable')
  graphqlMock.mock.mockImplementation(() => Promise.reject(failure))
  await assert.rejects(resolvePrStack(octokit, request), failure)
})

test('propagates commit comparison errors', async () => {
  const failure = new Error('Commit comparison unavailable')
  compareMock.mock.mockImplementation(() => Promise.reject(failure))
  await assert.rejects(resolvePrStack(octokit, request), failure)
})

test('revalidates an unchanged snapshot before deployment', async () => {
  assert.strictEqual(
    await prStackSnapshotMatches(octokit, expectedSnapshot()),
    true
  )
  assertCalledTimes(graphqlMock, 1)
  assertCalledTimes(compareMock, 3)
})

test('ignores stack-size changes above the selected prefix', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(response(members(), 3, {size: 4}))
  )
  assert.strictEqual(
    await prStackSnapshotMatches(octokit, expectedSnapshot()),
    true
  )
})

test('rejects an unstacked snapshot before deployment', async () => {
  graphqlMock.mock.mockImplementation(() => Promise.resolve(standalone()))
  assert.strictEqual(
    await prStackSnapshotMatches(octokit, expectedSnapshot()),
    false
  )
})

test('rejects a changed effective prefix before deployment', async () => {
  const entries = members()
  entryAt(entries, 0).pullRequest.isDraft = true
  graphqlMock.mock.mockImplementation(() => Promise.resolve(response(entries)))
  assert.strictEqual(
    await prStackSnapshotMatches(octokit, expectedSnapshot()),
    false
  )
})

test('does not hide a changed selected head during snapshot revalidation', async () => {
  graphqlMock.mock.mockImplementation(() =>
    Promise.resolve(
      invalidResponse(['repository', 'pullRequest', 'headRefOid'], commitSha(4))
    )
  )
  await assert.rejects(
    prStackSnapshotMatches(octokit, expectedSnapshot()),
    /selected pull request changed/u
  )
})
