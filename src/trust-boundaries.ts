// This module preserves the action's reviewed legacy coercion boundaries.

import type * as github from '@actions/github'
import type {
  PrechecksPullData,
  PrechecksPullResponse
} from './functions/prechecks.ts'
import type {
  BranchDeployContext,
  CreatedDeployment,
  IssueCommentContext,
  LegacyApiError,
  LockData,
  PrechecksGraphqlContextsPageResult,
  PrechecksGraphqlResult,
  PullRequestPayload
} from './types.ts'

export function branchDeployContext(
  context: typeof github.context
): BranchDeployContext {
  return context
}

/**
 * These conversions preserve the action's established JavaScript trust
 * boundaries. Callers make the same event, mode, and response decisions they
 * did before the TypeScript migration; keeping the assertions here makes the
 * unchecked assumptions reviewable without introducing new runtime rejection
 * or fallback behavior.
 */
export function issueCommentContext(
  context: BranchDeployContext
): IssueCommentContext {
  return context as IssueCommentContext
}

export function legacyApiError(error: unknown): LegacyApiError {
  return error as LegacyApiError
}

export function decodedLockData(value: string): LockData {
  return JSON.parse(value) as LockData
}

export function decodedJsonValue(value: string): unknown {
  return JSON.parse(value) as unknown
}

export function decodedDeploymentTemplateLiteral(
  value: string
): boolean | null | number | string {
  return JSON.parse(value) as boolean | null | number | string
}

export function regexCapture(match: RegExpMatchArray, index: number): string {
  return match[index] as string
}

export function createdDeployment(value: unknown): CreatedDeployment {
  return value as CreatedDeployment
}

export function legacyDeploymentId(value: number | undefined): number {
  return value as number
}

export function legacyDeploymentStatusId(value: number | string): number {
  return value as number
}

export function legacyEnvironmentUrl(value: string | null): string {
  return value as string
}

export function legacyLockData(value: LockData | null): LockData {
  return value as LockData
}

export function legacyArrayElement<T>(value: T | undefined): T {
  return value as T
}

export function legacyEnvironmentUrlMatch(
  value: string | undefined,
  pattern: RegExp
): RegExpMatchArray | null {
  return (value as string).match(pattern)
}

export function legacyLength(value: unknown): number | undefined {
  return (value as {readonly length?: number}).length
}

export function legacyTruthy<T>(
  value: T
): value is Exclude<T, false | null | undefined | 0 | ''> {
  return Boolean(value)
}

export function legacyLooselyTrue(value: unknown): boolean {
  return value == true
}

export function legacyStrictTrue(value: unknown): value is true {
  return value === true
}

export function legacyIgnoredChecks(value: unknown): readonly string[] {
  return legacyTruthy(value) ? (value as readonly string[]) : []
}

export function repositoryFileContent(value: unknown): string {
  return (value as {readonly content: string}).content
}

export function legacyBranchRuleParameters(
  value: unknown
): Readonly<Record<string, unknown>> {
  return (value as {readonly parameters: Readonly<Record<string, unknown>>})
    .parameters
}

export function legacyDebugValue(value: unknown): string {
  return value as string
}

export function legacyCommitterLogin(
  value: unknown
): string | null | undefined {
  return (
    value as {
      readonly data?: {
        readonly committer?: null | {readonly login?: string | null}
      }
    }
  ).data?.committer?.login
}

export function legacyIssueCommentCreatedAt(
  context: BranchDeployContext
): string | null | undefined {
  return (
    context as
      | {
          readonly payload?: {
            readonly comment?: {readonly created_at?: string | null} | null
          } | null
        }
      | null
      | undefined
  )?.payload?.comment?.created_at
}

export function legacyPullRequestEvent(context: BranchDeployContext): {
  readonly action: string | undefined
  readonly eventName: string | undefined
  readonly pullRequest: PullRequestPayload | undefined
} {
  const value = context as
    | {
        readonly eventName?: string
        readonly payload?: {
          readonly action?: string
          readonly pull_request?: PullRequestPayload
        } | null
      }
    | null
    | undefined
  return {
    action: value?.payload?.action,
    eventName: value?.eventName,
    pullRequest: value?.payload?.pull_request
  }
}

export function legacyBranchTreeSha(value: unknown): string | undefined {
  return (
    value as
      | {
          readonly data?: {
            readonly commit?: {
              readonly commit?: {readonly tree?: {readonly sha?: string}}
            }
          }
        }
      | null
      | undefined
  )?.data?.commit?.commit?.tree?.sha
}

export function legacyPrechecksCommitOid(value: unknown): string | undefined {
  return (
    value as
      | {
          readonly repository?: {
            readonly pullRequest?: {
              readonly commits?: {
                readonly nodes: readonly ({
                  readonly commit?: {readonly oid?: string}
                } | null)[]
              }
            } | null
          } | null
        }
      | null
      | undefined
  )?.repository?.pullRequest?.commits?.nodes?.[0]?.commit?.oid
}

export function prechecksGraphqlResult(value: unknown): PrechecksGraphqlResult {
  return value as PrechecksGraphqlResult
}

export function prechecksGraphqlContextsPageResult(
  value: unknown
): PrechecksGraphqlContextsPageResult {
  return value as PrechecksGraphqlContextsPageResult
}

export function legacyPrechecksPullData(
  value: PrechecksPullResponse['data']
): PrechecksPullData {
  return value as PrechecksPullData
}

export function legacyPrechecksPullRepository(
  value: PrechecksPullData['head']['repo']
): {readonly fork?: boolean; readonly full_name: string} {
  return value as {readonly fork?: boolean; readonly full_name: string}
}
