import * as github from '@actions/github'
import type {
  ActionInputs,
  BranchDeployContext,
  BranchDeployOctokit,
  IssueCommentContext,
  IssueCommentPayload,
  IssuePayload
} from '../src/types.ts'

const DEFAULT_INPUTS = {
  admins: 'false',
  allowForks: false,
  allow_non_default_target_branch_deployments: false,
  allow_sha_deployments: false,
  checks: 'all',
  commit_verification: false,
  deployment_confirmation: false,
  deployment_confirmation_timeout: 60,
  disable_lock: false,
  disable_naked_commands: false,
  draft_permitted_targets: '',
  enforced_deployment_order: [],
  environment: 'production',
  environment_targets: 'production,staging,development',
  environment_urls: '',
  global_lock_flag: '--global',
  help_trigger: '.help',
  ignored_checks: [],
  lock_info_alias: '.wcid',
  lock_trigger: '.lock',
  mergeDeployMode: false,
  noop_trigger: '.noop',
  outdated_mode: 'default_branch',
  param_separator: '|',
  permissions: ['write', 'admin'],
  production_environments: ['production'],
  reaction: 'eyes',
  required_contexts: 'false',
  skipCi: '',
  skipReviews: '',
  stable_branch: 'main',
  sticky_locks: false,
  sticky_locks_for_noop: false,
  trigger: '.deploy',
  unlockOnMergeMode: false,
  unlock_trigger: '.unlock',
  update_branch: 'warn',
  use_security_warnings: true
} satisfies ActionInputs

export type DeepMutable<T> = T extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? {-readonly [Key in keyof T]: DeepMutable<T[Key]>}
      : T

const DEFAULT_COMMENT = {
  body: '.deploy',
  created_at: '2025-01-01T00:00:00Z',
  html_url: 'https://github.com/octo-org/octo-repo/pull/1#issuecomment-1',
  id: 1,
  updated_at: '2025-01-01T00:00:00Z',
  user: {login: 'octocat'}
} satisfies IssueCommentPayload

const DEFAULT_ISSUE = {
  number: 1,
  pull_request: {}
} satisfies IssuePayload

export function createContext(
  overrides: Partial<BranchDeployContext> = {}
): BranchDeployContext {
  return {
    actor: 'octocat',
    eventName: 'issue_comment',
    issue: {number: 1},
    payload: {},
    repo: {owner: 'octo-org', repo: 'octo-repo'},
    runId: 1,
    ...overrides
  }
}

export function createActionInputs(
  overrides: Partial<ActionInputs> = {}
): DeepMutable<ActionInputs> {
  const checks = overrides.checks ?? DEFAULT_INPUTS.checks
  return {
    ...DEFAULT_INPUTS,
    ...overrides,
    checks: typeof checks === 'string' ? checks : [...checks],
    enforced_deployment_order: [
      ...(overrides.enforced_deployment_order ??
        DEFAULT_INPUTS.enforced_deployment_order)
    ],
    ignored_checks: [
      ...(overrides.ignored_checks ?? DEFAULT_INPUTS.ignored_checks)
    ],
    permissions: [...(overrides.permissions ?? DEFAULT_INPUTS.permissions)],
    production_environments: [
      ...(overrides.production_environments ??
        DEFAULT_INPUTS.production_environments)
    ]
  }
}

export function createIssueCommentContext(
  overrides: Partial<Omit<IssueCommentContext, 'payload'>> & {
    payload?: Omit<
      Partial<IssueCommentContext['payload']>,
      'comment' | 'issue'
    > & {
      comment?: Partial<IssueCommentPayload>
      issue?: Partial<IssuePayload>
    }
  } = {}
): IssueCommentContext {
  const {payload = {}, ...contextOverrides} = overrides

  return {
    ...createContext(contextOverrides),
    payload: {
      ...payload,
      comment: {...DEFAULT_COMMENT, ...payload.comment},
      issue: {...DEFAULT_ISSUE, ...payload.issue}
    }
  }
}

export function createOctokit(): BranchDeployOctokit {
  return github.getOctokit('test-token')
}
