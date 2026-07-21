import type {getOctokit} from '@actions/github'

export type BranchDeployOctokit = ReturnType<typeof getOctokit>

export interface LegacyApiError {
  readonly message: string
  readonly stack: string
  readonly status?: number
}

/** @deprecated Use the named conversion in trust-boundaries.ts. */
export type ApiError = LegacyApiError

export interface RepositoryCoordinates {
  readonly owner: string
  readonly repo: string
}

export interface IssueCommentPayload {
  readonly body: string
  readonly created_at: string
  readonly html_url: string
  readonly id: number
  readonly updated_at: string
  readonly user: {
    readonly login: string
  }
}

export interface IssuePayload {
  readonly number: number
  readonly pull_request?: unknown
}

export interface PullRequestPayload {
  readonly merged?: boolean
  readonly number: number
}

export interface BranchDeployContext {
  readonly actor: string
  readonly eventName: string
  readonly issue: {
    readonly number: number
  }
  readonly payload: {
    readonly action?: string
    readonly comment?: unknown
    readonly issue?: unknown
    readonly pull_request?: unknown
    readonly [key: string]: unknown
  }
  readonly repo: RepositoryCoordinates
  readonly runId: number
}

export interface IssueCommentContext extends BranchDeployContext {
  readonly payload: BranchDeployContext['payload'] & {
    readonly comment: IssueCommentPayload
    readonly issue: IssuePayload
  }
}

export interface PullRequestContext extends BranchDeployContext {
  readonly payload: BranchDeployContext['payload'] & {
    readonly action?: string
    readonly pull_request: PullRequestPayload
  }
}

export type UpdateBranchMode = 'disabled' | 'force' | 'warn'
export type OutdatedMode = 'default_branch' | 'pr_base' | 'strict'
export type ChecksInput = 'all' | 'required' | readonly string[]

export interface ActionInputs {
  readonly admins: string
  readonly allowForks: boolean
  readonly allow_non_default_target_branch_deployments: boolean
  readonly allow_sha_deployments: boolean
  readonly checks: ChecksInput
  readonly commit_verification: boolean
  readonly deployment_confirmation: boolean
  readonly deployment_confirmation_timeout: number
  readonly disable_lock: boolean
  readonly disable_naked_commands: boolean
  readonly draft_permitted_targets: string
  readonly enforced_deployment_order: readonly string[]
  readonly environment: string
  readonly environment_targets: string
  readonly environment_urls: string
  readonly global_lock_flag: string
  readonly help_trigger: string
  readonly ignored_checks: readonly string[]
  readonly lock_info_alias: string
  readonly lock_trigger: string
  readonly mergeDeployMode: boolean
  readonly noop_trigger: string
  readonly outdated_mode: OutdatedMode
  readonly param_separator: string
  readonly permissions: readonly string[]
  readonly production_environments: readonly string[]
  readonly reaction: string
  readonly required_contexts: string
  readonly skipCi: string
  readonly skipReviews: string
  readonly stable_branch: string
  readonly sticky_locks: boolean
  readonly sticky_locks_for_noop: boolean
  readonly trigger: string
  readonly unlockOnMergeMode: boolean
  readonly unlock_trigger: string
  readonly update_branch: UpdateBranchMode
  readonly use_security_warnings: boolean
}

export interface ParsedParams extends Record<string, unknown> {
  readonly _: (number | string)[]
}

export interface ValidEnvironmentTarget {
  readonly noop: boolean
  readonly params: string | null
  readonly parsed_params: ParsedParams | null
  readonly sha: string | null
  readonly stable_branch_used: boolean
  readonly target: string
}

export interface InvalidEnvironmentTarget {
  readonly noop: null
  readonly params: null
  readonly parsed_params: null
  readonly sha: null
  readonly stable_branch_used: null
  readonly target: false
}

export type EnvironmentTarget =
  | InvalidEnvironmentTarget
  | ValidEnvironmentTarget

