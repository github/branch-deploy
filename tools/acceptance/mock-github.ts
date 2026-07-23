import {Buffer} from 'node:buffer'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type {
  MockBranch,
  MockCommit,
  MockDeployment,
  MockDeploymentStatus,
  MockFault,
  MockGitHubState,
  MockReaction,
  MockRollupContext,
  MockRouteLog
} from './types.ts'

export const ACCEPTANCE_REPOSITORY = {
  owner: 'github',
  repo: 'branch-deploy'
} as const

export const ACCEPTANCE_SHAS = {
  default: '1111111111111111111111111111111111111111',
  feature: '2222222222222222222222222222222222222222',
  fork: '3333333333333333333333333333333333333333',
  oldDeployment: '4444444444444444444444444444444444444444'
} as const

const owner = ACCEPTANCE_REPOSITORY.owner
const repo = ACCEPTANCE_REPOSITORY.repo
const defaultBranch = 'main'
const defaultSha = ACCEPTANCE_SHAS.default
const featureSha = ACCEPTANCE_SHAS.feature
const forkSha = ACCEPTANCE_SHAS.fork
const oldDeploymentSha = ACCEPTANCE_SHAS.oldDeployment
const treeSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const oldTreeSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const commitDate = '2026-01-01T00:00:00Z'

interface MockServer {
  readonly close: () => Promise<void>
  readonly port: number
  readonly routeLog: readonly MockRouteLog[]
}

interface JsonResponse {
  readonly status: number
  readonly value?: unknown
}

type MockServerCloseAction = 'reject' | 'resolve'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new Error(`expected string field: ${key}`)
  }
  return value
}

function optionalString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new Error(`expected optional string field: ${key}`)
  }
  return value
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string
): readonly string[] {
  const value = record[key]
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(`expected string array field: ${key}`)
  }
  return value
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new Error(`expected boolean field: ${key}`)
  }
  return value
}

function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number') {
    throw new Error(`expected number field: ${key}`)
  }
  return value
}

function part(parts: readonly string[], index: number): string {
  const value = parts[index]
  if (value === undefined) {
    throw new Error(`missing path segment ${index}`)
  }
  return decodeURIComponent(value)
}

function shaFor(id: number): string {
  return id.toString(16).padStart(40, '0')
}

function createBranch(name: string, sha: string): MockBranch {
  return {name, sha, treeSha}
}

function createCommit(
  sha: string,
  verified: boolean,
  commitTreeSha = treeSha
): MockCommit {
  return {
    date: commitDate,
    htmlUrl: `https://github.com/${owner}/${repo}/commit/${sha}`,
    sha,
    treeSha: commitTreeSha,
    verified,
    verifiedAt: verified ? commitDate : null,
    verificationReason: verified ? 'valid' : 'unsigned'
  }
}

export function mockServerPort(address: ReturnType<Server['address']>): number {
  if (address === null || typeof address === 'string') {
    throw new Error('mock server did not bind to a TCP port')
  }
  return address.port
}

export function mockServerCloseAction(
  error: Error | undefined
): MockServerCloseAction {
  return error === undefined ? 'resolve' : 'reject'
}

export function mockErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function mockHeaderValue(
  value: readonly string[] | string | undefined
): string {
  if (typeof value === 'string') {
    return value
  }
  if (value === undefined) {
    return ''
  }
  return value.join(',')
}

