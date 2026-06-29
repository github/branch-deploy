import {readFileSync} from 'node:fs'
import {expect, test} from 'vitest'

const EXPECTED_RUNTIME_DEPENDENCIES = {
  '@actions/github': '9.0.0',
  '@octokit/plugin-retry': '8.0.3',
  nunjucks: '3.2.4',
  'yargs-parser': '22.0.0'
} as const satisfies Record<string, string>

const EXPECTED_DEVELOPMENT_DEPENDENCIES = {
  '@eslint/js': '9.39.2',
  '@types/node': '24.3.0',
  '@vercel/ncc': '0.44.0',
  '@vitest/coverage-v8': '4.1.0',
  eslint: '9.39.2',
  'js-yaml': '4.2.0',
  prettier: '3.8.1',
  typescript: '5.9.3',
  'typescript-eslint': '8.61.1',
  vitest: '4.1.0'
} as const satisfies Record<string, string>

const EXPECTED_OVERRIDES = {
  flatted: '3.4.2',
  undici: '6.27.0',
  vite: '8.0.16'
} as const satisfies Record<string, string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`)
  }

  return value
}

function readJson(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return requireRecord(parsed, path)
}

test('direct dependencies are approved, exact, and locked', () => {
  const packageJson = readJson('package.json')
  const packageLock = readJson('package-lock.json')
  const lockPackages = requireRecord(
    packageLock['packages'],
    'package-lock.json packages'
  )
  const lockRoot = requireRecord(
    lockPackages[''],
    'package-lock.json root package'
  )

  expect(packageJson['dependencies']).toStrictEqual(
    EXPECTED_RUNTIME_DEPENDENCIES
  )
  expect(packageJson['devDependencies']).toStrictEqual(
    EXPECTED_DEVELOPMENT_DEPENDENCIES
  )
  expect(packageJson['overrides']).toStrictEqual(EXPECTED_OVERRIDES)
  expect(lockRoot['dependencies']).toStrictEqual(EXPECTED_RUNTIME_DEPENDENCIES)
  expect(lockRoot['devDependencies']).toStrictEqual(
    EXPECTED_DEVELOPMENT_DEPENDENCIES
  )
})

test('resolved packages preserve public integrity and install-script policy', () => {
  const packageLock = readJson('package-lock.json')
  const lockPackages = requireRecord(
    packageLock['packages'],
    'package-lock.json packages'
  )
  const violations: string[] = []
  const installScripts: {
    readonly path: string
    readonly dev: unknown
    readonly optional: unknown
  }[] = []

  for (const [path, value] of Object.entries(lockPackages)) {
    if (path === '') continue
    const entry = requireRecord(value, path)
    const resolved = entry['resolved']
    const integrity = entry['integrity']

    if (
      typeof resolved !== 'string' ||
      !resolved.startsWith('https://registry.npmjs.org/')
    ) {
      violations.push(`${path} has a non-public resolution`)
    }
    if (typeof integrity !== 'string' || integrity.length === 0) {
      violations.push(`${path} has no integrity digest`)
    }
    if (entry['hasInstallScript'] === true) {
      installScripts.push({
        path,
        dev: entry['dev'],
        optional: entry['optional']
      })
    }
  }

  expect(violations).toStrictEqual([])
  expect(installScripts).toStrictEqual([
    {path: 'node_modules/fsevents', dev: true, optional: true}
  ])
})
