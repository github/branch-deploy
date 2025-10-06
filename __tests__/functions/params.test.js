import * as core from '@actions/core'
import {vi, expect, describe, test, beforeEach, afterEach} from 'vitest'
import {parseParams} from '../../src/functions/params.js'

beforeEach(() => {
  vi.clearAllMocks()
})

test('with empty param object', async () => {
  expect(parseParams('')).toStrictEqual({_: []})
  expect(parseParams(null)).toStrictEqual({_: []})
  expect(parseParams(undefined)).toStrictEqual({_: []})
})

test('it parses positional parameters', async () => {
  expect(parseParams('foo bar baz')).toHaveProperty('_', ['foo', 'bar', 'baz'])
})

test('it parses arguments using the default settings of library', async () => {
  const parsed = parseParams('--foo bar --env.foo=bar baz')
  expect(parsed).toHaveProperty('foo', 'bar')
  expect(parsed).toHaveProperty('env', {foo: 'bar'})
  expect(parsed).toHaveProperty('_', ['baz'])
})

test('it works with empty string', async () => {
  expect(parseParams('')).toHaveProperty('_', [])
})

test('it parses multiple positional parameters', async () => {
  expect(parseParams('foo bar baz')).toHaveProperty('_', ['foo', 'bar', 'baz'])
})

test('it parses flags correctly', async () => {
  const parsed = parseParams('--foo --bar')
  expect(parsed).toHaveProperty('foo', true)
  expect(parsed).toHaveProperty('bar', true)
  expect(parsed).toHaveProperty('_', [])
})

test('it parses numeric values correctly', async () => {
  const parsed = parseParams('--count 42')
  expect(parsed).toHaveProperty('count', 42)
  expect(parsed).toHaveProperty('_', [])
})

test('it parses plain values', async () => {
  const parsed = parseParams('count 42')
  expect(parsed).toHaveProperty('_', ['count', 42])
})

test('it parses string values with comma separation', async () => {
  const parsed = parseParams('LOG_LEVEL=debug,CPU_CORES=4')
  expect(parsed).toHaveProperty('_', ['LOG_LEVEL=debug,CPU_CORES=4'])
})

test('it parses boolean values correctly', async () => {
  const parsed = parseParams('--enabled=true --disabled false')
  expect(parsed).toHaveProperty('enabled', 'true')
  expect(parsed).toHaveProperty('disabled', 'false')
  expect(parsed).toHaveProperty('_', [])
})

test('it parses nested objects correctly', async () => {
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

test('it parses a real world example correctly', async () => {
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