export function createMockState(): MockGitHubState {
  const branches = new Map<string, MockBranch>()
  branches.set(defaultBranch, createBranch(defaultBranch, defaultSha))
  branches.set('feature-branch', createBranch('feature-branch', featureSha))
  branches.set('fork-branch', createBranch('fork-branch', forkSha))

  const commits = new Map<string, MockCommit>()
  commits.set(defaultSha, createCommit(defaultSha, true))
  commits.set(featureSha, createCommit(featureSha, true))
  commits.set(forkSha, createCommit(forkSha, false))
  commits.set(
    oldDeploymentSha,
    createCommit(oldDeploymentSha, true, oldTreeSha)
  )

  return {
    blobs: new Map(),
    branchRules: [],
    branches,
    comments: [
      {
        body: '.deploy',
        id: 1000
      }
    ],
    commits,
    commitsToTrees: new Map(),
    comparisonBehindBy: 0,
    confirmationReaction: null,
    deployments: [],
    deploymentResponseSha: null,
    failInitialReaction: false,
    faults: [],
    graphqlCommitOid: null,
    labels: new Set(),
    lockFiles: new Map(),
    mergeStateStatus: 'CLEAN',
    nextCommentId: 2000,
    nextDeploymentId: 3000,
    nextGitId: 4000,
    nextReactionId: 5000,
    nextStatusId: 6000,
    owner,
    permission: 'write',
    pullRequest: {
      baseRef: defaultBranch,
      draft: false,
      headLabel: `${owner}:feature-branch`,
      headRef: 'feature-branch',
      headRepoFork: false,
      headRepoFullName: `${owner}/${repo}`,
      headSha: featureSha,
      merged: true,
      number: 1
    },
    pullRequestMoveAfterReads: 2,
    pullRequestMoveSha: null,
    pullRequestReads: 0,
    refCreationBarrierTarget: 0,
    reactionFailureConsumed: false,
    reactions: [],
    repo,
    repositoryFiles: new Map(),
    repositoryDefaultBranch: defaultBranch,
    reviewDecision: 'APPROVED',
    rollupAvailable: true,
    rollupContexts: [
      {
        conclusion: 'SUCCESS',
        isRequired: true,
        name: 'acceptance',
        type: 'check-run'
      }
    ],
    rollupState: 'SUCCESS',
    stableBranchMoveSha: null,
    trees: new Map()
  }
}

export function queueFault(state: MockGitHubState, fault: MockFault): void {
  state.faults.push(fault)
}

export function mockLockContents(
  state: MockGitHubState,
  branch: string
): string | undefined {
  return state.lockFiles.get(lockFileKey(state, branch))
}

export function setTriggerComment(state: MockGitHubState, body: string): void {
  const existing = state.comments[0]
  const id = existing === undefined ? 1000 : existing.id
  state.comments[0] = {body, id}
}

export function seedLock(
  state: MockGitHubState,
  environment: string,
  branch: string,
  createdBy: string,
  pullRequestNumber: number
): void {
  const branchName = `${environment}-branch-deploy-lock`
  const lock = {
    schema_version: 1,
    reason: 'deployment',
    branch,
    created_at: '2026-01-01T00:00:00.000Z',
    created_by: createdBy,
    sticky: true,
    environment,
    global: false,
    unlock_command: `.unlock ${environment}`,
    link: `https://github.com/${state.owner}/${state.repo}/pull/${pullRequestNumber}#issuecomment-1000`,
    claim_id:
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  }
  const branchShaValue = shaFor(state.nextGitId)
  state.branches.set(branchName, createBranch(branchName, branchShaValue))
  state.nextGitId += 1
  state.commits.set(branchShaValue, createCommit(branchShaValue, true))
  state.comments.push({body: JSON.stringify(lock), id: state.nextCommentId})
  state.nextCommentId += 1
  state.lockFiles.set(lockFileKey(state, branchName), JSON.stringify(lock))
}

function lockFileKey(state: MockGitHubState, branch: string): string {
  return `${state.owner}/${state.repo}/${branch}/lock.json`
}

function branchSha(state: MockGitHubState, ref: string): string {
  const branch = state.branches.get(ref)
  return branch === undefined ? ref : branch.sha
}

function branchResponse(branch: MockBranch): unknown {
  return {
    name: branch.name,
    commit: {
      sha: branch.sha,
      commit: {
        tree: {
          sha: branch.treeSha
        }
      }
    }
  }
}

function commitResponse(commit: MockCommit): unknown {
  return {
    sha: commit.sha,
    html_url: commit.htmlUrl,
    commit: {
      author: {
        date: commit.date
      },
      tree: {
        sha: commit.treeSha
      },
      verification: {
        reason: commit.verificationReason,
        verified: commit.verified,
        verified_at: commit.verifiedAt
      }
    }
  }
}

function pullResponse(state: MockGitHubState): unknown {
  const pr = state.pullRequest
  return {
    number: pr.number,
    draft: pr.draft,
    merged: pr.merged,
    base: {
      ref: pr.baseRef
    },
    head: {
      label: pr.headLabel,
      ref: pr.headRef,
      sha: pr.headSha,
      repo: {
        fork: pr.headRepoFork,
        full_name: pr.headRepoFullName
      }
    }
  }
}

