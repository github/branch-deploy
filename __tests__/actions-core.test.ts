import * as core from '../src/actions-core.ts'
import crypto from 'node:crypto'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {EOL, tmpdir} from 'node:os'
import {join} from 'node:path'
import {syncBuiltinESMExports} from 'node:module'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
  vi
} from 'vitest'

vi.unmock('../src/actions-core.ts')

const originalExitCode = process.exitCode
let testDirectory: string

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), 'branch-deploy-core-'))
  process.exitCode = undefined
})

afterEach(() => {
  process.exitCode = originalExitCode
  rmSync(testDirectory, {force: true, recursive: true})
  vi.restoreAllMocks()
  syncBuiltinESMExports()
})

function captureStdout(): {
  read: () => string
  exitCodes: () => readonly unknown[]
} {
  const chunks: string[] = []
  const observedExitCodes: unknown[] = []

  vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
    chunks.push(String(chunk))
    observedExitCodes.push(process.exitCode)
    return true
  })

  return {
    read: () => chunks.join(''),
    exitCodes: () => observedExitCodes
  }
}

function createFileCommand(name: 'GITHUB_OUTPUT' | 'GITHUB_STATE'): string {
  const filePath = join(testDirectory, name.toLowerCase())
  writeFileSync(filePath, '')
  vi.stubEnv(name, filePath)
  return filePath
}

function readFileCommandValue(filePath: string): string {
  const [header, ...remainingLines] = readFileSync(filePath, 'utf8').split(EOL)
  const delimiter = header?.split('<<')[1]

  expect(header).toMatch(/^[^<]+<<ghadelimiter_[0-9a-f-]{36}$/u)
  expect(remainingLines.at(-2)).toBe(delimiter)
  expect(remainingLines.at(-1)).toBe('')

  return remainingLines.slice(0, -2).join(EOL)
}

describe('action inputs', () => {
  test('normalizes names, trims by default, and preserves whitespace on request', () => {
    vi.stubEnv('INPUT_DEPLOY_TARGET', '  production  ')

    expect(core.getInput('deploy target')).toBe('production')
    expect(core.getInput('deploy target', {trimWhitespace: false})).toBe(
      '  production  '
    )
    expect(core.getInput('missing')).toBe('')
  })

  test('enforces required inputs before trimming', () => {
    expect(() => core.getInput('missing', {required: true})).toThrow(
      'Input required and not supplied: missing'
    )

    vi.stubEnv('INPUT_WHITESPACE', '   ')
    expect(core.getInput('whitespace', {required: true})).toBe('')
  })

  test.each([
    ['true', true],
    ['True', true],
    ['TRUE', true],
    ['false', false],
    ['False', false],
    ['FALSE', false]
  ] as const)('parses the YAML boolean spelling %s', (value, expected) => {
    vi.stubEnv('INPUT_ENABLED', value)
    expect(core.getBooleanInput('enabled')).toBe(expected)
  })

  test('rejects malformed boolean inputs with the toolkit error', () => {
    vi.stubEnv('INPUT_ENABLED', 'yes')

    expect(() => core.getBooleanInput('enabled')).toThrow(
      'Input does not meet YAML 1.2 "Core Schema" specification: enabled\n' +
        'Support boolean input list: `true | True | TRUE | false | False | FALSE`'
    )
  })

  test('trims boolean inputs unless trimming is disabled', () => {
    vi.stubEnv('INPUT_ENABLED', ' true ')
    expect(core.getBooleanInput('enabled')).toBe(true)
    expect(() =>
      core.getBooleanInput('enabled', {trimWhitespace: false})
    ).toThrow(
      'Input does not meet YAML 1.2 "Core Schema" specification: enabled'
    )
  })
})

