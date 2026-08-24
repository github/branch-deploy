import assert from 'node:assert/strict'
import {beforeEach, test} from 'node:test'
import {API_HEADERS} from '../../src/functions/api-headers.ts'
import {
  loadPrStackRequiredChecks,
  type PrStackRequiredChecksOctokit
} from '../../src/functions/pr-stack-checks.ts'
import {
  assertCalledTimes,
  assertNotCalled,
  createMock,
  queueMockImplementation
} from '../node-test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

const STABLE_SHA = 'a'.repeat(40)
type Request = Parameters<typeof loadPrStackRequiredChecks>[1]

interface BranchOptions {
  readonly name?: string
  readonly sha?: string
  readonly enabled?: boolean
  readonly enforcement?: 'off' | 'non_admins' | 'everyone'
  readonly contexts?: readonly unknown[]
  readonly checks?: readonly unknown[]
}

function branch(options: BranchOptions = {}) {
  return {
    name: options.name ?? 'main',
    commit: {sha: options.sha ?? STABLE_SHA},
    protected: true,
    protection: {
      enabled: options.enabled ?? false,
      required_status_checks: {
        enforcement_level: options.enforcement ?? 'off',
        contexts: options.contexts ?? [],
        checks: options.checks ?? []
      }
    }
  }
}

function requestFor(value: unknown = branch()): Request {
  return {
    owner: 'example',
    repo: 'project',
    stableBranch: 'main',
    stableSha: STABLE_SHA,
    branch: value
  }
}

function statusRule(checks: readonly unknown[] = []) {
  return {
    type: 'required_status_checks',
    ruleset_id: 1,
    parameters: {
      required_status_checks: checks,
      strict_required_status_checks_policy: true
    }
  }
}

function otherRules(start = 1): readonly unknown[] {
  return Array.from({length: 100}, (_, index) => ({
    type: 'deletion',
    ruleset_id: start + index
  }))
}

function invalidBranch(path: readonly string[], value: unknown): unknown {
  const result = branch()
  let target = unsafeInvalidValue<Record<string, unknown>>(result)
  for (const key of path.slice(0, -1)) {
    target = unsafeInvalidValue<Record<string, unknown>>(target[key])
  }
  const key = path.at(-1)
  assert.ok(key !== undefined)
  target[key] = value
  return result
}

const getBranchRulesMock =
  createMock<PrStackRequiredChecksOctokit['rest']['repos']['getBranchRules']>()
const octokit: PrStackRequiredChecksOctokit = {
  rest: {repos: {getBranchRules: getBranchRulesMock}}
}

beforeEach(() => {
  getBranchRulesMock.mock.resetCalls()
  getBranchRulesMock.mock.mockImplementation(() => Promise.resolve({data: []}))
})

test('returns no required checks only after reading both policy sources', async () => {
  assert.deepStrictEqual(
    await loadPrStackRequiredChecks(octokit, requestFor()),
    []
  )
  assert.deepStrictEqual(getBranchRulesMock.mock.calls[0]?.arguments, [
    {
      owner: 'example',
      repo: 'project',
      branch: 'main',
      per_page: 100,
      page: 1,
      headers: API_HEADERS
    }
  ])
})