function checkRollup(state: MockGitHubState, start = 0): unknown {
  if (!state.rollupAvailable) {
    return undefined
  }
  if (state.rollupState === null) {
    return null
  }
  return {
    state: state.rollupState,
    contexts: {
      nodes: state.rollupContexts
        .slice(start, start + 100)
        .map(rollupContextResponse),
      pageInfo: {
        endCursor:
          start + 100 < state.rollupContexts.length
            ? String(start + 100)
            : null,
        hasNextPage: start + 100 < state.rollupContexts.length
      }
    }
  }
}

function rollupContextResponse(context: MockRollupContext): unknown {
  if (context.type === 'check-run') {
    return {
      __typename: 'CheckRun',
      id: `CR_${String(context.databaseId ?? 1)}`,
      databaseId: context.databaseId ?? 1,
      startedAt: context.startedAt ?? '2026-01-01T00:00:00Z',
      completedAt: context.completedAt ?? '2026-01-01T00:01:00Z',
      checkSuite: {
        app:
          context.integrationId === null
            ? null
            : {databaseId: context.integrationId ?? 1}
      },
      conclusion: context.conclusion,
      isRequired: context.isRequired,
      name: context.name
    }
  }
  return {
    __typename: 'StatusContext',
    id: `SC_${context.context}_${context.updatedAt ?? 'default'}`,
    createdAt: context.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: context.updatedAt ?? '2026-01-01T00:01:00Z',
    context: context.context,
    isRequired: context.isRequired,
    state: context.state
  }
}

function prechecksGraphql(state: MockGitHubState): unknown {
  return {
    data: {
      repository: {
        pullRequest: {
          reviewDecision: state.reviewDecision,
          mergeStateStatus: state.mergeStateStatus,
          reviews: {
            totalCount: state.reviewDecision === 'APPROVED' ? 1 : 0
          },
          commits: {
            nodes: [
              {
                commit: {
                  id: 'C_acceptance',
                  oid: state.graphqlCommitOid ?? state.pullRequest.headSha,
                  statusCheckRollup: checkRollup(state)
                }
              }
            ]
          }
        }
      }
    }
  }
}

function deploymentGraphql(
  state: MockGitHubState,
  environment: string,
  first: number,
  cursor: string | null
): unknown {
  const deployments = state.deployments.filter(
    deployment => deployment.environment === environment
  )
  const start = cursor === null ? 0 : Number(cursor)
  const nodes = deployments.slice(start, start + first).map(deployment => {
    const latestStatus = deployment.statuses.at(-1)
    return {
      createdAt: deployment.createdAt,
      environment: deployment.environment,
      updatedAt: deployment.updatedAt,
      id: `D_${deployment.id}`,
      payload: JSON.stringify(JSON.stringify(deployment.payload)),
      state: latestStatus?.state === 'success' ? 'ACTIVE' : 'INACTIVE',
      ref: {
        name: deployment.ref
      },
      creator: {
        login: 'github-actions'
      },
      commit: {
        oid: deployment.sha
      }
    }
  })
  return {
    data: {
      repository: {
        id: `R_${state.owner}_${state.repo}`,
        nameWithOwner: `${state.owner}/${state.repo}`,
        deployments: {
          nodes,
          pageInfo: {
            endCursor:
              start + first < deployments.length ? String(start + first) : null,
            hasNextPage: start + first < deployments.length
          }
        }
      }
    }
  }
}

