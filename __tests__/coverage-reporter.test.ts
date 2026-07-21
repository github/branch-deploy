import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {test} from 'node:test'
import type {TestEvent} from 'node:test/reporters'
import {pathToFileURL} from 'node:url'
import {
  default as coverageReporter,
  inventoryExecutableSources,
  reportCoverage,
  validateCoverage,
  validateTestSummary,
  type CoverageRecord
} from '../tools/coverage-reporter.ts'

const FULL_COVERAGE = {
  totalLineCount: 10,
  totalBranchCount: 4,
  totalFunctionCount: 2,
  coveredLineCount: 10,
  coveredBranchCount: 4,
  coveredFunctionCount: 2
} as const

function coverageRecord(
  path: string,
  overrides: Partial<CoverageRecord> = {}
): CoverageRecord {
  return {path, ...FULL_COVERAGE, ...overrides}
}

type CoverageEvent = Extract<TestEvent, {type: 'test:coverage'}>
type SummaryEvent = Extract<TestEvent, {type: 'test:summary'}>

function coverageEvent(records: readonly CoverageRecord[]): CoverageEvent {
  return {
    type: 'test:coverage',
    data: {
      nesting: 0,
      summary: {
        files: records.map(record => ({
          ...record,
          coveredLinePercent: 100,
          coveredBranchPercent: 100,
          coveredFunctionPercent: 100,
          functions: [],
          branches: [],
          lines: []
        })),
        thresholds: {line: 100, branch: 100, function: 100},
        totals: {
          ...FULL_COVERAGE,
          coveredLinePercent: 100,
          coveredBranchPercent: 100,
          coveredFunctionPercent: 100
        },
        workingDirectory: process.cwd()
      }
    }
  }
}

function summaryEvent(
  counts: Partial<SummaryEvent['data']['counts']> = {},
  file: string | undefined = undefined
): SummaryEvent {
  return {
    type: 'test:summary',
    data: {
      counts: {
        cancelled: 0,
        passed: 1,
        skipped: 0,
        suites: 0,
        tests: 1,
        todo: 0,
        topLevel: 1,
        ...counts
      },
      duration_ms: 1,
      file,
      success: true
    }
  }
}

async function* events(...values: TestEvent[]): AsyncGenerator<TestEvent> {
  yield* values
}

async function collectReporterOutput(
  source: AsyncIterable<TestEvent>,
  root = process.cwd()
): Promise<string[]> {
  const output: string[] = []
  for await (const value of reportCoverage(source, root)) {
    output.push(value)
  }
  return output
}

test('inventories only executable TypeScript source', context => {
  const root = mkdtempSync(join(tmpdir(), 'branch-deploy-coverage-'))
  context.after(() => rmSync(root, {recursive: true, force: true}))

  for (const path of [
    'src/main.ts',
    'src/nested/helper.ts',
    'src/types.ts',
    'src/vendor.d.ts',
    'src/readme.txt',
    'tools/acceptance/index.ts',
    'tools/check.ts'
  ]) {
    const absolutePath = resolve(root, path)
    mkdirSync(dirname(absolutePath), {recursive: true})
    writeFileSync(absolutePath, '')
  }

  assert.deepStrictEqual(inventoryExecutableSources(root), [
    'src/main.ts',
    'src/nested/helper.ts',
    'tools/check.ts'
  ])
})

test('inventories acceptance harness source for acceptance coverage', context => {
  const root = mkdtempSync(join(tmpdir(), 'branch-deploy-coverage-'))
  context.after(() => rmSync(root, {recursive: true, force: true}))

  for (const path of [
    'src/main.ts',
    'tools/acceptance/index.ts',
    'tools/acceptance/mock-github.ts',
    'tools/acceptance/types.ts',
    'tools/check.ts'
  ]) {
    const absolutePath = resolve(root, path)
    mkdirSync(dirname(absolutePath), {recursive: true})
    writeFileSync(absolutePath, '')
  }

  assert.deepStrictEqual(inventoryExecutableSources(root, 'acceptance'), [
    'tools/acceptance/index.ts',
    'tools/acceptance/mock-github.ts'
  ])
})

test('accepts full coverage and ignores non-project records', () => {
  const root = '/repo'
  const toolsUrl = pathToFileURL('/repo/tools/check.ts')
  toolsUrl.hash = 'source'

  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('src/main.ts'),
        coverageRecord(toolsUrl.href),
        coverageRecord('/repo/dist/index.ts'),
        coverageRecord('/repo/tools/acceptance/index.ts'),
        coverageRecord('/outside/vendor.ts'),
        coverageRecord('/')
      ],
      root,
      ['src/main.ts', 'tools/check.ts']
    ),
    []
  )
})