export interface ValidDeploymentEnvironmentResult {
  readonly environment: string
  readonly environmentObj: ValidEnvironmentTarget
  readonly environmentUrl: string | null
}

export interface InvalidDeploymentEnvironmentResult {
  readonly environment: false
  readonly environmentObj: InvalidEnvironmentTarget
  readonly environmentUrl: null
}

export type DeploymentEnvironmentResult =
  | InvalidDeploymentEnvironmentResult
  | ValidDeploymentEnvironmentResult

export type LockEnvironmentResult =
  | {readonly environment: false; readonly environmentUrl: null}
  | {readonly environment: string; readonly environmentUrl: null}

export interface LockData {
  readonly branch: string | null
  readonly claim_id?: string
  readonly created_at: string
  readonly created_by: string
  readonly environment: string | null
  readonly global: boolean
  readonly link: string
  readonly reason: unknown
  readonly schema_version?: 1
  readonly sticky: boolean | null
  readonly unlock_command: string
}

interface LockResponseBase {
  readonly environment: string | null
  readonly global: boolean
  readonly globalFlag: string
  readonly lockRefSha?: string
}

export type LockResponse =
  | (LockResponseBase & {
      readonly lockData: LockData
      readonly status: 'details-only' | 'owner'
    })
  | (LockResponseBase & {
      readonly lockData: null
      readonly status: 'ambiguous'
    })
  | (LockResponseBase & {
      readonly lockData: LockData | null
      readonly status: false
    })
  | (LockResponseBase & {
      readonly lockData: null
      readonly status: null | true
    })

type GetCommitMethod = BranchDeployOctokit['rest']['repos']['getCommit']
type RestRepositoryCommit = Awaited<
  ReturnType<GetCommitMethod>
>['data']['commit']

export interface RepositoryCommit {
  readonly author?: {
    readonly date?: NonNullable<RestRepositoryCommit['author']>['date'] | null
  } | null
  readonly verification?: {
    readonly reason?: NonNullable<
      RestRepositoryCommit['verification']
    >['reason']
    readonly verified?: NonNullable<
      RestRepositoryCommit['verification']
    >['verified']
    readonly verified_at?: NonNullable<
      RestRepositoryCommit['verification']
    >['verified_at']
  } | null
}

export interface CommitSafetyData {
  readonly commit: RepositoryCommit | null | undefined
  readonly inputs: ActionInputs
  readonly sha: string
}

export interface CommitSafetyResult {
  readonly isVerified: boolean
  readonly message: string
  readonly status: boolean
}

export interface PrecheckData {
  readonly environment: string
  readonly environmentObj: ValidEnvironmentTarget
  readonly inputs: Omit<ActionInputs, 'ignored_checks'> & {
    readonly ignored_checks: readonly string[] | null
  }
  readonly issue_number: number | string
}

export interface PrecheckFailure {
  readonly message: string
  readonly ref?: undefined
  readonly sha?: undefined
  readonly status: false
}

export interface PrecheckSuccess {
  readonly isFork: boolean
  readonly message: string
  readonly noopMode: boolean
  readonly ref: string
  readonly sha: string
  readonly status: true
}

export type PrecheckResult = PrecheckFailure | PrecheckSuccess

export interface CheckRunResult {
  readonly checkSuite?: {
    readonly app: null | {readonly databaseId: number | null}
  }
  readonly completedAt?: string | null
  readonly conclusion: string | null
  readonly databaseId?: number | null
  readonly id?: string
  readonly isRequired: boolean
  readonly name: string
  readonly startedAt?: string
}

export interface LegacyIncompleteCheckRunResult {
  readonly conclusion: string | null
  readonly isRequired: boolean
  readonly name?: undefined
}

export interface StatusContextResult {
  readonly context: string
  readonly createdAt?: string
  readonly id?: string
  readonly isRequired: boolean
  readonly state: string
  readonly updatedAt?: string
}

