import assert from 'node:assert/strict'
import {test} from 'node:test'
import {parseParams} from '../../src/functions/params.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

test('with empty param object', () => {
  assert.deepStrictEqual(parseParams(''), {_: []})
  assert.deepStrictEqual(parseParams(null), {_: []})
  assert.deepStrictEqual(
    parseParams(
      unsafeInvalidValue<Parameters<typeof parseParams>[0]>(undefined)
    ),
    {_: []}
  )
})

test('it parses positional parameters', () => {
  assert.deepStrictEqual(parseParams('foo bar baz')['_'], ['foo', 'bar', 'baz'])
})

test('it parses arguments using the default settings of library', () => {
  const parsed = parseParams('--foo bar --env.foo=bar baz')
  assert.strictEqual(parsed['foo'], 'bar')
  assert.deepStrictEqual(parsed['env'], {foo: 'bar'})
  assert.deepStrictEqual(parsed['_'], ['baz'])
})

test('it works with empty string', () => {
  assert.deepStrictEqual(parseParams('')['_'], [])
})

test('it parses multiple positional parameters', () => {
  assert.deepStrictEqual(parseParams('foo bar baz')['_'], ['foo', 'bar', 'baz'])
})

test('it parses flags correctly', () => {
  const parsed = parseParams('--foo --bar')
  assert.strictEqual(parsed['foo'], true)
  assert.strictEqual(parsed['bar'], true)
  assert.deepStrictEqual(parsed['_'], [])
})

test('it parses numeric values correctly', () => {
  const parsed = parseParams('--count 42')
  assert.strictEqual(parsed['count'], 42)
  assert.deepStrictEqual(parsed['_'], [])
})

test('it parses plain values', () => {
  const parsed = parseParams('count 42')
  assert.deepStrictEqual(parsed['_'], ['count', 42])
})

test('it parses string values with comma separation', () => {
  const parsed = parseParams('LOG_LEVEL=debug,CPU_CORES=4')
  assert.deepStrictEqual(parsed['_'], ['LOG_LEVEL=debug,CPU_CORES=4'])
})

test('it parses boolean values correctly', () => {
  const parsed = parseParams('--enabled=true --disabled false')
  assert.strictEqual(parsed['enabled'], 'true')
  assert.strictEqual(parsed['disabled'], 'false')
  assert.deepStrictEqual(parsed['_'], [])
})

test('it parses nested objects correctly', () => {
  const parsed = parseParams(
    'LOG_LEVEL=debug --config.db.host=localhost --config.db.port=5432'
  )
  assert.deepStrictEqual(parsed['config'], {
    db: {host: 'localhost', port: 5432}
  })
  assert.deepStrictEqual(parsed['_'], ['LOG_LEVEL=debug'])
  assert.deepStrictEqual(parsed, {
    config: {db: {host: 'localhost', port: 5432}},
    _: ['LOG_LEVEL=debug']
  })
})

test('it parses a real world example correctly', () => {
  const parsed = parseParams(
    '--cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
  )
  assert.strictEqual(parsed['cpu'], 2)
  assert.strictEqual(parsed['memory'], '4G')
  assert.strictEqual(parsed['env'], 'development')
  assert.strictEqual(parsed['port'], 8080)
  assert.strictEqual(parsed['name'], 'my-app')
  assert.strictEqual(parsed['q'], 'my-queue')
  assert.deepStrictEqual(parsed['_'], [])
})

test('it preserves quoted parameter values and quoted positional arguments', () => {
  assert.deepStrictEqual(
    parseParams(
      `--message="hello world" --single='two words' 'standalone value'`
    ),
    {
      _: [`'standalone value'`],
      message: 'hello world',
      single: 'two words'
    }
  )
})

test('it preserves repeated long and short options as arrays', () => {
  assert.deepStrictEqual(parseParams('--tag=a --tag=b -q first -q second'), {
    _: [],
    tag: ['a', 'b'],
    q: ['first', 'second']
  })
})

test('it preserves numeric coercion, empty values, and no-prefix flags', () => {
  assert.deepStrictEqual(
    parseParams(
      '--count=-2 --ratio=1e3 --hex=0x10 --leading=08 --zero=0 --empty= --no-cache --enabled'
    ),
    {
      _: [],
      count: -2,
      ratio: 1000,
      hex: 16,
      leading: '08',
      zero: 0,
      empty: '',
      cache: false,
      enabled: true
    }
  )
})

test('it treats values following the end-of-options marker as positional', () => {
  assert.deepStrictEqual(parseParams('-- foo --bar --no-cache'), {
    _: ['foo', '--bar', '--no-cache']
  })
})

test('it does not allow dotted parameter names to pollute Object.prototype', () => {
  const parsed = parseParams(
    '--__proto__.polluted=yes --constructor.prototype.bad=yes --prototype.value=x'
  )

  assert.deepStrictEqual(parsed, {
    _: [],
    ___proto___: {polluted: 'yes'},
    constructor: {prototype: {bad: 'yes'}},
    prototype: {value: 'x'}
  })
  assert.strictEqual(Object.hasOwn(Object.prototype, 'polluted'), false)
  assert.strictEqual(Object.hasOwn(Object.prototype, 'bad'), false)
  assert.strictEqual(Object.hasOwn(Object.prototype, 'value'), false)
})