test('ignores traversals, source-directory lookalikes, and type-only records', () => {
  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('/repo/src/../../outside.ts'),
        coverageRecord('/repo/src-extra/main.ts'),
        coverageRecord('/repo/tools-extra/check.ts'),
        coverageRecord('/repo/src/types.ts'),
        coverageRecord('/repo/src/vendor.d.ts'),
        coverageRecord('/repo/tools/vendor.d.ts')
      ],
      '/repo',
      []
    ),
    []
  )
})

test('normalizes encoded file URLs and detects equivalent duplicate records', () => {
  assert.deepStrictEqual(
    validateCoverage(
      [coverageRecord('file:///repo/src/space%20name.ts?cache=1#source')],
      '/repo',
      ['src/space name.ts']
    ),
    []
  )
  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('src/main.ts'),
        coverageRecord('file:///repo/src/main.ts')
      ],
      '/repo',
      ['src/main.ts']
    ),
    ['src/main.ts: duplicate coverage records (2)']
  )
})

test('validates acceptance coverage independently from unit coverage', () => {
  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('/repo/src/main.ts'),
        coverageRecord('/repo/tools/acceptance/index.ts'),
        coverageRecord('/repo/tools/check.ts')
      ],
      '/repo',
      ['tools/acceptance/index.ts', 'tools/acceptance/mock-github.ts'],
      'acceptance'
    ),
    ['tools/acceptance/mock-github.ts: missing coverage record']
  )
})

test('uses the acceptance coverage scope from the environment', async context => {
  const root = mkdtempSync(join(tmpdir(), 'branch-deploy-coverage-'))
  context.after(() => rmSync(root, {recursive: true, force: true}))

  for (const path of [
    'tools/acceptance/index.ts',
    'tools/acceptance/types.ts',
    'tools/check.ts'
  ]) {
    const absolutePath = resolve(root, path)
    mkdirSync(dirname(absolutePath), {recursive: true})
    writeFileSync(absolutePath, '')
  }

  const previousScope = process.env['BRANCH_DEPLOY_COVERAGE_SCOPE']
  process.env['BRANCH_DEPLOY_COVERAGE_SCOPE'] = 'acceptance'
  context.after(() => {
    if (previousScope === undefined) {
      delete process.env['BRANCH_DEPLOY_COVERAGE_SCOPE']
    } else {
      process.env['BRANCH_DEPLOY_COVERAGE_SCOPE'] = previousScope
    }
  })

  assert.deepStrictEqual(
    await collectReporterOutput(
      events(
        coverageEvent([
          coverageRecord(resolve(root, 'tools/acceptance/index.ts'))
        ]),
        summaryEvent()
      ),
      root
    ),
    []
  )
})

test('reports missing and unexpected project sources', () => {
  assert.deepStrictEqual(
    validateCoverage([coverageRecord('/repo/src/unexpected.ts')], '/repo', [
      'src/missing.ts'
    ]),
    [
      'src/missing.ts: missing coverage record',
      'src/unexpected.ts: unexpected project source'
    ]
  )
})

test('does not accept synthetic module-mock records as coverage proof', () => {
  const encodedUrl = new URL('file:///repo/tools/check.ts')
  encodedUrl.search = '?node-test%2Dmock=0'

  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('/repo/src/main.ts?node-test-mock=0'),
        coverageRecord(encodedUrl.href)
      ],
      '/repo',
      ['src/main.ts', 'tools/check.ts']
    ),
    [
      'src/main.ts: synthetic module-mock coverage cannot prove source coverage',
      'tools/check.ts: synthetic module-mock coverage cannot prove source coverage'
    ]
  )
})

test('recognizes synthetic module mocks in every query position', () => {
  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('/repo/src/first.ts?cache=1&node-test-mock=0'),
        coverageRecord('file:///repo/src/second.ts?node-test-mock&cache=1')
      ],
      '/repo',
      ['src/first.ts', 'src/second.ts']
    ),
    [
      'src/first.ts: synthetic module-mock coverage cannot prove source coverage',
      'src/second.ts: synthetic module-mock coverage cannot prove source coverage'
    ]
  )
})

test('ignores a synthetic duplicate when real source coverage is present', () => {
  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('/repo/src/main.ts'),
        coverageRecord('file:///repo/src/main.ts?node-test-mock=0')
      ],
      '/repo',
      ['src/main.ts']
    ),
    []
  )
})

test('rejects duplicate real source records', () => {
  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('/repo/src/main.ts'),
        coverageRecord('/repo/src/main.ts')
      ],
      '/repo',
      ['src/main.ts']
    ),
    ['src/main.ts: duplicate coverage records (2)']
  )
})