test('unions classic and ruleset requirements without weakening app identities', async () => {
  const value = branch({
    enabled: true,
    enforcement: 'everyone',
    contexts: ['legacy', 'shared', 'build', 'legacy'],
    checks: [
      {context: 'shared', app_id: 456},
      {context: 'build', app_id: 123},
      {context: 'shared', app_id: 789},
      {context: 'any', app_id: null},
      {context: 'minus-one', app_id: -1}
    ]
  })
  const original = structuredClone(value)
  getBranchRulesMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: [
        {type: 'pull_request', parameters: null},
        statusRule([
          {context: 'shared', integration_id: 900},
          {context: 'build', integration_id: 123},
          {context: 'build', integration_id: null},
          {context: 'shared', integration_id: 456},
          {context: 'rule-only'},
          {context: 'minus-one', integration_id: -1},
          {context: 'any', integration_id: null}
        ])
      ]
    })
  )
  assert.deepStrictEqual(
    await loadPrStackRequiredChecks(octokit, requestFor(value)),
    [
      {context: 'any', appId: null},
      {context: 'build', appId: null},
      {context: 'build', appId: 123},
      {context: 'legacy', appId: null},
      {context: 'minus-one', appId: null},
      {context: 'rule-only', appId: null},
      {context: 'shared', appId: 456},
      {context: 'shared', appId: 789},
      {context: 'shared', appId: 900}
    ]
  )
  assert.deepStrictEqual(value, original)
})

test('uses a legacy classic context only when no detailed check has that name', async () => {
  const value = branch({
    enabled: true,
    enforcement: 'non_admins',
    contexts: ['build', 'fallback', 'Build'],
    checks: [{context: 'build', app_id: 123}]
  })
  assert.deepStrictEqual(
    await loadPrStackRequiredChecks(octokit, requestFor(value)),
    [
      {context: 'Build', appId: null},
      {context: 'build', appId: 123},
      {context: 'fallback', appId: null}
    ]
  )
})

test('sorts any-source requirements before app-bound requirements', async () => {
  getBranchRulesMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: [
        statusRule([{context: 'same'}, {context: 'same', integration_id: 123}])
      ]
    })
  )
  assert.deepStrictEqual(
    await loadPrStackRequiredChecks(octokit, requestFor()),
    [
      {context: 'same', appId: null},
      {context: 'same', appId: 123}
    ]
  )
})

for (const enabled of [false, true]) {
  test(`ignores disabled classic checks when protection enabled is ${String(enabled)}`, async () => {
    const value = branch({
      enabled,
      enforcement: 'off',
      contexts: ['disabled'],
      checks: [{context: 'disabled', app_id: 123}]
    })
    assert.deepStrictEqual(
      await loadPrStackRequiredChecks(octokit, requestFor(value)),
      []
    )
  })
}

test('supports a configured release branch and normalized 64-character SHAs', async () => {
  const stableSha = 'b'.repeat(64)
  const request = {
    ...requestFor(branch({name: 'release/v1', sha: stableSha.toUpperCase()})),
    stableBranch: 'release/v1',
    stableSha
  }
  assert.deepStrictEqual(await loadPrStackRequiredChecks(octokit, request), [])
  assert.equal(
    getBranchRulesMock.mock.calls[0]?.arguments[0]?.branch,
    'release/v1'
  )
})

const classicPaths = ['protection', 'required_status_checks']
const invalidBranches: ReadonlyArray<{
  readonly name: string
  readonly path: readonly string[]
  readonly value: unknown
}> = [
  {name: 'missing branch name', path: ['name'], value: undefined},
  {name: 'empty branch name', path: ['name'], value: ''},
  {name: 'wrong branch name', path: ['name'], value: 'other'},
  {name: 'missing commit', path: ['commit'], value: null},
  {name: 'missing commit SHA', path: ['commit', 'sha'], value: undefined},
  {name: 'invalid commit SHA', path: ['commit', 'sha'], value: 'abc'},
  {name: 'changed commit SHA', path: ['commit', 'sha'], value: 'c'.repeat(40)},
  {name: 'missing protection', path: ['protection'], value: undefined},
  {name: 'array protection', path: ['protection'], value: []},
  {
    name: 'missing classic enabled',
    path: ['protection', 'enabled'],
    value: undefined
  },
  {
    name: 'invalid classic enabled',
    path: ['protection', 'enabled'],
    value: 'false'
  },
  {name: 'missing classic policy', path: classicPaths, value: null},
  {
    name: 'missing enforcement',
    path: [...classicPaths, 'enforcement_level'],
    value: undefined
  },
  {
    name: 'unknown enforcement',
    path: [...classicPaths, 'enforcement_level'],
    value: 'optional'
  },
  {
    name: 'missing contexts',
    path: [...classicPaths, 'contexts'],
    value: undefined
  },
  {name: 'non-array contexts', path: [...classicPaths, 'contexts'], value: {}},
  {name: 'empty context', path: [...classicPaths, 'contexts'], value: ['']},
  {name: 'invalid context', path: [...classicPaths, 'contexts'], value: [null]},
  {
    name: 'missing detailed checks',
    path: [...classicPaths, 'checks'],
    value: undefined
  },
  {
    name: 'non-array detailed checks',
    path: [...classicPaths, 'checks'],
    value: {}
  },
  {
    name: 'invalid detailed check',
    path: [...classicPaths, 'checks'],
    value: [null]
  },
  {
    name: 'missing detailed context',
    path: [...classicPaths, 'checks'],
    value: [{app_id: 123}]
  },
  {
    name: 'missing detailed app ID',
    path: [...classicPaths, 'checks'],
    value: [{context: 'build'}]
  }
]

