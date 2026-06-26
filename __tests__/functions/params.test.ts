import {vi, expect, test, beforeEach} from 'vitest'
import {parseParams} from '../../src/functions/params.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

beforeEach(() => {
  vi.clearAllMocks()
})

test('with empty param object', () => {
  expect(parseParams('')).toStrictEqual({_: []})
  expect(parseParams(null)).toStrictEqual({_: []})
  expect(
    parseParams(
      unsafeInvalidValue<Parameters<typeof parseParams>[0]>(undefined)
    )
  ).toStrictEqual({_: []})
})

test('it parses positional parameters', () => {
  expect(parseParams('foo bar baz')).toHaveProperty('_', ['foo', 'bar', 'baz'])
})

test('it parses arguments using the default settings of library', () => {
  const parsed = parseParams('--foo bar --env.foo=bar baz')
  expect(parsed).toHaveProperty('foo', 'bar')
  expect(parsed).toHaveProperty('env', {foo: 'bar'})
  expect(parsed).toHaveProperty('_', ['baz'])
})

test('it works with empty string', () => {
  expect(parseParams('')).toHaveProperty('_', [])
})

test('it parses multiple positional parameters', () => {
  expect(parseParams('foo bar baz')).toHaveProperty('_', ['foo', 'bar', 'baz'])
})

test('it parses flags correctly', () => {
  const parsed = parseParams('--foo --bar')
  expect(parsed).toHaveProperty('foo', true)
  expect(parsed).toHaveProperty('bar', true)
  expect(parsed).toHaveProperty('_', [])
})

test('it parses numeric values correctly', () => {
  const parsed = parseParams('--count 42')
  expect(parsed).toHaveProperty('count', 42)
  expect(parsed).toHaveProperty('_', [])
})

test('it parses plain values', () => {
  const parsed = parseParams('count 42')
  expect(parsed).toHaveProperty('_', ['count', 42])
})

test('it parses string values with comma separation', () => {
  const parsed = parseParams('LOG_LEVEL=debug,CPU_CORES=4')
  expect(parsed).toHaveProperty('_', ['LOG_LEVEL=debug,CPU_CORES=4'])
})

test('it parses boolean values correctly', () => {
  const parsed = parseParams('--enabled=true --disabled false')
  expect(parsed).toHaveProperty('enabled', 'true')
  expect(parsed).toHaveProperty('disabled', 'false')
  expect(parsed).toHaveProperty('_', [])
})

test('it parses nested objects correctly', () => {
  const parsed = parseParams(
    'LOG_LEVEL=debug --config.db.host=localhost --config.db.port=5432'
  )
  expect(parsed).toHaveProperty('config', {db: {host: 'localhost', port: 5432}})
  expect(parsed).toHaveProperty('_', ['LOG_LEVEL=debug'])
  expect(parsed).toStrictEqual({
    config: {db: {host: 'localhost', port: 5432}},
    _: ['LOG_LEVEL=debug']
  })
})

test('it parses a real world example correctly', () => {
  const parsed = parseParams(
    '--cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
  )
  expect(parsed).toHaveProperty('cpu', 2)
  expect(parsed).toHaveProperty('memory', '4G')
  expect(parsed).toHaveProperty('env', 'development')
  expect(parsed).toHaveProperty('port', 8080)
  expect(parsed).toHaveProperty('name', 'my-app')
  expect(parsed).toHaveProperty('q', 'my-queue')
  expect(parsed).toHaveProperty('_', [])
})