export type CheckResult = CheckRunResult | StatusContextResult
export type RawCheckResult = CheckResult | LegacyIncompleteCheckRunResult

export interface OperationOutcome {
  readonly decision: OperationDecision
  readonly deploymentId?: number | null
  readonly deploymentType?: OperationDeploymentType | null
  readonly environment?: string | null
  readonly error?: unknown
  readonly operation: Operation
  readonly reasonCode: OperationReasonCode
  readonly ref?: string | null
  readonly runResult: RunResult
  readonly sha?: string | null
}

export interface StatusCheckContexts {
  readonly nodes: readonly RawCheckResult[]
  readonly pageInfo: {
    readonly endCursor: string | null
    readonly hasNextPage: boolean
  }
}

export interface StatusCheckRollup {
  readonly contexts: StatusCheckContexts
  readonly state: string
}

export interface PrechecksGraphqlResult {
  readonly repository: {
    readonly pullRequest: {
      readonly commits?: {
        readonly nodes?: readonly {
          readonly commit: {
            readonly id?: string
            readonly oid: string
            readonly statusCheckRollup?: null | StatusCheckRollup
          }
        }[]
      }
      readonly mergeStateStatus?: string
      readonly reviewDecision?: string | null
      readonly reviews?: {
        readonly totalCount?: number
      }
    }
  }
}

export interface PrechecksGraphqlContextsPageResult {
  readonly node: null | {
    readonly id: string
    readonly oid: string
    readonly statusCheckRollup: null | StatusCheckRollup
  }
}

export type PrechecksGraphqlCommitNode = NonNullable<
  PrechecksGraphqlResult['repository']['pullRequest']['commits']
>['nodes'] extends readonly (infer Node)[] | undefined
  ? Node
  : never

export interface DeploymentGraphqlNode {
  readonly commit: {
    readonly oid: string
  }
  readonly id?: string
  readonly payload?: unknown
  readonly state: string
}

export interface CreatedDeploymentSuccess {
  readonly created_at: string
  readonly id: number
  readonly message?: never
  readonly sha: string
  readonly statuses_url: string
  readonly updated_at: string
  readonly url: string
}

export interface CreatedDeploymentAcceptedMessage {
  readonly created_at?: string
  readonly id?: undefined
  readonly message: string
  readonly statuses_url?: string
  readonly updated_at?: string
  readonly url?: string
}

export type CreatedDeployment =
  | CreatedDeploymentAcceptedMessage
  | CreatedDeploymentSuccess

export interface DeploymentConfirmationData {
  readonly body: string
  readonly commit_html_url: string
  readonly committer: string | null | undefined
  readonly deployment_confirmation_timeout: number
  readonly deploymentType: OperationDeploymentType
  readonly environment: string
  readonly environmentUrl: string | null
  readonly github_run_id: number
  readonly isFork: boolean
  readonly isVerified: boolean
  readonly log_url: string
  readonly noopMode: boolean
  readonly params: string | null
  readonly parsed_params: ParsedParams | null
  readonly ref: string
  readonly sha: string
}

export type DeploymentConfirmationResult =
  | 'confirmed'
  | 'rejected'
  | 'timed_out'

export interface PostDeployLabels {
  readonly failed_deploy: readonly string[]
  readonly failed_noop: readonly string[]
  readonly skip_successful_deploy_labels_if_approved: boolean
  readonly skip_successful_noop_labels_if_approved: boolean
  readonly successful_deploy: readonly string[]
  readonly successful_noop: readonly string[]
}

export interface RawPostDeployData {
  readonly approved_reviews_count: string | null | undefined
  readonly comment_id: string | null | undefined
  readonly commit_verified: boolean | undefined
  readonly deployment_id: string | null | undefined
  readonly deployment_start_time: string | null | undefined
  readonly disable_lock: boolean
  readonly environment: string | null | undefined
  readonly environment_url: string | null
  readonly fork: boolean
  readonly labels: PostDeployLabels
  readonly lock_ref_sha?: string | null | undefined
  readonly noop: boolean | null | undefined
  readonly params: string | null | undefined
  readonly parsed_params: string | null | undefined
  readonly reaction_id: string | null | undefined
  readonly ref: string | null | undefined
  readonly review_decision: string | null | undefined
  readonly sha: string | null | undefined
  readonly status: string | null | undefined
  readonly trusted_sha: string | null | undefined
}