for (const {name, path, value} of invalidBranches) {
  test(`rejects ${name} before loading rulesets`, async () => {
    await assert.rejects(
      loadPrStackRequiredChecks(
        octokit,
        requestFor(invalidBranch(path, value))
      ),
      /Cannot verify pull request stack required checks:/u
    )
    assertNotCalled(getBranchRulesMock)
  })
}

for (const value of [undefined, null, [], 1, {data: branch()}]) {
  test(`rejects an unavailable raw branch response ${JSON.stringify(value)}`, async () => {
    await assert.rejects(
      loadPrStackRequiredChecks(octokit, {...requestFor(), branch: value}),
      /Cannot verify pull request stack required checks:/u
    )
    assertNotCalled(getBranchRulesMock)
  })
}

test('rejects an invalid expected stable SHA', async () => {
  await assert.rejects(
    loadPrStackRequiredChecks(octokit, {
      ...requestFor(),
      stableSha: 'not-a-sha'
    }),
    /invalid stable commit SHA/u
  )
  assertNotCalled(getBranchRulesMock)
})

test('rejects contradictory classic protection enforcement', async () => {
  await assert.rejects(
    loadPrStackRequiredChecks(
      octokit,
      requestFor(branch({enabled: false, enforcement: 'everyone'}))
    ),
    /inconsistent classic protection state/u
  )
  assertNotCalled(getBranchRulesMock)
})

const invalidAppIds: readonly unknown[] = [
  0,
  -2,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
  '123',
  false,
  {},
  []
]

for (const [index, app] of invalidAppIds.entries()) {
  test(`rejects invalid classic app identity ${index}`, async () => {
    await assert.rejects(
      loadPrStackRequiredChecks(
        octokit,
        requestFor(branch({checks: [{context: 'build', app_id: app}]}))
      ),
      /invalid required-check app ID/u
    )
    assertNotCalled(getBranchRulesMock)
  })

  test(`rejects invalid ruleset app identity ${index}`, async () => {
    getBranchRulesMock.mock.mockImplementation(() =>
      Promise.resolve({
        data: [statusRule([{context: 'build', integration_id: app}])]
      })
    )
    await assert.rejects(
      loadPrStackRequiredChecks(octokit, requestFor()),
      /invalid required-check app ID/u
    )
  })
}