function routeGraphql(
  state: MockGitHubState,
  body: Record<string, unknown>
): JsonResponse {
  const query = requireString(body, 'query')
  const variables = isRecord(body['variables']) ? body['variables'] : {}
  const normalizedQuery = query.replace(/\s+/gu, ' ')
  if (normalizedQuery.includes('updateRefs(input: $input)')) {
    const input = variables['input']
    if (!isRecord(input)) throw new Error('expected ref update input')
    if (
      requireString(input, 'repositoryId') !== `R_${state.owner}_${state.repo}`
    ) {
      throw new Error('unexpected ref update repository ID')
    }
    const refUpdates = input['refUpdates']
    if (!Array.isArray(refUpdates) || !isRecord(refUpdates[0])) {
      throw new Error('expected ref update')
    }
    const update = refUpdates[0]
    const name = requireString(update, 'name')
    const beforeOid = requireString(update, 'beforeOid')
    const afterOid = requireString(update, 'afterOid')
    const branchName = name.replace('refs/heads/', '')
    const branch = state.branches.get(branchName)
    if (branch?.sha !== beforeOid) {
      return {
        status: 200,
        value: {
          data: {updateRefs: null},
          errors: [{message: 'reference no longer points to the expected OID'}]
        }
      }
    }
    if (afterOid !== '0000000000000000000000000000000000000000') {
      throw new Error('expected ref deletion')
    }
    state.branches.delete(branchName)
    state.lockFiles.delete(lockFileKey(state, branchName))
    return {
      status: 200,
      value: {data: {updateRefs: {clientMutationId: null}}}
    }
  }
  if (
    normalizedQuery.includes('pullRequest(number:$number)') &&
    normalizedQuery.includes('statusCheckRollup')
  ) {
    if (
      requireString(variables, 'owner') !== state.owner ||
      requireString(variables, 'name') !== state.repo ||
      requireNumber(variables, 'number') !== state.pullRequest.number
    ) {
      throw new Error('unexpected prechecks GraphQL variables')
    }
    return {status: 200, value: prechecksGraphql(state)}
  }
  if (
    normalizedQuery.includes('node(id:$commitId)') &&
    normalizedQuery.includes('statusCheckRollup')
  ) {
    if (
      requireString(variables, 'commitId') !== 'C_acceptance' ||
      requireNumber(variables, 'number') !== state.pullRequest.number
    ) {
      throw new Error('unexpected paginated prechecks GraphQL variables')
    }
    const cursor = requireString(variables, 'cursor')
    return {
      status: 200,
      value: {
        data: {
          node: {
            id: 'C_acceptance',
            oid: state.graphqlCommitOid ?? state.pullRequest.headSha,
            statusCheckRollup: checkRollup(state, Number(cursor))
          }
        }
      }
    }
  }
  if (
    normalizedQuery.includes('deployments(environments:') &&
    normalizedQuery.includes('orderBy: { field: CREATED_AT')
  ) {
    if (
      requireString(variables, 'repo_owner') !== state.owner ||
      requireString(variables, 'repo_name') !== state.repo
    ) {
      throw new Error('unexpected deployment GraphQL repository variables')
    }
    const environment = requireString(variables, 'environment')
    const first = requireNumber(variables, 'first')
    const cursor = variables['cursor']
    if (cursor !== null && typeof cursor !== 'string') {
      throw new Error('unexpected deployment GraphQL cursor variable')
    }
    return {
      status: 200,
      value: deploymentGraphql(state, environment, first, cursor)
    }
  }
  return unknownRoute('POST', '/graphql')
}

function createReaction(
  state: MockGitHubState,
  commentId: number,
  content: string
): MockReaction {
  const reaction = {
    commentId,
    content,
    id: state.nextReactionId,
    user: 'octocat'
  }
  state.nextReactionId += 1
  state.reactions.push(reaction)
  return reaction
}

function issueCommentReactionResponse(reaction: MockReaction): unknown {
  return {
    id: reaction.id,
    content: reaction.content,
    user: {
      login: reaction.user
    }
  }
}

function createDeployment(
  state: MockGitHubState,
  body: Record<string, unknown>
): MockDeployment {
  const ref = requireString(body, 'ref')
  const environment = requireString(body, 'environment')
  requireBoolean(body, 'auto_merge')
  requireBoolean(body, 'production_environment')
  requireStringArray(body, 'required_contexts')
  if (!isRecord(body['payload'])) {
    throw new Error('expected object field: payload')
  }
  const deployment = {
    createdAt: '2026-01-01T00:20:00Z',
    environment,
    id: state.nextDeploymentId,
    payload: body['payload'],
    ref,
    sha: branchSha(state, ref),
    statuses: [],
    updatedAt: '2026-01-01T00:20:00Z'
  }
  state.nextDeploymentId += 1
  state.deployments.push(deployment)
  return deployment
}

function deploymentResponse(
  state: MockGitHubState,
  deployment: MockDeployment
) {
  return {
    id: deployment.id,
    url: `http://127.0.0.1/repos/${state.owner}/${state.repo}/deployments/${deployment.id}`,
    created_at: deployment.createdAt,
    updated_at: deployment.updatedAt,
    statuses_url: `http://127.0.0.1/repos/${state.owner}/${state.repo}/deployments/${deployment.id}/statuses`,
    sha: state.deploymentResponseSha ?? deployment.sha
  }
}

