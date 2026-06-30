import assert from 'node:assert/strict'
import type {Mock, MockModuleContext, MockTracker, TestContext} from 'node:test'
import {mock} from 'node:test'
import {isDeepStrictEqual} from 'node:util'

// Node 24.18 replaced namedExports/defaultExport with exports. The Node types
// have not yet incorporated that runtime API.
declare module 'node:test' {
  interface MockModuleOptions {
    exports?: object
  }
}

type Callable = (...arguments_: never[]) => unknown

export type Assert<Condition extends true> = Condition

export type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value
  >() => Value extends Right ? 1 : 2
    ? true
    : false

export type Extends<Value, Expected> = [Value] extends [Expected] ? true : false

export type Not<Value extends boolean> = Value extends true ? false : true

export function createMock<FunctionType extends Callable>(
  implementation?: FunctionType
): Mock<FunctionType> {
  return mock.fn(implementation)
}

export function queueMockImplementation<FunctionType extends Callable>(
  mockFunction: Mock<FunctionType>,
  ...implementations: readonly FunctionType[]
): void {
  const firstCall = mockFunction.mock.callCount()
  implementations.forEach((implementation, index) => {
    mockFunction.mock.mockImplementationOnce(implementation, firstCall + index)
  })
}

export function installModuleMock<ModuleExports extends object>(
  tracker: MockTracker,
  specifier: string | URL,
  exports: ModuleExports
): MockModuleContext {
  return tracker.module(String(specifier), {cache: true, exports})
}

export function stubEnv(
  context: TestContext,
  name: string,
  value: string | undefined
): void {
  const existed = Object.hasOwn(process.env, name)
  const original = process.env[name]

  context.after(() => {
    if (existed) {
      process.env[name] = original
    } else {
      delete process.env[name]
    }
  })

  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

export function assertCalledTimes<FunctionType extends Callable>(
  mockFunction: Mock<FunctionType>,
  expected: number
): void {
  assert.strictEqual(mockFunction.mock.callCount(), expected)
}

export function assertNotCalled<FunctionType extends Callable>(
  mockFunction: Mock<FunctionType>
): void {
  assertCalledTimes(mockFunction, 0)
}

export function assertCalledWith<FunctionType extends Callable>(
  mockFunction: Mock<FunctionType>,
  ...expected: Parameters<FunctionType>
): void {
  assert.ok(
    mockFunction.mock.calls.some(call =>
      isDeepStrictEqual(call.arguments, expected)
    ),
    'expected mock to have been called with the supplied arguments'
  )
}

export function assertLastCalledWith<FunctionType extends Callable>(
  mockFunction: Mock<FunctionType>,
  ...expected: Parameters<FunctionType>
): void {
  const calls = mockFunction.mock.calls
  assert.ok(calls.length > 0, 'expected mock to have been called')
  const lastCall = calls.at(-1)
  assert.ok(lastCall !== undefined, 'expected a final mock call')
  assert.deepStrictEqual(lastCall.arguments, expected)
}