const invalidRulePages: ReadonlyArray<{
  readonly name: string
  readonly data: unknown
}> = [
  {name: 'missing rules response', data: undefined},
  {name: 'null rules response', data: null},
  {name: 'non-array rules response', data: {}},
  {name: 'oversized rules page', data: [...otherRules(), {type: 'deletion'}]},
  {name: 'invalid rule', data: [null]},
  {name: 'missing rule type', data: [{}]},
  {name: 'empty rule type', data: [{type: ''}]},
  {
    name: 'missing status rule parameters',
    data: [{type: 'required_status_checks'}]
  },
  {
    name: 'missing required status checks',
    data: [{type: 'required_status_checks', parameters: {}}]
  },
  {
    name: 'invalid required status checks',
    data: [
      {
        type: 'required_status_checks',
        parameters: {required_status_checks: null}
      }
    ]
  },
  {name: 'invalid status check entry', data: [statusRule([[]])]},
  {
    name: 'missing status check name',
    data: [statusRule([{integration_id: 123}])]
  },
  {name: 'empty status check name', data: [statusRule([{context: ''}])]}
]

for (const {name, data} of invalidRulePages) {
  test(`rejects ${name}`, async () => {
    getBranchRulesMock.mock.mockImplementation(() => Promise.resolve({data}))
    await assert.rejects(
      loadPrStackRequiredChecks(octokit, requestFor()),
      /Cannot verify pull request stack required checks:/u
    )
  })
}

test('rejects required workflows instead of guessing their expected jobs', async () => {
  getBranchRulesMock.mock.mockImplementation(() =>
    Promise.resolve({data: [{type: 'workflows', parameters: {workflows: []}}]})
  )
  await assert.rejects(
    loadPrStackRequiredChecks(octokit, requestFor()),
    /required workflows are not supported by this preview/u
  )
})

test('ignores unrelated current and future rules', async () => {
  getBranchRulesMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: [
        {type: 'required_deployments'},
        {type: 'future_rule'},
        statusRule()
      ]
    })
  )
  assert.deepStrictEqual(
    await loadPrStackRequiredChecks(octokit, requestFor()),
    []
  )
})

test('loads all rules pages before returning an inventory', async () => {
  queueMockImplementation(
    getBranchRulesMock,
    () => Promise.resolve({data: otherRules()}),
    () =>
      Promise.resolve({
        data: [statusRule([{context: 'late-check', integration_id: 123}])]
      })
  )
  assert.deepStrictEqual(
    await loadPrStackRequiredChecks(octokit, requestFor()),
    [{context: 'late-check', appId: 123}]
  )
  assert.deepStrictEqual(
    getBranchRulesMock.mock.calls.map(call => call.arguments[0]?.page),
    [1, 2]
  )
})

test('requests a final empty page after an exact multiple of 100 rules', async () => {
  queueMockImplementation(
    getBranchRulesMock,
    () => Promise.resolve({data: otherRules()}),
    () => Promise.resolve({data: otherRules(101)}),
    () => Promise.resolve({data: []})
  )
  assert.deepStrictEqual(
    await loadPrStackRequiredChecks(octokit, requestFor()),
    []
  )
  assert.deepStrictEqual(
    getBranchRulesMock.mock.calls.map(call => call.arguments[0]?.page),
    [1, 2, 3]
  )
})

test('rejects a repeated full rules page', async () => {
  const fullPage = otherRules()
  getBranchRulesMock.mock.mockImplementation(() =>
    Promise.resolve({data: fullPage})
  )
  await assert.rejects(
    loadPrStackRequiredChecks(octokit, requestFor()),
    /ruleset pagination did not advance/u
  )
  assertCalledTimes(getBranchRulesMock, 2)
})

test('propagates an unavailable rules inventory', async () => {
  const failure = new Error('Rules unavailable')
  getBranchRulesMock.mock.mockImplementation(() => Promise.reject(failure))
  await assert.rejects(
    loadPrStackRequiredChecks(octokit, requestFor()),
    error => error === failure
  )
})

test('propagates a failed later page instead of returning a partial inventory', async () => {
  const failure = new Error('Later rules page unavailable')
  queueMockImplementation(
    getBranchRulesMock,
    () => Promise.resolve({data: otherRules()}),
    () => Promise.reject(failure)
  )
  await assert.rejects(
    loadPrStackRequiredChecks(octokit, requestFor()),
    error => error === failure
  )
})