declare const validatedPostDeployData: unique symbol

export interface PostDeployData {
  readonly approved_reviews_count: string
  readonly comment_id: string
  readonly commit_verified: boolean
  readonly deployment_id: string
  readonly deployment_start_time: string
  readonly disable_lock: boolean
  readonly environment: string
  readonly environment_url: string | null
  readonly fork: boolean
  readonly labels: PostDeployLabels
  readonly lock_ref_sha?: string | null | undefined
  readonly noop: boolean
  readonly params: string
  readonly parsed_params: string
  readonly reaction_id: string | null | undefined
  readonly ref: string
  readonly review_decision: string
  readonly sha: string
  readonly status: string
  readonly trusted_sha: string
  readonly [validatedPostDeployData]: true
}

export interface PostDeployMessageData {
  readonly approved_reviews_count: string
  readonly commit_verified: boolean
  readonly deployment_end_time: string
  readonly deployment_id: string
  readonly environment: string
  readonly environment_url: string | null
  readonly fork: boolean
  readonly noop: boolean
  readonly params: string
  readonly parsed_params: string
  readonly ref: string
  readonly review_decision: string
  readonly sha: string
  readonly status: string
  readonly total_seconds: number
}

type GetBranchRulesMethod =
  BranchDeployOctokit['rest']['repos']['getBranchRules']

export type BranchRule = Awaited<
  ReturnType<GetBranchRulesMethod>
>['data'][number]

export type BranchRuleWithParameters = Extract<
  BranchRule,
  {parameters: unknown}
>

export type RuleParameters = Record<string, boolean | number>

export type OperationReasonCode =
  | 'base_branch_update_required'
  | 'commit_safety_failed'
  | 'confirmation_rejected'
  | 'confirmation_timed_out'
  | 'deprecated_command'
  | 'deployment_order_failed'
  | 'deployment_ready'
  | 'deployment_sha_mismatch'
  | 'help_completed'
  | 'invalid_environment'
  | 'lock_acquired'
  | 'lock_already_owned'
  | 'lock_conflict'
  | 'lock_info_completed'
  | 'locking_disabled'
  | 'merge_deploy_not_required'
  | 'merge_deploy_required'
  | 'naked_command_disabled'
  | 'no_trigger'
  | 'noop_ready'
  | 'permission_denied'
  | 'prechecks_failed'
  | 'ref_changed'
  | 'unexpected_error'
  | 'unlock_completed'
  | 'unlock_failed'
  | 'unlock_on_merge_completed'
  | 'unsupported_event'
export type OperationDecision = 'complete' | 'continue' | 'failure' | 'stop'
export type Operation =
  | 'deploy'
  | 'help'
  | 'lock'
  | 'lock_info'
  | 'merge_deploy'
  | 'none'
  | 'noop'
  | 'unlock'
  | 'unlock_on_merge'
export type OperationDeploymentType = 'branch' | 'noop' | 'sha'

export interface OperationResultV1 {
  readonly schema_version: 1
  readonly decision: OperationDecision
  readonly reason_code: OperationReasonCode
  readonly operation: Operation
  readonly deployment_type: OperationDeploymentType | null
  readonly environment: string | null
  readonly ref: string | null
  readonly sha: string | null
  readonly deployment_id: number | null
}

export type RunResult =
  | 'failure'
  | 'safe-exit'
  | 'success - merge deploy mode'
  | 'success - noop'
  | 'success - unlock on merge mode'
  | 'success'
  | undefined

export type PostResult = 'success - noop' | 'success' | undefined
