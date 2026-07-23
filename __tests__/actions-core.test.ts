import * as core from '../src/actions-core.ts'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {EOL, tmpdir} from 'node:os'
import {join} from 'node:path'
import {syncBuiltinESMExports} from 'node:module'
import {
  afterEach,
  beforeEach,
  describe,
  mock,
  test,
  type TestContext
} from 'node:test'
import type {Assert, Equal} from './node-test-helpers.ts'
import {stubEnv} from './node-test-helpers.ts'

const originalExitCode = process.exitCode
let testDirectory: string

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), 'branch-deploy-core-'))
  process.exitCode = undefined
})

afterEach(() => {
  process.exitCode = originalExitCode
  rmSync(testDirectory, {force: true, recursive: true})
  mock.restoreAll()
  syncBuiltinESMExports()
})

function captureStdout(): {
  read: () => string
  exitCodes: () => readonly unknown[]
} {
  const chunks: string[] = []
  const observedExitCodes: unknown[] = []

  mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
    chunks.push(String(chunk))
    observedExitCodes.push(process.exitCode)
    return true
  })

  return {
    read: () => chunks.join(''),
    exitCodes: () => observedExitCodes
  }
}

function createFileCommand(
  context: TestContext,
  name: 'GITHUB_OUTPUT' | 'GITHUB_STATE'
): string {
  const filePath = join(testDirectory, name.toLowerCase())
  writeFileSync(filePath, '')
  stubEnv(context, name, filePath)
  return filePath
}

function readFileCommandValue(filePath: string): string {
  const [header, ...remainingLines] = readFileSync(filePath, 'utf8').split(EOL)
  const delimiter = header?.split('<<')[1]

  assert.match(header ?? '', /^[^<]+<<ghadelimiter_[0-9a-f-]{36}$/u)
  assert.strictEqual(remainingLines.at(-2), delimiter)
  assert.strictEqual(remainingLines.at(-1), '')

  return remainingLines.slice(0, -2).join(EOL)
}

describe('action inputs', () => {
  test('normalizes names, trims by default, and preserves whitespace on request', context => {
    stubEnv(context, 'INPUT_DEPLOY_TARGET', '  production  ')

    assert.strictEqual(core.getInput('deploy target'), 'production')
    assert.strictEqual(
      core.getInput('deploy target', {trimWhitespace: false}),
      '  production  '
    )
    assert.strictEqual(core.getInput('missing'), '')
  })

  test('enforces required inputs before trimming', context => {
    assert.throws(() => core.getInput('missing', {required: true}), {
      message: 'Input required and not supplied: missing'
    })

    stubEnv(context, 'INPUT_WHITESPACE', '   ')
    assert.strictEqual(core.getInput('whitespace', {required: true}), '')
  })

  for (const [value, expected] of [
    ['true', true],
    ['True', true],
    ['TRUE', true],
    ['false', false],
    ['False', false],
    ['FALSE', false]
  ] as const) {
    test(`parses the YAML boolean spelling ${value}`, context => {
      stubEnv(context, 'INPUT_ENABLED', value)
      assert.strictEqual(core.getBooleanInput('enabled'), expected)
    })
  }

  test('rejects malformed boolean inputs with the toolkit error', context => {
    stubEnv(context, 'INPUT_ENABLED', 'yes')

    assert.throws(() => core.getBooleanInput('enabled'), {
      message:
        'Input does not meet YAML 1.2 "Core Schema" specification: enabled\n' +
        'Support boolean input list: `true | True | TRUE | false | False | FALSE`'
    })
  })

  test('trims boolean inputs unless trimming is disabled', context => {
    stubEnv(context, 'INPUT_ENABLED', ' true ')
    assert.strictEqual(core.getBooleanInput('enabled'), true)
    assert.throws(
      () => core.getBooleanInput('enabled', {trimWhitespace: false}),
      {
        message:
          'Input does not meet YAML 1.2 "Core Schema" specification: enabled\n' +
          'Support boolean input list: `true | True | TRUE | false | False | FALSE`'
      }
    )
  })
})