function createDeploymentStatus(
  state: MockGitHubState,
  deploymentId: number,
  body: Record<string, unknown>
): MockDeploymentStatus {
  const deployment = state.deployments.find(item => item.id === deploymentId)
  if (deployment === undefined) {
    throw new Error(`unknown deployment id: ${deploymentId}`)
  }
  const status = {
    environment: requireString(body, 'environment'),
    environmentUrl: optionalString(body, 'environment_url') ?? null,
    id: state.nextStatusId,
    state: requireString(body, 'state')
  }
  state.nextStatusId += 1
  deployment.statuses.push(status)
  return status
}

function statusResponse(status: MockDeploymentStatus): unknown {
  return {
    id: status.id,
    url: `http://127.0.0.1/deployment-status/${status.id}`
  }
}

function createGitObjectSha(state: MockGitHubState): string {
  const sha = shaFor(state.nextGitId)
  state.nextGitId += 1
  return sha
}

function consumeFault(
  state: MockGitHubState,
  method: string,
  path: string
): JsonResponse | undefined {
  const fault = state.faults.find(
    fault => fault.method === method && fault.path === path
  )
  if (fault === undefined) {
    return undefined
  }
  state.faults.splice(state.faults.indexOf(fault), 1)
  if (fault.seedLock !== undefined) {
    const sha = createGitObjectSha(state)
    state.branches.set(
      fault.seedLock.branch,
      createBranch(fault.seedLock.branch, sha)
    )
    state.commits.set(sha, createCommit(sha, true))
    state.lockFiles.set(
      lockFileKey(state, fault.seedLock.branch),
      fault.seedLock.contents
    )
  }
  return {
    status: fault.response.status,
    value: {message: fault.response.message}
  }
}

function routeRest(
  state: MockGitHubState,
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown>
): JsonResponse {
  const parts = pathname.split('/').filter(value => value !== '')
  if (part(parts, 0) !== 'repos') {
    return unknownRoute(method, pathname)
  }
  const requestOwner = part(parts, 1)
  const requestRepo = part(parts, 2)
  if (requestOwner !== state.owner || requestRepo !== state.repo) {
    return unknownRoute(method, pathname)
  }

  if (method === 'GET' && parts.length === 3) {
    return {
      status: 200,
      value: {
        default_branch: state.repositoryDefaultBranch,
        node_id: `R_${state.owner}_${state.repo}`
      }
    }
  }

  const area = part(parts, 3)

  if (
    area === 'collaborators' &&
    method === 'GET' &&
    parts.length === 6 &&
    part(parts, 5) === 'permission'
  ) {
    return {status: 200, value: {permission: state.permission}}
  }

  if (
    area === 'pulls' &&
    method === 'PUT' &&
    parts.length === 6 &&
    Number(part(parts, 4)) === state.pullRequest.number &&
    part(parts, 5) === 'update-branch'
  ) {
    return {status: 202, value: {}}
  }

  if (
    area === 'pulls' &&
    method === 'GET' &&
    parts.length === 5 &&
    Number(part(parts, 4)) === state.pullRequest.number
  ) {
    state.pullRequestReads += 1
    if (
      state.pullRequestReads === state.pullRequestMoveAfterReads &&
      state.pullRequestMoveSha !== null
    ) {
      state.pullRequest = {
        ...state.pullRequest,
        headSha: state.pullRequestMoveSha
      }
    }
    return {status: 200, value: pullResponse(state)}
  }

  if (area === 'branches' && method === 'GET' && parts.length === 5) {
    const branch = state.branches.get(part(parts, 4))
    if (
      branch !== undefined &&
      branch.name === state.repositoryDefaultBranch &&
      state.stableBranchMoveSha !== null
    ) {
      state.branches.set(
        branch.name,
        createBranch(branch.name, state.stableBranchMoveSha)
      )
      state.stableBranchMoveSha = null
    }
    return branch === undefined
      ? notFound('Branch not found')
      : {status: 200, value: branchResponse(branch)}
  }

  if (
    area === 'rules' &&
    method === 'GET' &&
    parts.length === 6 &&
    part(parts, 4) === 'branches'
  ) {
    return {status: 200, value: state.branchRules}
  }

  if (
    area === 'compare' &&
    method === 'GET' &&
    parts.length === 5 &&
    part(parts, 4).includes('...')
  ) {
    return {status: 200, value: {behind_by: state.comparisonBehindBy}}
  }

  if (area === 'commits' && method === 'GET' && parts.length === 5) {
    const commit = state.commits.get(part(parts, 4))
    return commit === undefined
      ? notFound('Commit not found')
      : {status: 200, value: commitResponse(commit)}
  }

  if (area === 'contents' && method === 'GET' && parts.length >= 5) {
    const ref = searchParams.get('ref') ?? state.repositoryDefaultBranch
    const path = parts.slice(4).map(decodeURIComponent).join('/')
    const key = `${state.owner}/${state.repo}/${ref}/${path}`
    const lockBranch = [...state.branches.values()].find(
      branch => branch.sha === ref
    )
    const lockKey =
      lockBranch === undefined ? key : lockFileKey(state, lockBranch.name)
    const content =
      state.repositoryFiles.get(key) ??
      state.lockFiles.get(key) ??
      state.lockFiles.get(lockKey)
    return content === undefined
      ? notFound('Not Found')
      : {
          status: 200,
          value: {
            content: Buffer.from(content).toString('base64'),
            encoding: 'base64',
            path,
            type: 'file'
          }
        }
  }

  if (area === 'issues') {
    return routeIssues(state, method, parts, body, searchParams)
  }

  if (area === 'git') {
    return routeGit(state, method, parts, body)
  }

  if (area === 'deployments') {
    return routeDeployments(state, method, parts, body, searchParams)
  }

  return unknownRoute(method, pathname)
}

