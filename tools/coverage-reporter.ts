import {readdirSync} from 'node:fs'
import {isAbsolute, relative, resolve, sep} from 'node:path'
import {Readable} from 'node:stream'
import {spec, type TestEvent} from 'node:test/reporters'
import {fileURLToPath} from 'node:url'

export interface CoverageRecord {
  readonly path: string
  readonly totalLineCount: number
  readonly totalBranchCount: number
  readonly totalFunctionCount: number
  readonly coveredLineCount: number
  readonly coveredBranchCount: number
  readonly coveredFunctionCount: number
}

interface ProjectCoveragePath {
  readonly path: string
  readonly synthetic: boolean
}

type CoverageScope = 'acceptance' | 'unit'

const MOCK_QUERY = /(?:\?|&)node-test-mock(?:=|&|$)/u
const SOURCE_DIRECTORIES = ['src', 'tools'] as const
const UNIT_COVERAGE_EXCLUDED_PREFIXES = ['tools/acceptance/'] as const
const ACCEPTANCE_SOURCE_DIRECTORY = 'tools/acceptance'
const ACCEPTANCE_TYPE_ONLY_SOURCES = ['tools/acceptance/types.ts'] as const

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

function walkTypescriptFiles(
  directory: string,
  root: string,
  scope: CoverageScope
): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory, {withFileTypes: true}).sort(
    (left, right) => left.name.localeCompare(right.name)
  )) {
    const absolutePath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...walkTypescriptFiles(absolutePath, root, scope))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const projectPath = toPosixPath(relative(root, absolutePath))
      if (isCoverageSource(projectPath, scope)) {
        files.push(projectPath)
      }
    }
  }

  return files
}

export function inventoryExecutableSources(
  root: string,
  scope: CoverageScope = 'unit'
): string[] {
  const directories =
    scope === 'acceptance' ? [ACCEPTANCE_SOURCE_DIRECTORY] : SOURCE_DIRECTORIES
  return directories
    .flatMap(directory =>
      walkTypescriptFiles(resolve(root, directory), root, scope)
    )
    .sort()
}

function normalizeCoveragePath(
  coveragePath: string,
  root: string
): ProjectCoveragePath | undefined {
  let absolutePath = coveragePath
  let synthetic = MOCK_QUERY.test(coveragePath)

  if (coveragePath.startsWith('file:')) {
    const url = new URL(coveragePath)
    synthetic ||= url.searchParams.has('node-test-mock')
    url.search = ''
    url.hash = ''
    absolutePath = fileURLToPath(url)
  } else if (synthetic) {
    absolutePath = coveragePath.slice(0, coveragePath.indexOf('?'))
  }

  if (!isAbsolute(absolutePath)) {
    absolutePath = resolve(root, absolutePath)
  }

  const projectPath = toPosixPath(relative(root, absolutePath))
  if (
    projectPath === '..' ||
    projectPath.startsWith('../') ||
    isAbsolute(projectPath)
  ) {
    return undefined
  }

  return {path: projectPath, synthetic}
}

function isProjectSource(path: string, scope: CoverageScope): boolean {
  if (scope === 'acceptance') {
    return (
      path.startsWith(`${ACCEPTANCE_SOURCE_DIRECTORY}/`) &&
      isAcceptanceCoverageSource(path)
    )
  }
  return (
    SOURCE_DIRECTORIES.some(directory => path.startsWith(`${directory}/`)) &&
    isUnitCoverageSource(path)
  )
}

function isCoverageSource(path: string, scope: CoverageScope): boolean {
  return scope === 'acceptance'
    ? isAcceptanceCoverageSource(path)
    : isUnitCoverageSource(path)
}

function isUnitCoverageSource(path: string): boolean {
  return (
    !path.endsWith('.d.ts') &&
    path !== 'src/types.ts' &&
    !UNIT_COVERAGE_EXCLUDED_PREFIXES.some(prefix => path.startsWith(prefix))
  )
}

function isAcceptanceCoverageSource(path: string): boolean {
  return (
    !path.endsWith('.d.ts') &&
    !ACCEPTANCE_TYPE_ONLY_SOURCES.some(source => path === source)
  )
}

function formatMetric(
  path: string,
  metric: string,
  covered: number,
  total: number
): string | undefined {
  if (covered === total) {
    return undefined
  }

  return `${path}: ${metric} coverage is ${covered}/${total}`
}

