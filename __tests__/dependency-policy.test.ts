import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'

const EXPECTED_RUNTIME_DEPENDENCIES = {
  '@actions/github': '9.0.0',
  '@octokit/plugin-retry': '8.0.3',
  'yargs-parser': '22.0.0'
} as const satisfies Record<string, string>

const EXPECTED_DEVELOPMENT_DEPENDENCIES = {
  '@types/node': '24.13.2',
  '@vercel/ncc': '0.44.0',
  'js-yaml': '4.3.0',
  prettier: '3.8.1',
  typescript: '5.9.3'
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

  assert.deepStrictEqual(
    packageJson['dependencies'],
    EXPECTED_RUNTIME_DEPENDENCIES
  )
  assert.deepStrictEqual(
    packageJson['devDependencies'],
    EXPECTED_DEVELOPMENT_DEPENDENCIES
  )
  assert.strictEqual(packageJson['overrides'], undefined)
  assert.deepStrictEqual(
    lockRoot['dependencies'],
    EXPECTED_RUNTIME_DEPENDENCIES
  )
  assert.deepStrictEqual(
    lockRoot['devDependencies'],
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
    const version = entry['version']
    const license = entry['license']

    if (
      !/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/u.test(
        path
      )
    ) {
      violations.push(`${path} has an invalid package path`)
    }

    if (
      typeof resolved !== 'string' ||
      !resolved.startsWith('https://registry.npmjs.org/')
    ) {
      violations.push(`${path} has a non-public resolution`)
    }
    if (
      typeof integrity !== 'string' ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(integrity)
    ) {
      violations.push(`${path} has no valid sha512 integrity digest`)
    }
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(version)) {
      violations.push(`${path} has no exact resolved version`)
    }
    if (typeof license !== 'string' || license.trim() === '') {
      violations.push(`${path} has no license`)
    }
    for (const field of [
      'link',
      'devOptional',
      'optionalDependencies',
      'peerDependenciesMeta',
      'bundleDependencies',
      'bundledDependencies',
      'inBundle'
    ] as const) {
      if (entry[field] !== undefined) {
        violations.push(`${path} has an unexpected ${field} field`)
      }
    }
    for (const field of ['dependencies', 'peerDependencies'] as const) {
      const dependencies = entry[field]
      if (dependencies === undefined) continue
      const ranges = requireRecord(dependencies, `${path} ${field}`)
      for (const [name, range] of Object.entries(ranges)) {
        if (
          typeof range !== 'string' ||
          /^(?:(?:git(?:\+[^:]+)?|github|gitlab|bitbucket|gist|file|link|workspace|https?|ssh):|git@|[^@\s/]+\/[^@\s/]+(?:#|$))/iu.test(
            range
          )
        ) {
          violations.push(`${path} ${field}.${name} has a non-registry range`)
        }
      }
    }
    if (entry['hasInstallScript'] === true) {
      installScripts.push({
        path,
        dev: entry['dev'],
        optional: entry['optional']
      })
    }
  }

  const resolved = Object.entries(lockPackages).filter(([path]) => path !== '')
  const runtime = resolved.filter(([, value]) => {
    const entry = requireRecord(value, 'lockfile package')
    return entry['dev'] !== true
  })
  const development = resolved.filter(([, value]) => {
    const entry = requireRecord(value, 'lockfile package')
    return entry['dev'] === true
  })
  const optional = resolved.filter(([, value]) => {
    const entry = requireRecord(value, 'lockfile package')
    return entry['optional'] === true
  })

  assert.deepStrictEqual(violations, [])
  assert.deepStrictEqual(installScripts, [])
  assert.strictEqual(resolved.length, 28)
  assert.strictEqual(runtime.length, 21)
  assert.strictEqual(development.length, 7)
  assert.strictEqual(optional.length, 0)
})
