import * as core from '@actions/core'
import {parseParams} from '../../src/functions/params'

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

test('it parses positional parameters', async () => {
  expect(parseParams('foo')).toHaveProperty('_', ['foo'])
})

test('it parses arguments using the default settings of library', async () => {
  const parsed = parseParams('--foo bar --env.foo=bar')
  expect(parsed).toHaveProperty('foo', 'bar')
  expect(parsed).toHaveProperty('env', {foo: 'bar'})
  expect(parsed).toHaveProperty('_', [])
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

test('it parses boolean values correctly', async () => {
  const parsed = parseParams('--enabled=true --disabled false')
  expect(parsed).toHaveProperty('enabled', 'true')
  expect(parsed).toHaveProperty('disabled', 'false')
  expect(parsed).toHaveProperty('_', [])
})

test('it parses nested objects correctly', async () => {
  const parsed = parseParams('--config.db.host=localhost --config.db.port=5432')
  expect(parsed).toHaveProperty('config', {db: {host: 'localhost', port: 5432}})
  expect(parsed).toHaveProperty('_', [])
})
