export interface AcceptanceOutputs {
  readonly [key: string]: string
}

export interface AcceptanceRunResult {
  readonly code: number | null
  readonly output: AcceptanceOutputs
  readonly state: AcceptanceOutputs
  readonly stderr: string
  readonly stdout: string
}

export interface MockBranch {
  readonly name: string
  readonly sha: string
  readonly treeSha: string
}

export interface MockCommit {
  readonly date: string
  readonly htmlUrl: string
  readonly sha: string
  readonly treeSha: string
  readonly verified: boolean
  readonly verifiedAt: string | null
  readonly verificationReason: string
}

export interface MockComment {
  readonly body: string
  readonly id: number
}

export interface MockDeploymentStatus {
  readonly environment: string
  readonly environmentUrl: string | null
  readonly id: number
  readonly state: string
}

export interface MockDeployment {
  readonly createdAt: string
  readonly environment: string
  readonly id: number
  readonly payload: unknown
  readonly ref: string
  readonly sha: string
  readonly statuses: MockDeploymentStatus[]
  readonly updatedAt: string
}

export interface MockPullRequest {
  readonly baseRef: string
  readonly draft: boolean
  readonly headLabel: string
  readonly headRef: string
  readonly headRepoFork: boolean
  readonly headRepoFullName: string
  readonly headSha: string
  readonly merged: boolean
  readonly number: number
}

export interface MockReaction {
  readonly commentId: number
  readonly content: string
  readonly id: number
  readonly user: string
}

export interface MockRouteLog {
  readonly accept: string
  readonly apiVersion: string
  readonly authorizationPresent: boolean
  readonly body: string
  readonly method: string
  readonly path: string
  readonly query: string
  readonly userAgent: string
}

export interface MockFault {
  readonly method: string
  readonly path: string
  readonly response: {
    readonly message: string
    readonly status: number
  }
  readonly seedLock?: {
    readonly branch: string
    readonly contents: string
  }
}

export type MockRollupContext =
  | {
      readonly conclusion: string
      readonly isRequired: boolean
      readonly name: string
      readonly type: 'check-run'
    }
  | {
      readonly context: string
      readonly isRequired: boolean
      readonly state: string
      readonly type: 'status-context'
    }

export interface MockGitHubState {
  blobs: Map<string, string>
  branchRules: readonly unknown[]
  branches: Map<string, MockBranch>
  comments: MockComment[]
  commits: Map<string, MockCommit>
  commitsToTrees: Map<string, string>
  comparisonBehindBy: number
  confirmationReaction: '+1' | '-1' | null
  deployments: MockDeployment[]
  failInitialReaction: boolean
  faults: MockFault[]
  graphqlCommitOid: string | null
  labels: Set<string>
  lockFiles: Map<string, string>
  mergeStateStatus: string
  nextCommentId: number
  nextDeploymentId: number
  nextGitId: number
  nextReactionId: number
  nextStatusId: number
  owner: string
  permission: string
  pullRequest: MockPullRequest
  reactionFailureConsumed: boolean
  reactions: MockReaction[]
  repo: string
  repositoryDefaultBranch: string
  reviewDecision: string | null
  rollupAvailable: boolean
  rollupContexts: readonly MockRollupContext[]
  rollupState: string | null
  trees: Map<string, string>
}

export interface ScenarioContext {
  readonly port: number
  readonly routeLog: readonly MockRouteLog[]
  readonly state: MockGitHubState
}