export function validateCoverage(
  records: readonly CoverageRecord[],
  root: string,
  expectedSources: readonly string[] = inventoryExecutableSources(root),
  scope: CoverageScope = 'unit'
): string[] {
  const expected = new Set(expectedSources)
  const normalRecords = new Map<string, CoverageRecord[]>()
  const syntheticPaths = new Set<string>()
  const diagnostics: string[] = []

  for (const record of records) {
    const normalized = normalizeCoveragePath(record.path, root)
    if (normalized === undefined || !isProjectSource(normalized.path, scope)) {
      continue
    }

    if (normalized.synthetic) {
      syntheticPaths.add(normalized.path)
      continue
    }

    if (!expected.has(normalized.path)) {
      diagnostics.push(`${normalized.path}: unexpected project source`)
      continue
    }

    const existing = normalRecords.get(normalized.path) ?? []
    existing.push(record)
    normalRecords.set(normalized.path, existing)
  }

  for (const path of [...expected].sort()) {
    const sourceRecords = normalRecords.get(path) ?? []

    if (sourceRecords.length === 0) {
      diagnostics.push(
        syntheticPaths.has(path)
          ? `${path}: synthetic module-mock coverage cannot prove source coverage`
          : `${path}: missing coverage record`
      )
      continue
    }

    if (sourceRecords.length > 1) {
      diagnostics.push(
        `${path}: duplicate coverage records (${sourceRecords.length})`
      )
      continue
    }

    for (const record of sourceRecords) {
      const metricDiagnostics = [
        formatMetric(
          path,
          'line',
          record.coveredLineCount,
          record.totalLineCount
        ),
        formatMetric(
          path,
          'branch',
          record.coveredBranchCount,
          record.totalBranchCount
        ),
        formatMetric(
          path,
          'function',
          record.coveredFunctionCount,
          record.totalFunctionCount
        )
      ]

      for (const diagnostic of metricDiagnostics) {
        if (diagnostic !== undefined) {
          diagnostics.push(diagnostic)
        }
      }
    }
  }

  return diagnostics.sort()
}

type CoverageEvent = Extract<TestEvent, {type: 'test:coverage'}>
type SummaryEvent = Extract<TestEvent, {type: 'test:summary'}>

export function validateTestSummary(
  summary: SummaryEvent['data']
): string | undefined {
  const {cancelled, passed, skipped, tests, todo} = summary.counts
  if (cancelled === 0 && skipped === 0 && todo === 0 && passed === tests) {
    return undefined
  }
  return `test policy failed: passed=${passed}/${tests}, skipped=${skipped}, todo=${todo}, cancelled=${cancelled}`
}

function coverageScopeFromEnv(): CoverageScope {
  return process.env['BRANCH_DEPLOY_COVERAGE_SCOPE'] === 'acceptance'
    ? 'acceptance'
    : 'unit'
}

export async function* reportCoverage(
  source: AsyncIterable<TestEvent>,
  root = process.cwd(),
  scope: CoverageScope = coverageScopeFromEnv()
): AsyncGenerator<string, void> {
  let coverageEvent: CoverageEvent | undefined
  let summaryEvent: SummaryEvent | undefined

  for await (const event of source) {
    if (event.type === 'test:coverage') {
      if (coverageEvent !== undefined) {
        throw new Error(
          'coverage policy: multiple test:coverage events received'
        )
      }
      coverageEvent = event
    } else if (event.type === 'test:summary' && event.data.file === undefined) {
      summaryEvent = event
    }
  }

  if (coverageEvent === undefined) {
    throw new Error('coverage policy: no test:coverage event received')
  }
  if (summaryEvent === undefined) {
    throw new Error('test policy: no aggregate test:summary event received')
  }

  const testDiagnostic = validateTestSummary(summaryEvent.data)
  if (testDiagnostic !== undefined) throw new Error(testDiagnostic)

  const expectedSources = inventoryExecutableSources(root, scope)
  const diagnostics = validateCoverage(
    coverageEvent.data.summary.files,
    root,
    expectedSources,
    scope
  )

  if (diagnostics.length > 0) {
    throw new Error(`coverage policy failed:\n${diagnostics.join('\n')}`)
  }

  if (scope === 'unit') {
    yield `coverage policy: ${expectedSources.length} executable source files have 100% line, branch, and function coverage\n`
  }
}

async function* replayEvents(
  events: readonly TestEvent[]
): AsyncGenerator<TestEvent, void> {
  yield* events
}

async function* capturePolicyEvents(
  source: AsyncIterable<TestEvent>,
  policyEvents: TestEvent[]
): AsyncGenerator<TestEvent, void> {
  for await (const event of source) {
    if (
      event.type === 'test:coverage' ||
      (event.type === 'test:summary' && event.data.file === undefined)
    ) {
      policyEvents.push(event)
    }

    yield event
  }
}

export default async function* coverageReporter(
  source: AsyncIterable<TestEvent>
): AsyncGenerator<string, void> {
  const policyEvents: TestEvent[] = []
  const specReporter = Readable.from(
    capturePolicyEvents(source, policyEvents)
  ).pipe(spec())

  for await (const output of specReporter) {
    yield String(output)
  }

  yield* reportCoverage(replayEvents(policyEvents))
}