function routeIssues(
  state: MockGitHubState,
  method: string,
  parts: readonly string[],
  body: Record<string, unknown>,
  searchParams: URLSearchParams
): JsonResponse {
  if (
    method === 'POST' &&
    parts.length === 6 &&
    Number(part(parts, 4)) === state.pullRequest.number &&
    part(parts, 5) === 'comments'
  ) {
    const comment = {
      body: requireString(body, 'body'),
      id: state.nextCommentId
    }
    state.nextCommentId += 1
    state.comments.push(comment)
    return {status: 201, value: {id: comment.id, body: comment.body}}
  }

  if (part(parts, 4) === 'comments' && parts.length >= 6) {
    const commentId = Number(part(parts, 5))
    if (method === 'PATCH' && parts.length === 6) {
      const comment = state.comments.find(item => item.id === commentId)
      if (comment === undefined) {
        return notFound('Comment not found')
      }
      const updated = {body: requireString(body, 'body'), id: comment.id}
      state.comments.splice(state.comments.indexOf(comment), 1, updated)
      return {status: 200, value: {id: updated.id, body: updated.body}}
    }
    if (parts.length >= 7 && part(parts, 6) === 'reactions') {
      if (method === 'POST' && parts.length === 7) {
        if (state.failInitialReaction && !state.reactionFailureConsumed) {
          state.reactionFailureConsumed = true
          return {status: 500, value: {message: 'reaction unavailable'}}
        }
        const reaction = createReaction(
          state,
          commentId,
          requireString(body, 'content')
        )
        return {status: 201, value: issueCommentReactionResponse(reaction)}
      }
      if (method === 'GET' && parts.length === 7) {
        const existing = state.reactions.filter(
          reaction => reaction.commentId === commentId
        )
        if (state.confirmationReaction !== null && existing.length === 0) {
          const reaction = createReaction(
            state,
            commentId,
            state.confirmationReaction
          )
          return {
            status: 200,
            value: [issueCommentReactionResponse(reaction)]
          }
        }
        return {
          status: 200,
          value: existing
            .slice(
              (Number(searchParams.get('page') ?? '1') - 1) *
                Number(searchParams.get('per_page') ?? '100'),
              Number(searchParams.get('page') ?? '1') *
                Number(searchParams.get('per_page') ?? '100')
            )
            .map(issueCommentReactionResponse)
        }
      }
      if (method === 'DELETE' && parts.length === 8) {
        const reactionId = Number(part(parts, 7))
        const index = state.reactions.findIndex(
          reaction => reaction.id === reactionId
        )
        if (index >= 0) {
          state.reactions.splice(index, 1)
        }
        return {status: 204}
      }
    }
  }

  if (
    Number(part(parts, 4)) === state.pullRequest.number &&
    part(parts, 5) === 'labels'
  ) {
    if (method === 'GET' && parts.length === 6) {
      const page = Number(searchParams.get('page') ?? '1')
      const perPage = Number(searchParams.get('per_page') ?? '30')
      return {
        status: 200,
        value: [...state.labels]
          .slice((page - 1) * perPage, page * perPage)
          .map(name => ({name}))
      }
    }
    if (method === 'POST' && parts.length === 6) {
      for (const label of requireStringArray(body, 'labels')) {
        state.labels.add(label)
      }
      return {
        status: 200,
        value: [...state.labels].map(name => ({name}))
      }
    }
    if (method === 'DELETE' && parts.length === 7) {
      state.labels.delete(part(parts, 6))
      return {status: 200, value: {}}
    }
  }

  return unknownRoute(method, `/${parts.join('/')}`)
}

