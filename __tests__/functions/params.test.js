import {parseParams} from '../../src/functions/params'

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
