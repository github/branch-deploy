import {readdirSync} from 'node:fs'
import {isAbsolute, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {TestEvent} from 'node:test/reporters'

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

const MOCK_QUERY = /(?:\?|&)node-test-mock(?:=|&|$)/u
const SOURCE_DIRECTORIES = ['src', 'tools'] as const

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

function walkTypescriptFiles(directory: string, root: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory, {withFileTypes: true}).sort(
    (left, right) => left.name.localeCompare(right.name)
  )) {
    const absolutePath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...walkTypescriptFiles(absolutePath, root))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const projectPath = toPosixPath(relative(root, absolutePath))
      if (!projectPath.endsWith('.d.ts') && projectPath !== 'src/types.ts') {
        files.push(projectPath)
      }
    }
  }

  return files
}

export function inventoryExecutableSources(root: string): string[] {
  return SOURCE_DIRECTORIES.flatMap(directory =>
    walkTypescriptFiles(resolve(root, directory), root)
  ).sort()
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

function isProjectSource(path: string): boolean {
  return SOURCE_DIRECTORIES.some(directory => path.startsWith(`${directory}/`))
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
  expectedSources: readonly string[] = inventoryExecutableSources(root)
): string[] {
  const expected = new Set(expectedSources)
  const normalRecords = new Map<string, CoverageRecord[]>()
  const syntheticPaths = new Set<string>()
  const diagnostics: string[] = []

  for (const record of records) {
    const normalized = normalizeCoveragePath(record.path, root)
    if (normalized === undefined || !isProjectSource(normalized.path)) {
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

export async function* reportCoverage(
  source: AsyncIterable<TestEvent>,
  root = process.cwd()
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

  const expectedSources = inventoryExecutableSources(root)
  const diagnostics = validateCoverage(
    coverageEvent.data.summary.files,
    root,
    expectedSources
  )

  if (diagnostics.length > 0) {
    throw new Error(`coverage policy failed:\n${diagnostics.join('\n')}`)
  }

  yield `coverage policy: ${expectedSources.length} executable source files have 100% line, branch, and function coverage\n`
}

export default async function* coverageReporter(
  source: AsyncIterable<TestEvent>
): AsyncGenerator<string, void> {
  yield* reportCoverage(source)
}