function routeGit(
  state: MockGitHubState,
  method: string,
  parts: readonly string[],
  body: Record<string, unknown>
): JsonResponse {
  const resource = part(parts, 4)
  if (method === 'POST' && resource === 'blobs' && parts.length === 5) {
    if (requireString(body, 'encoding') !== 'utf-8') {
      throw new Error('expected lock blob encoding: utf-8')
    }
    const sha = createGitObjectSha(state)
    state.blobs.set(sha, requireString(body, 'content'))
    return {status: 201, value: {sha}}
  }
  if (method === 'POST' && resource === 'trees' && parts.length === 5) {
    requireString(body, 'base_tree')
    const treeItems = body['tree']
    if (!Array.isArray(treeItems) || !isRecord(treeItems[0])) {
      throw new Error('expected tree item')
    }
    if (
      treeItems[0]['path'] !== 'lock.json' ||
      treeItems[0]['mode'] !== '100644' ||
      treeItems[0]['type'] !== 'blob'
    ) {
      throw new Error('unexpected lock tree item')
    }
    const sha = requireString(treeItems[0], 'sha')
    const treeShaValue = createGitObjectSha(state)
    state.trees.set(treeShaValue, sha)
    return {status: 201, value: {sha: treeShaValue}}
  }
  if (method === 'POST' && resource === 'commits' && parts.length === 5) {
    const commitSha = createGitObjectSha(state)
    requireString(body, 'message')
    const treeShaValue = requireString(body, 'tree')
    requireStringArray(body, 'parents')
    state.commitsToTrees.set(commitSha, treeShaValue)
    state.commits.set(commitSha, createCommit(commitSha, true))
    return {status: 201, value: {sha: commitSha}}
  }
  if (method === 'POST' && resource === 'refs' && parts.length === 5) {
    const ref = requireString(body, 'ref').replace('refs/heads/', '')
    const sha = requireString(body, 'sha')
    if (state.branches.has(ref)) {
      return {status: 422, value: {message: 'Reference already exists'}}
    }
    state.branches.set(ref, createBranch(ref, sha))
    const treeShaValue = state.commitsToTrees.get(sha)
    const blobSha =
      treeShaValue === undefined ? undefined : state.trees.get(treeShaValue)
    const content = blobSha === undefined ? undefined : state.blobs.get(blobSha)
    if (content !== undefined) {
      state.lockFiles.set(lockFileKey(state, ref), content)
    }
    return {status: 201, value: {ref: `refs/heads/${ref}`, object: {sha}}}
  }
  if (
    method === 'DELETE' &&
    resource === 'refs' &&
    parts.length === 6 &&
    part(parts, 5).startsWith('heads/')
  ) {
    const ref = parts
      .slice(5)
      .map(decodeURIComponent)
      .join('/')
      .replace('heads/', '')
    if (!state.branches.has(ref)) {
      return {status: 422, value: {message: 'Reference does not exist'}}
    }
    state.branches.delete(ref)
    state.lockFiles.delete(lockFileKey(state, ref))
    return {status: 204}
  }
  return unknownRoute(method, `/${parts.join('/')}`)
}

