import type {Mock, MockInstance} from 'vitest'
import type {BranchDeployContext, BranchDeployOctokit} from '../src/types.ts'

type FunctionLike = (...args: never[]) => unknown
type DeepPartial<T> = T extends readonly (infer Item)[]
  ? DeepPartial<Item>[]
  : T extends object
    ? {[Key in keyof T]?: DeepPartial<T[Key]>}
    : T

type ExistingMockReturn<T extends FunctionLike> =
  ReturnType<T> extends Promise<unknown>
    ?
        | ReturnType<T>
        | DeepPartial<Awaited<ReturnType<T>>>
        | Promise<DeepPartial<Awaited<ReturnType<T>>>>
    : ReturnType<T>

/**
 * Treat an already-spied function as a Vitest mock while allowing the existing
 * tests to preserve synchronous and intentionally partial implementations for
 * async production functions.
 */
type ExistingBehaviorMock<T extends FunctionLike> = Mock<
  (...args: Parameters<T>) => ExistingMockReturn<T>
>

export function asMock<T extends FunctionLike>(
  fn: MockInstance<T>
): ExistingBehaviorMock<T>
export function asMock<T extends FunctionLike>(fn: T): ExistingBehaviorMock<T>
export function asMock(fn: unknown) {
  return fn as never
}

/** Cast an intentionally partial GitHub event fixture at the test boundary. */
export function asPartialContext(value: unknown): BranchDeployContext {
  return value as BranchDeployContext
}

/** Cast an intentionally partial Octokit fixture at the test boundary. */
export function asPartialOctokit(value: unknown): BranchDeployOctokit {
  return value as BranchDeployOctokit
}
