import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  assertCalledTimes,
  assertCalledWith,
  assertLastCalledWith,
  assertNotCalled,
  createMock,
  installModuleMock,
  queueMockImplementation,
  stubEnv,
  type Assert,
  type Equal,
  type Extends,
  type Not
} from './node-test-helpers.ts'

test('creates typed mocks and queues one-time implementations', async () => {
  const noImplementation = createMock<() => undefined>()
  assert.strictEqual(noImplementation(), undefined)

  const function_ = createMock<(value: string) => Promise<number>>(value =>
    Promise.resolve(value.length)
  )
  queueMockImplementation(
    function_,
    () => Promise.resolve(99),
    () => Promise.resolve(100)
  )

  assert.strictEqual(await function_('first'), 99)
  assert.strictEqual(await function_('second'), 100)
  assert.strictEqual(await function_('next'), 4)
  assertCalledTimes(function_, 3)
  assertCalledWith(function_, 'next')
  assertLastCalledWith(function_, 'next')
})

test('asserts absent and mismatched calls', () => {
  const function_ = createMock<(value: string) => void>(() => undefined)
  assertNotCalled(function_)
  assert.throws(
    () => assertLastCalledWith(function_, 'missing'),
    /expected mock to have been called/u
  )

  function_('actual')
  assert.throws(
    () => assertCalledWith(function_, 'different'),
    /expected mock to have been called with the supplied arguments/u
  )
})

test('restores an environment variable that originally existed', context => {
  process.env['NODE_TEST_HELPER_EXISTING'] = 'original'
  context.after(() => delete process.env['NODE_TEST_HELPER_EXISTING'])

  stubEnv(context, 'NODE_TEST_HELPER_EXISTING', undefined)
  assert.strictEqual(process.env['NODE_TEST_HELPER_EXISTING'], undefined)
})

test('restores an environment variable that was originally absent', context => {
  delete process.env['NODE_TEST_HELPER_ABSENT']

  stubEnv(context, 'NODE_TEST_HELPER_ABSENT', 'temporary')
  assert.strictEqual(process.env['NODE_TEST_HELPER_ABSENT'], 'temporary')
})

test('installs cached ESM module mocks with explicit exports', async context => {
  const format = createMock<(value: string) => string>(() => 'mocked')
  installModuleMock(context.mock, 'node:util', {format})

  const util = await import('node:util')
  assert.strictEqual(util.format('ignored'), 'mocked')
  assertCalledWith(format, 'ignored')
})

test('provides compile-time assertion types', () => {
  const equal: Assert<Equal<{value: string}, {value: string}>> = true
  const extends_: Assert<Extends<'value', string>> = true
  const not: Assert<Not<false>> = true

  assert.strictEqual(equal && extends_ && not, true)
})