function routeDeployments(
  state: MockGitHubState,
  method: string,
  parts: readonly string[],
  body: Record<string, unknown>,
  searchParams: URLSearchParams
): JsonResponse {
  if (method === 'GET' && parts.length === 4) {
    const environment = searchParams.get('environment')
    const deployments = state.deployments.filter(
      deployment =>
        environment === null || deployment.environment === environment
    )
    return {
      status: 200,
      value: deployments.map(deployment => ({
        id: deployment.id,
        sha: deployment.sha,
        payload: deployment.payload,
        created_at: deployment.createdAt
      }))
    }
  }
  if (method === 'POST' && parts.length === 4) {
    const deployment = createDeployment(state, body)
    return {status: 201, value: deploymentResponse(state, deployment)}
  }
  if (
    method === 'POST' &&
    parts.length === 6 &&
    part(parts, 5) === 'statuses'
  ) {
    const deploymentId = Number(part(parts, 4))
    const status = createDeploymentStatus(state, deploymentId, body)
    return {status: 201, value: statusResponse(status)}
  }
  return unknownRoute(method, `/${parts.join('/')}`)
}

function notFound(message: string): JsonResponse {
  return {status: 404, value: {message}}
}

function unknownRoute(method: string, path: string): JsonResponse {
  return {
    status: 500,
    value: {message: `Unhandled mock GitHub route: ${method} ${path}`}
  }
}

function parseJson(source: string): Record<string, unknown> {
  if (source === '') {
    return {}
  }
  const parsed: unknown = JSON.parse(source)
  if (!isRecord(parsed)) {
    throw new Error('expected JSON object request body')
  }
  return parsed
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.from(chunk))
    })
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    request.on('error', reject)
  })
}

function writeResponse(response: ServerResponse, result: JsonResponse): void {
  response.statusCode = result.status
  if (result.value === undefined) {
    response.end()
    return
  }
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(result.value))
}

export async function startMockGitHub(
  state: MockGitHubState
): Promise<MockServer> {
  const routeLog: MockRouteLog[] = []
  let refCreationArrivals = 0
  const refCreationReleases: Array<() => void> = []
  const refCreationBarrier = new Promise<void>(resolve => {
    refCreationReleases.push(resolve)
  })
  const server = createServer((request, response) => {
    void handleRequest(
      state,
      routeLog,
      request,
      response,
      async (method, path) => {
        if (
          state.refCreationBarrierTarget === 0 ||
          method !== 'POST' ||
          !path.endsWith('/git/refs')
        ) {
          return
        }
        refCreationArrivals += 1
        if (refCreationArrivals >= state.refCreationBarrierTarget) {
          refCreationReleases.forEach(release => release())
        }
        await refCreationBarrier
      }
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve)
    server.on('error', reject)
  })
  const address = server.address()
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close(error => {
          const actions = {
            reject,
            resolve: (): void => resolve()
          } satisfies Record<
            MockServerCloseAction,
            (closeError: Error | undefined) => void
          >
          actions[mockServerCloseAction(error)](error)
        })
      }),
    port: mockServerPort(address),
    routeLog
  }
}

async function handleRequest(
  state: MockGitHubState,
  routeLog: MockRouteLog[],
  request: IncomingMessage,
  response: ServerResponse,
  waitForRefCreation: (method: string, path: string) => Promise<void>
): Promise<void> {
  const method = String(request.method)
  const url = new URL(String(request.url), 'http://127.0.0.1')
  try {
    const rawBody = await readBody(request)
    routeLog.push({
      accept: mockHeaderValue(request.headers['accept']),
      apiVersion: mockHeaderValue(request.headers['x-github-api-version']),
      authorizationPresent: request.headers['authorization'] !== undefined,
      body: rawBody,
      method,
      path: url.pathname,
      query: url.search,
      userAgent: mockHeaderValue(request.headers['user-agent'])
    })
    const body = parseJson(rawBody)
    await waitForRefCreation(method, url.pathname)
    const fault = consumeFault(state, method, url.pathname)
    const result =
      fault ??
      (url.pathname === '/graphql'
        ? routeGraphql(state, body)
        : routeRest(state, method, url.pathname, url.searchParams, body))
    writeResponse(response, result)
  } catch (error) {
    writeResponse(response, {
      status: 500,
      value: {
        message: mockErrorMessage(error)
      }
    })
  }
}
