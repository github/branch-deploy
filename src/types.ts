import type {getOctokit} from '@actions/github'

export type BranchDeployOctokit = ReturnType<typeof getOctokit>

export interface ApiError {
  message: string
  stack: string
  status?: number
}

export interface RepositoryCoordinates {
  owner: string
  repo: string
}

export interface IssueCommentPayload {
  body: string
  created_at: string
  html_url: string
  id: number
  updated_at: string
  user: {
    login: string
  }
}

export interface IssuePayload {
  number: number
  pull_request?: unknown
}

export interface PullRequestPayload {
  merged?: boolean
  number: number
}

export interface BranchDeployContext {
  actor: string
  eventName: string
  issue: {
    number: number
  }
  payload: {
    action?: string
    comment?: unknown
    issue?: unknown
    pull_request?: unknown
    [key: string]: unknown
  }
  repo: RepositoryCoordinates
  runId: number
}

export interface IssueCommentContext extends BranchDeployContext {
  payload: BranchDeployContext['payload'] & {
    comment: IssueCommentPayload
    issue: IssuePayload
  }
}

export interface PullRequestContext extends BranchDeployContext {
  payload: BranchDeployContext['payload'] & {
    action?: string
    pull_request: PullRequestPayload
  }
}

export interface ActionInputs {
  admins: string
  allowForks: boolean
  allow_non_default_target_branch_deployments: boolean
  allow_sha_deployments: boolean
  checks: 'all' | 'required' | string[]
  commit_verification: boolean
  deployment_confirmation: boolean
  deployment_confirmation_timeout: number
  disable_naked_commands: boolean
  draft_permitted_targets: string
  enforced_deployment_order: string[]
  environment: string
  environment_targets: string
  environment_urls: string
  global_lock_flag: string
  help_trigger: string
  ignored_checks: string[]
  lock_info_alias: string
  lock_trigger: string
  mergeDeployMode: boolean
  noop_trigger: string
  outdated_mode: 'pr_base' | 'default_branch' | 'strict'
  param_separator: string
  permissions: string[]
  production_environments: string[]
  reaction: string
  required_contexts: string
  skipCi: string
  skipReviews: string
  stable_branch: string
  sticky_locks: boolean
  sticky_locks_for_noop: boolean
  trigger: string
  unlockOnMergeMode: boolean
  unlock_trigger: string
  update_branch: 'disabled' | 'force' | 'warn'
  use_security_warnings: boolean
}

export interface ParsedParams extends Record<string, unknown> {
  _: Array<number | string>
}

export interface EnvironmentTarget {
  noop: boolean | null
  params: string | null
  parsed_params: ParsedParams | null
  sha: string | null
  stable_branch_used: boolean | null
  target: false | string
}

export interface DeploymentEnvironmentResult {
  environment: false | string
  environmentObj: EnvironmentTarget
  environmentUrl: string | null
}

export interface LockEnvironmentResult {
  environment: false | string
  environmentUrl: null
}

export interface LockData {
  branch: string | null
  created_at: string
  created_by: string
  environment: string | null
  global: boolean
  link: string
  reason: unknown
  sticky: boolean | null
  unlock_command: string
}

export type LockStatus = 'details-only' | 'owner' | boolean | null

export interface LockResponse {
  environment: string | null
  global: boolean
  globalFlag: string
  lockData: LockData | null
  status: LockStatus
}

export interface CommitData {
  author?: {
    date?: string | null
  } | null
  verification?: {
    reason?: string | null
    verified?: boolean
    verified_at?: string | null
  } | null
}

export interface CommitSafetyData {
  commit: CommitData
  inputs: ActionInputs
  sha: string
}

export interface CommitSafetyResult {
  isVerified: boolean
  message: string
  status: boolean
}

export interface PrecheckData {
  environment: string
  environmentObj: EnvironmentTarget
  inputs: ActionInputs
  issue_number: number | string
}

export interface PrecheckFailure {
  message: string
  ref?: undefined
  sha?: undefined
  status: false
}

export interface PrecheckSuccess {
  isFork: boolean
  message: string
  noopMode: boolean | null
  ref: string
  sha: string
  status: true
}

export type PrecheckResult = PrecheckFailure | PrecheckSuccess

export interface CheckResult {
  conclusion?: string | null
  context?: string
  isRequired?: boolean
  name?: string
  state?: string
}

export interface PrechecksGraphqlResult {
  repository: {
    pullRequest: {
      commits: {
        nodes: Array<{
          commit: {
            oid: string
            statusCheckRollup: null | {
              contexts: {
                nodes: CheckResult[]
              }
              state: string
            }
          }
        }>
      }
      mergeStateStatus: string
      reviewDecision: string | null
      reviews: {
        totalCount: number
      }
    }
  }
}

export interface DeploymentGraphqlNode {
  commit: {
    oid: string
  }
  state: string
}

export interface DeploymentGraphqlResult {
  repository: {
    deployments: {
      nodes: DeploymentGraphqlNode[]
      pageInfo: {
        endCursor: string | null
        hasNextPage: boolean
      }
    }
  }
}

export interface CreatedDeploymentSuccess {
  created_at: string
  id: number
  message?: never
  statuses_url: string
  updated_at: string
  url: string
}

export interface CreatedDeploymentAcceptedMessage {
  created_at?: string
  id?: undefined
  message: string
  statuses_url?: string
  updated_at?: string
  url?: string
}

export type CreatedDeployment =
  | CreatedDeploymentAcceptedMessage
  | CreatedDeploymentSuccess

export interface DeploymentConfirmationData {
  body: string
  commit_html_url: string
  committer: string | null | undefined
  deployment_confirmation_timeout: number
  deploymentType: string
  environment: string
  environmentUrl: string | null
  github_run_id: number
  isFork: boolean
  isVerified: boolean
  log_url: string
  noopMode: boolean | null
  params: string | null
  parsed_params: ParsedParams | null
  ref: string
  sha: string
}

export interface PostDeployLabels {
  failed_deploy: string[]
  failed_noop: string[]
  skip_successful_deploy_labels_if_approved: boolean
  skip_successful_noop_labels_if_approved: boolean
  successful_deploy: string[]
  successful_noop: string[]
}

export interface PostDeployData {
  approved_reviews_count: string
  comment_id: string
  commit_verified: boolean
  deployment_id: string
  deployment_start_time: string
  environment: string
  environment_url: string | null
  fork: boolean
  labels: PostDeployLabels
  noop: boolean
  params: string
  parsed_params: string
  reaction_id: string
  ref: string
  review_decision: string
  sha: string
  status: string
}

export interface PostDeployMessageData {
  approved_reviews_count: string
  commit_verified: boolean
  deployment_end_time: string
  deployment_id: string
  environment: string
  environment_url: string | null
  fork: boolean
  noop: boolean
  params: string
  parsed_params: string
  ref: string
  review_decision: string
  sha: string
  status: string
  total_seconds: number
}

export type RuleParameters = Record<string, boolean | number>

export interface BranchRule {
  parameters: RuleParameters
  type: string
}