test('reports every uncovered metric', () => {
  assert.deepStrictEqual(
    validateCoverage(
      [
        coverageRecord('/repo/src/main.ts', {
          coveredLineCount: 9,
          coveredBranchCount: 3,
          coveredFunctionCount: 1
        })
      ],
      '/repo',
      ['src/main.ts']
    ),
    [
      'src/main.ts: branch coverage is 3/4',
      'src/main.ts: function coverage is 1/2',
      'src/main.ts: line coverage is 9/10'
    ]
  )
})

test('uses the source inventory by default', () => {
  const root = process.cwd()
  const expected = inventoryExecutableSources(root)
  const records = expected.map(path => coverageRecord(resolve(root, path)))

  assert.deepStrictEqual(validateCoverage(records, root), [])
})

test('reports successful complete source coverage', async () => {
  const root = process.cwd()
  const expected = inventoryExecutableSources(root)
  const records = expected.map(path => coverageRecord(resolve(root, path)))

  assert.deepStrictEqual(
    await collectReporterOutput(
      events(coverageEvent(records), summaryEvent()),
      root
    ),
    [
      `coverage policy: ${expected.length} executable source files have 100% line, branch, and function coverage\n`
    ]
  )
})

test('the default reporter combines spec output with the coverage policy', async () => {
  const root = process.cwd()
  const expected = inventoryExecutableSources(root)
  const records = expected.map(path => coverageRecord(resolve(root, path)))
  const output: string[] = []

  for await (const value of coverageReporter(
    events(
      {type: 'test:watch:drained', data: undefined},
      summaryEvent({}, 'suite.test.ts'),
      coverageEvent(records),
      summaryEvent()
    )
  )) {
    output.push(value)
  }

  const rendered = output.join('')
  const policyResult = `coverage policy: ${expected.length} executable source files have 100% line, branch, and function coverage`

  assert.match(rendered, /start of coverage report/u)
  assert.ok(rendered.includes(policyResult))
  assert.ok(
    rendered.indexOf('end of coverage report') < rendered.indexOf(policyResult)
  )
})

test('the default reporter preserves coverage policy failures', async () => {
  const root = process.cwd()
  const expected = inventoryExecutableSources(root)
  const records = expected
    .slice(1)
    .map(path => coverageRecord(resolve(root, path)))
  const missingSource = expected[0]
  assert.ok(missingSource !== undefined)

  await assert.rejects(
    async () => {
      for await (const output of coverageReporter(
        events(coverageEvent(records), summaryEvent())
      )) {
        assert.equal(typeof output, 'string')
      }
    },
    new RegExp(
      `coverage policy failed:\\n${missingSource}: missing coverage record`,
      'u'
    )
  )
})

test('rejects a failed coverage policy', async () => {
  const root = process.cwd()
  const expected = inventoryExecutableSources(root)
  const records = expected
    .slice(1)
    .map(path => coverageRecord(resolve(root, path)))
  const missingSource = expected[0]
  assert.ok(missingSource !== undefined)

  await assert.rejects(
    collectReporterOutput(events(coverageEvent(records), summaryEvent()), root),
    new RegExp(
      `coverage policy failed:\\n${missingSource}: missing coverage record`,
      'u'
    )
  )
})

test('requires one coverage event', async () => {
  await assert.rejects(
    collectReporterOutput(
      events({type: 'test:watch:drained', data: undefined}, summaryEvent())
    ),
    /coverage policy: no test:coverage event received/u
  )
})

test('rejects multiple coverage events', async () => {
  const event = coverageEvent([])
  await assert.rejects(
    collectReporterOutput(events(event, event, summaryEvent())),
    /coverage policy: multiple test:coverage events received/u
  )
})

test('requires an aggregate test summary', async () => {
  await assert.rejects(
    collectReporterOutput(events(coverageEvent([]))),
    /test policy: no aggregate test:summary event received/u
  )
})

test('rejects skipped, todo, cancelled, or failed tests', async () => {
  await assert.rejects(
    collectReporterOutput(
      events(
        coverageEvent([]),
        summaryEvent({
          cancelled: 1,
          passed: 1,
          skipped: 1,
          tests: 4,
          todo: 1
        })
      )
    ),
    /test policy failed: passed=1\/4, skipped=1, todo=1, cancelled=1/u
  )
})

test('requires every test to pass without skips, todos, or cancellations', () => {
  assert.strictEqual(validateTestSummary(summaryEvent().data), undefined)
  assert.strictEqual(
    validateTestSummary(
      summaryEvent({cancelled: 1, passed: 1, skipped: 1, tests: 4, todo: 1})
        .data
    ),
    'test policy failed: passed=1/4, skipped=1, todo=1, cancelled=1'
  )
})