describe('file commands', () => {
  for (const [description, value, expected] of [
    ['string', 'plain', 'plain'],
    ['boxed string', new String('boxed'), 'boxed'],
    ['number', 42, '42'],
    ['not-a-number', Number.NaN, 'null'],
    ['infinity', Number.POSITIVE_INFINITY, 'null'],
    ['boolean', false, 'false'],
    ['object', {environment: 'production'}, '{"environment":"production"}'],
    ['array', ['production', 2], '["production",2]'],
    ['multiline unicode', 'first\r\nsecond\n🚀', 'first\r\nsecond\n🚀'],
    ['null', null, ''],
    ['undefined', undefined, '']
  ] as const) {
    test(`serializes a ${description} output value`, context => {
      const filePath = createFileCommand(context, 'GITHUB_OUTPUT')

      core.setOutput('result', value)

      assert.strictEqual(readFileCommandValue(filePath), expected)
    })
  }

  test('writes state with the same heredoc protocol', context => {
    const filePath = createFileCommand(context, 'GITHUB_STATE')

    core.saveState('deployment', {id: 123, active: true})

    assert.strictEqual(
      readFileCommandValue(filePath),
      '{"id":123,"active":true}'
    )
  })

  test('appends multiline output and state records with unique delimiters', context => {
    const outputPath = createFileCommand(context, 'GITHUB_OUTPUT')
    const statePath = createFileCommand(context, 'GITHUB_STATE')
    writeFileSync(outputPath, `existing-output${EOL}`)
    writeFileSync(statePath, `existing-state${EOL}`)
    const uuids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004'
    ] as const
    let uuidIndex = 0
    mock.method(crypto, 'randomUUID', () => {
      const uuid = uuids[uuidIndex]
      uuidIndex += 1
      assert.ok(uuid !== undefined)
      return uuid
    })
    syncBuiltinESMExports()

    core.setOutput('first', 'one\r\ntwo\n🚀')
    core.setOutput('second', 'tail')
    core.saveState('first-state', 'one\ntwo')
    core.saveState('second-state', false)

    assert.strictEqual(
      readFileSync(outputPath, 'utf8'),
      `existing-output${EOL}` +
        `first<<ghadelimiter_${uuids[0]}${EOL}one\r\ntwo\n🚀${EOL}ghadelimiter_${uuids[0]}${EOL}` +
        `second<<ghadelimiter_${uuids[1]}${EOL}tail${EOL}ghadelimiter_${uuids[1]}${EOL}`
    )
    assert.strictEqual(
      readFileSync(statePath, 'utf8'),
      `existing-state${EOL}` +
        `first-state<<ghadelimiter_${uuids[2]}${EOL}one\ntwo${EOL}ghadelimiter_${uuids[2]}${EOL}` +
        `second-state<<ghadelimiter_${uuids[3]}${EOL}false${EOL}ghadelimiter_${uuids[3]}${EOL}`
    )
    assert.strictEqual(uuidIndex, uuids.length)
  })

  test('rejects missing file-command paths', context => {
    stubEnv(context, 'GITHUB_OUTPUT', join(testDirectory, 'missing'))
    assert.throws(() => core.setOutput('result', 'value'), {
      message: `Missing file at path: ${join(testDirectory, 'missing')}`
    })

    stubEnv(context, 'GITHUB_STATE', join(testDirectory, 'missing-state'))
    assert.throws(() => core.saveState('result', 'value'), {
      message: `Missing file at path: ${join(testDirectory, 'missing-state')}`
    })
  })

  test('rejects delimiter collisions in names and values', context => {
    createFileCommand(context, 'GITHUB_OUTPUT')
    mock.method(
      crypto,
      'randomUUID',
      () => '00000000-0000-4000-8000-000000000000'
    )
    syncBuiltinESMExports()
    const delimiter = 'ghadelimiter_00000000-0000-4000-8000-000000000000'

    assert.throws(() => core.setOutput(`name-${delimiter}`, 'value'), {
      message: `Unexpected input: name should not contain the delimiter "${delimiter}"`
    })
    assert.throws(() => core.setOutput('name', `value-${delimiter}`), {
      message: `Unexpected input: value should not contain the delimiter "${delimiter}"`
    })
    assert.throws(() => core.setOutput('name', Symbol('value')), {
      message: "Cannot read properties of undefined (reading 'includes')"
    })
  })
})