describe('file commands', () => {
  test.each([
    ['string', 'plain', 'plain'],
    ['boxed string', new String('boxed'), 'boxed'],
    ['number', 42, '42'],
    ['not-a-number', Number.NaN, 'null'],
    ['infinity', Number.POSITIVE_INFINITY, 'null'],
    ['boolean', false, 'false'],
    ['object', {environment: 'production'}, '{"environment":"production"}'],
    ['array', ['production', 2], '["production",2]'],
    ['null', null, ''],
    ['undefined', undefined, '']
  ] as const)(
    'serializes a %s output value',
    (_description, value, expected) => {
      const filePath = createFileCommand('GITHUB_OUTPUT')

      core.setOutput('result', value)

      expect(readFileCommandValue(filePath)).toBe(expected)
    }
  )

  test('writes state with the same heredoc protocol', () => {
    const filePath = createFileCommand('GITHUB_STATE')

    core.saveState('deployment', {id: 123, active: true})

    expect(readFileCommandValue(filePath)).toBe('{"id":123,"active":true}')
  })

  test('rejects missing file-command paths', () => {
    vi.stubEnv('GITHUB_OUTPUT', join(testDirectory, 'missing'))
    expect(() => {
      core.setOutput('result', 'value')
    }).toThrow(`Missing file at path: ${join(testDirectory, 'missing')}`)

    vi.stubEnv('GITHUB_STATE', join(testDirectory, 'missing-state'))
    expect(() => {
      core.saveState('result', 'value')
    }).toThrow(`Missing file at path: ${join(testDirectory, 'missing-state')}`)
  })

  test('rejects delimiter collisions in names and values', () => {
    createFileCommand('GITHUB_OUTPUT')
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000000'
    )
    syncBuiltinESMExports()
    const delimiter = 'ghadelimiter_00000000-0000-4000-8000-000000000000'

    expect(() => {
      core.setOutput(`name-${delimiter}`, 'value')
    }).toThrow(
      `Unexpected input: name should not contain the delimiter "${delimiter}"`
    )
    expect(() => {
      core.setOutput('name', `value-${delimiter}`)
    }).toThrow(
      `Unexpected input: value should not contain the delimiter "${delimiter}"`
    )
    expect(() => {
      core.setOutput('name', Symbol('value'))
    }).toThrow("Cannot read properties of undefined (reading 'includes')")
  })
})

describe('stdout commands and logging', () => {
  test('preserves output and state fallback bytes and escaping', () => {
    const output = captureStdout()
    delete process.env['GITHUB_OUTPUT']
    delete process.env['GITHUB_STATE']
    core.setOutput('missing-output', 'value')
    core.saveState('missing-state', 'value')
    vi.stubEnv('GITHUB_OUTPUT', '')
    vi.stubEnv('GITHUB_STATE', '')

    core.setOutput('name:part,rest', 'line%\r\nend')
    core.saveState('name:part,rest', 'line%\r\nend')

    expect(output.read()).toBe(
      `${EOL}::set-output name=missing-output::value${EOL}` +
        `::save-state name=missing-state::value${EOL}` +
        `${EOL}::set-output name=name%3Apart%2Crest::line%25%0D%0Aend${EOL}` +
        `::save-state name=name%3Apart%2Crest::line%25%0D%0Aend${EOL}`
    )
  })

  test('emits exact debug, warning, error, and informational bytes', () => {
    const output = captureStdout()

    core.debug('debug%\r\nmessage')
    core.warning(new Error('warning'))
    core.warning('warning string')
    core.error(new Error('error'))
    core.error('error string')
    core.info('plain%\r\ninfo')

    expect(output.read()).toBe(
      `::debug::debug%25%0D%0Amessage${EOL}` +
        `::warning::Error: warning${EOL}` +
        `::warning::warning string${EOL}` +
        `::error::Error: error${EOL}` +
        `::error::error string${EOL}` +
        `plain%\r\ninfo${EOL}`
    )
  })

  test('sets the failure exit code before issuing the error command', () => {
    const output = captureStdout()

    core.setFailed(new Error('failed'))

    expect(process.exitCode).toBe(1)
    expect(output.exitCodes()).toEqual([1])
    expect(output.read()).toBe(`::error::Error: failed${EOL}`)
  })
})

test('state reads preserve the exact state environment key and value', () => {
  vi.stubEnv('STATE_mixed-name', ' raw state ')

  expect(core.getState('mixed-name')).toBe(' raw state ')
  expect(core.getState('MIXED-NAME')).toBe('')
})

test('exports only the narrow consumed type surface', () => {
  expectTypeOf<core.InputOptions>().toEqualTypeOf<{
    required?: boolean
    trimWhitespace?: boolean
  }>()
  expectTypeOf(core.getInput).returns.toBeString()
  expectTypeOf(core.getBooleanInput).returns.toBeBoolean()
  expectTypeOf(core.setOutput).returns.toBeVoid()
  expectTypeOf(core.saveState).returns.toBeVoid()
  expectTypeOf(core.getState).returns.toBeString()
  expectTypeOf(core.setFailed).returns.toBeVoid()
})
