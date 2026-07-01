import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {mock, test} from 'node:test'
import {
  POLICY_IDS,
  checkProject,
  checkSourceText,
  checkSourceTexts,
  formatDiagnostic,
  runPolicy,
  type PolicyDiagnostic,
  type PolicyId
} from '../tools/typescript-policy.ts'

interface PolicyFixture {
  readonly expected: readonly string[]
  readonly name: string
  readonly source: string
}

const fixturePath = resolve(
  import.meta.dirname,
  'fixtures/typescript-policy/cases.json'
)
const fixtureData: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'))

function parseFixtures(value: unknown): readonly PolicyFixture[] {
  if (!isUnknownArray(value)) {
    throw new TypeError('policy fixtures must be an array')
  }
  return value.map(entry => {
    if (!isRecord(entry)) {
      throw new TypeError('policy fixture must be an object')
    }
    const {expected, name, source} = entry
    if (
      !isStringArray(expected) ||
      typeof name !== 'string' ||
      typeof source !== 'string'
    ) {
      throw new TypeError('policy fixture fields are invalid')
    }
    return {expected, name, source}
  })
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return isUnknownArray(value) && value.every(item => typeof item === 'string')
}

const fixtures = parseFixtures(fixtureData)

function fixtureSourcePath(name: string): string {
  return `__tests__/fixtures/typescript-policy/${name}.ts`
}

function diagnosticMap(
  diagnostics: readonly PolicyDiagnostic[]
): ReadonlyMap<string, readonly string[]> {
  const output = new Map<string, string[]>()
  for (const diagnostic of diagnostics) {
    const current = output.get(diagnostic.path)
    const formatted = formatDiagnostic(diagnostic)
    if (current === undefined) output.set(diagnostic.path, [formatted])
    else current.push(formatted)
  }
  return output
}

test('TypeScript policy fixtures match diagnostics', () => {
  const diagnostics = diagnosticMap(
    checkSourceTexts(
      fixtures.map(fixture => ({
        path: fixtureSourcePath(fixture.name),
        sourceText: fixture.source
      }))
    )
  )

  for (const fixture of fixtures) {
    assert.deepStrictEqual(
      diagnostics.get(fixtureSourcePath(fixture.name)) ?? [],
      fixture.expected
    )
  }
})

test('every named policy has an invalid fixture', () => {
  const covered = new Set<PolicyId>()
  for (const fixture of fixtures) {
    for (const diagnostic of fixture.expected) {
      const policy = POLICY_IDS.find(id => diagnostic.includes(`: ${id}: `))
      if (policy !== undefined) covered.add(policy)
    }
  }
  assert.deepStrictEqual([...covered].sort(), [...POLICY_IDS].sort())
})