describe('stdout commands and logging', () => {
  test('preserves output and state fallback bytes and escaping', context => {
    const output = captureStdout()
    stubEnv(context, 'GITHUB_OUTPUT', undefined)
    stubEnv(context, 'GITHUB_STATE', undefined)
    core.setOutput('missing-output', 'value')
    core.saveState('missing-state', 'value')
    process.env['GITHUB_OUTPUT'] = ''
    process.env['GITHUB_STATE'] = ''

    core.setOutput('name:part,rest', 'line%\r\nend')
    core.saveState('name:part,rest', 'line%\r\nend')

    assert.strictEqual(
      output.read(),
      `${EOL}::set-output name=missing-output::value${EOL}` +
        `::save-state name=missing-state::value${EOL}` +
        `${EOL}::set-output name=name%3Apart%2Crest::line%25%0D%0Aend${EOL}` +
        `::save-state name=name%3Apart%2Crest::line%25%0D%0Aend${EOL}`
    )
  })

  test('serializes every supported value through the stdout fallback', context => {
    const output = captureStdout()
    stubEnv(context, 'GITHUB_OUTPUT', undefined)
    stubEnv(context, 'GITHUB_STATE', undefined)

    for (const [name, value, expected] of [
      ['boxed', new String('boxed'), 'boxed'],
      ['number', 42, '42'],
      ['not-a-number', Number.NaN, 'null'],
      ['infinity', Number.POSITIVE_INFINITY, 'null'],
      ['boolean', false, 'false'],
      ['object', {value: 'line%\r\nend'}, '{"value":"line%25\\r\\nend"}'],
      ['array', ['production', 2], '["production",2]'],
      ['null', null, ''],
      ['undefined', undefined, '']
    ] as const) {
      core.setOutput(name, value)
      core.saveState(name, value)

      assert.ok(
        output
          .read()
          .endsWith(
            `${EOL}::set-output name=${name}::${expected}${EOL}` +
              `::save-state name=${name}::${expected}${EOL}`
          )
      )
    }
  })

  test('emits exact debug, warning, error, and informational bytes', () => {
    const output = captureStdout()

    core.debug('debug%\r\nmessage')
    core.warning(new Error('warning'))
    core.warning('warning string')
    core.error(new Error('error'))
    core.error('error string')
    core.info('plain%\r\ninfo')

    assert.strictEqual(
      output.read(),
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

    assert.strictEqual(process.exitCode, 1)
    assert.deepStrictEqual(output.exitCodes(), [1])
    assert.strictEqual(output.read(), `::error::Error: failed${EOL}`)
  })
})

test('state reads preserve the exact state environment key and value', context => {
  stubEnv(context, 'STATE_mixed-name', ' raw state ')

  assert.strictEqual(core.getState('mixed-name'), ' raw state ')
  assert.strictEqual(core.getState('MIXED-NAME'), '')
})

test('exports only the narrow consumed type surface', () => {
  const assertType = <Condition extends true>(
    condition: Assert<Condition>
  ): void => assert.strictEqual(condition, true)

  assertType<
    Equal<core.InputOptions, {required?: boolean; trimWhitespace?: boolean}>
  >(true)
  assertType<Equal<ReturnType<typeof core.getInput>, string>>(true)
  assertType<Equal<ReturnType<typeof core.getBooleanInput>, boolean>>(true)
  assertType<Equal<ReturnType<typeof core.setOutput>, void>>(true)
  assertType<Equal<ReturnType<typeof core.saveState>, void>>(true)
  assertType<Equal<ReturnType<typeof core.getState>, string>>(true)
  assertType<Equal<ReturnType<typeof core.setFailed>, void>>(true)
})