test('grouped policy variants remain enforced', () => {
  const cases = [
    ['Promise.resolve(1);\n', 'promise-safety'],
    ['async function value() { return 1 }\n', 'promise-safety'],
    ['await 1\n', 'promise-safety'],
    ['new Promise(async resolve => resolve())\n', 'promise-safety'],
    ['const value: any = 1\nvalue.member\n', 'no-unsafe-any'],
    ["if ((value = 'x')) {}\n", 'control-flow'],
    ["({}).hasOwnProperty('x')\n", 'control-flow'],
    ['NaN === 1\n', 'control-flow'],
    ['try {} finally { return }\n', 'control-flow'],
    ["throw 'value'\n", 'control-flow'],
    ["'value' + 1\n", 'safe-string-operations'],
    ["(0, eval)('value')\n", 'dangerous-eval']
  ] as const
  const diagnostics = diagnosticMap(
    checkSourceTexts(
      cases.map(([source], index) => ({
        path: fixtureSourcePath(`grouped-${String(index)}`),
        sourceText: source
      })),
      'force',
      false
    )
  )

  for (const [index, [, policy]] of cases.entries()) {
    assert.ok(
      (
        diagnostics.get(fixtureSourcePath(`grouped-${String(index)}`)) ?? []
      ).some(diagnostic => diagnostic.includes(`: ${policy}: `)),
      `${policy} did not reject case ${String(index)}`
    )
  }

  assert.deepStrictEqual(
    checkSourceTexts(
      [
        {
          path: fixtureSourcePath('grouped-valid-boolean-condition'),
          sourceText: 'if (true && true) {}\n'
        },
        {
          path: fixtureSourcePath('grouped-valid-loop-break'),
          sourceText: 'for (; true; ) { break }\n'
        },
        {
          path: fixtureSourcePath('grouped-valid-date-constructor'),
          sourceText: 'new Date\n'
        },
        {
          path: fixtureSourcePath('grouped-valid-default-export'),
          sourceText: 'const value = 1\nexport default value\n'
        },
        {
          path: fixtureSourcePath('grouped-valid-nested-finally-return'),
          sourceText:
            'try {} finally { function nested(): void { return } nested() }\n'
        }
      ],
      'force',
      false
    ),
    []
  )
  assert.ok(
    checkSourceText(
      'declare function take(value: string): void\nconst value: any = 1\ntake(value)\n'
    ).some(diagnostic => diagnostic.policyId === 'no-unsafe-any')
  )
})

test('unsafe TypeScript escape hatches stay at named trust boundaries', () => {
  assert.strictEqual(runPolicy(), 0)
})

test('reports invalid policy diagnostics through the CLI boundary', () => {
  const diagnostic = {
    column: 3,
    line: 2,
    message: 'example message',
    path: 'src/example.ts',
    policyId: 'control-flow'
  } as const satisfies PolicyDiagnostic
  const errorMock = mock.method(console, 'error', () => undefined)

  assert.strictEqual(runPolicy([]), 0)
  assert.strictEqual(runPolicy([diagnostic]), 1)
  assert.deepStrictEqual(
    errorMock.mock.calls.map(call => call.arguments),
    [[formatDiagnostic(diagnostic)]]
  )
})

test('rejects a missing project configuration', context => {
  const root = mkdtempSync(join(tmpdir(), 'branch-deploy-policy-missing-'))
  context.after(() => rmSync(root, {force: true, recursive: true}))
  assert.throws(() => checkProject(root), /could not parse tsconfig\.json/u)
})

test('accepts a standalone script without module exports', () => {
  assert.deepStrictEqual(
    checkSourceText(
      'const value = true\n',
      '../typescript-policy-script.ts',
      'legacy'
    ),
    []
  )
})

test('accepts source without a global Error symbol', () => {
  assert.deepStrictEqual(
    checkSourceText(
      '/// <reference no-default-lib="true"/>\nconst value = true\n',
      '__tests__/fixtures/typescript-policy/no-global-error-symbol.ts',
      'force',
      false
    ),
    []
  )
})

test('reports stale trust-boundary allowlist entries', context => {
  const root = mkdtempSync(join(tmpdir(), 'branch-deploy-policy-stale-'))
  context.after(() => rmSync(root, {force: true, recursive: true}))
  mkdirSync(join(root, 'src'))
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({compilerOptions: {strict: true}, include: ['src/**/*.ts']})
  )
  writeFileSync(join(root, 'src/example.ts'), 'export const value = true\n')

  assert.deepStrictEqual(checkProject(root).map(formatDiagnostic), [
    '__tests__/unsafe-fixtures.ts:1:1: no-unsafe-assertion: stale trust-boundary allowance: fixture-assertion',
    'src/trust-boundaries.ts:1:1: no-unsafe-any: stale trust-boundary allowance: trust-any',
    'src/trust-boundaries.ts:1:1: no-unsafe-assertion: stale trust-boundary allowance: trust-assertion',
    'src/trust-boundaries.ts:1:1: strict-equality: stale trust-boundary allowance: trust-equality'
  ])
})
