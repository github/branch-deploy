import assert from 'node:assert/strict'
import {
  ACCEPTANCE_REPOSITORY,
  ACCEPTANCE_SHAS,
  createMockState,
  mockErrorMessage,
  mockHeaderValue,
  mockLockContents,
  mockPrStackResponse,
  mockServerCloseAction,
  mockServerPort,
  queueFault,
  seedLock,
  setTriggerComment,
  startMockGitHub
} from './mock-github.ts'
import {runAcceptanceProcess, runAction} from './runner.ts'
import type {
  AcceptanceRunResult,
  MockClassicRequiredCheck,
  MockDeployment,
  MockDeploymentStatus,
  MockGitHubState,
  MockPullRequestStack,
  MockRollupContext,
  MockRouteLog,
  MockStackMember,
  ScenarioContext
} from './types.ts'

interface Scenario {
  readonly name: string
  readonly run: () => Promise<void>
}

interface HttpResult {
  readonly body: string
  readonly status: number
}

const GREEN = '\u001b[32m'
const RED = '\u001b[31m'
const RESET = '\u001b[0m'

function progressDot(passed: boolean): string {
  return `${passed ? GREEN : RED}.${RESET}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecordValue(
  value: unknown,
  message: string
): Record<string, unknown> {
  assert.ok(isRecord(value), message)
  return value
}

function requireRoute(
  context: ScenarioContext,
  method: string,
  path: string,
  occurrence = 0
): MockRouteLog {
  const route = context.routeLog.filter(
    item => item.method === method && item.path === path
  )[occurrence]
  assert.ok(route !== undefined, diagnostics(context))
  return route
}

function routeBody(
  context: ScenarioContext,
  method: string,
  path: string,
  occurrence = 0
): Record<string, unknown> {
  const route = requireRoute(context, method, path, occurrence)
  return requireRecordValue(JSON.parse(route.body), diagnostics(context))
}

function routeVariables(
  context: ScenarioContext,
  method: string,
  path: string,
  occurrence = 0
): Record<string, unknown> {
  return requireRecordValue(
    routeBody(context, method, path, occurrence)['variables'],
    diagnostics(context)
  )
}

function requireMockLock(
  context: ScenarioContext,
  branch: string
): Record<string, unknown> {
  const contents = mockLockContents(context.state, branch)
  assert.ok(contents !== undefined, diagnostics(context))
  return requireRecordValue(JSON.parse(contents), diagnostics(context))
}

function lockBranch(environment: string): string {
  return `${environment}-branch-deploy-lock`
}

function assertNoLockRoutes(context: ScenarioContext): void {
  assert.deepEqual(
    context.routeLog.filter(
      route =>
        route.path.includes('/git/') ||
        route.path.includes('/contents/lock.json')
    ),
    [],
    diagnostics(context)
  )
}

function apiPath(path: string): string {
  return `/repos/${ACCEPTANCE_REPOSITORY.owner}/${ACCEPTANCE_REPOSITORY.repo}${path}`
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

function routeLogForDiagnostics(routeLog: readonly MockRouteLog[]): unknown {
  return routeLog.map(route => ({
    accept: route.accept,
    apiVersion: route.apiVersion,
    authorizationPresent: route.authorizationPresent,
    method: route.method,
    path: route.path,
    query: route.query,
    userAgent: route.userAgent,
    body: route.body === '' ? '' : route.body.slice(0, 500)
  }))
}

function stateForDiagnostics(state: MockGitHubState): unknown {
  return {
    branches: [...state.branches.keys()].sort(),
    comments: state.comments.map(comment => ({
      id: comment.id,
      body: comment.body.slice(0, 500)
    })),
    deployments: state.deployments.map(deployment => ({
      id: deployment.id,
      environment: deployment.environment,
      ref: deployment.ref,
      sha: deployment.sha,
      statuses: deployment.statuses.map(status => status.state)
    })),
    labels: [...state.labels].sort(),
    lockFiles: [...state.lockFiles.keys()].sort(),
    pullRequest: state.pullRequest,
    reactions: state.reactions.map(reaction => ({
      commentId: reaction.commentId,
      content: reaction.content,
      id: reaction.id
    })),
    reviewDecision: state.reviewDecision,
    rollupState: state.rollupState
  }
}

function diagnostics(
  context: ScenarioContext,
  result: AcceptanceRunResult | null = null
): string {
  return JSON.stringify(
    {
      stdout: result?.stdout,
      stderr: result?.stderr,
      outputs: result?.output,
      state: result?.state,
      routes: routeLogForDiagnostics(context.routeLog),
      mockState: stateForDiagnostics(context.state)
    },
    null,
    2
  )
}

function requireOutput(
  context: ScenarioContext,
  result: AcceptanceRunResult,
  key: string
): string {
  const value = result.output[key]
  assert.ok(value !== undefined, diagnostics(context, result))
  return value
}

function assertExit(
  context: ScenarioContext,
  result: AcceptanceRunResult,
  code: number
): void {
  assert.equal(result.code, code, diagnostics(context, result))
}

function assertReason(
  context: ScenarioContext,
  result: AcceptanceRunResult,
  reasonCode: string
): void {
  assert.equal(
    requireOutput(context, result, 'reason_code'),
    reasonCode,
    diagnostics(context, result)
  )
}

function assertDecision(
  context: ScenarioContext,
  result: AcceptanceRunResult,
  decision: string
): void {
  assert.equal(
    requireOutput(context, result, 'decision'),
    decision,
    diagnostics(context, result)
  )
}

function assertOutput(
  context: ScenarioContext,
  result: AcceptanceRunResult,
  key: string,
  expected: string
): void {
  assert.equal(
    requireOutput(context, result, key),
    expected,
    diagnostics(context, result)
  )
}

function assertResultField(
  context: ScenarioContext,
  result: AcceptanceRunResult,
  key: string,
  expected: unknown
): void {
  const parsed: unknown = JSON.parse(requireOutput(context, result, 'result'))
  assert.ok(isRecord(parsed), diagnostics(context, result))
  assert.deepEqual(parsed[key], expected, diagnostics(context, result))
}

function assertCommentIncludes(
  context: ScenarioContext,
  fragment: string
): void {
  const matched = context.state.comments.some(comment =>
    comment.body.includes(fragment)
  )
  assert.equal(matched, true, diagnostics(context))
}

function assertReaction(context: ScenarioContext, content: string): void {
  const matched = context.state.reactions.some(
    reaction => reaction.content === content
  )
  assert.equal(matched, true, diagnostics(context))
}

function assertNoDeployment(
  context: ScenarioContext,
  result: AcceptanceRunResult
): void {
  assert.equal(
    context.state.deployments.length,
    0,
    diagnostics(context, result)
  )
}

function requireDeployment(
  context: ScenarioContext,
  index = 0
): MockDeployment {
  const deployment = context.state.deployments[index]
  assert.ok(deployment !== undefined, diagnostics(context))
  return deployment
}

function requireDeploymentStatus(
  context: ScenarioContext,
  deployment: MockDeployment,
  index: number
): MockDeploymentStatus {
  const status = deployment.statuses[index]
  assert.ok(status !== undefined, diagnostics(context))
  return status
}

function setForkPullRequest(state: MockGitHubState): void {
  state.pullRequest = {
    ...state.pullRequest,
    headLabel: 'fork-owner:fork-branch',
    headRef: 'fork-branch',
    headRepoFork: true,
    headRepoFullName: `fork-owner/${ACCEPTANCE_REPOSITORY.repo}`,
    headSha: ACCEPTANCE_SHAS.fork
  }
}

function addBranch(
  state: MockGitHubState,
  name: string,
  sha: string = ACCEPTANCE_SHAS.default
): void {
  state.branches.set(name, {
    name,
    sha,
    treeSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  })
}

function seedPrStack(
  state: MockGitHubState,
  selectedNumber = 3
): MockPullRequestStack {
  const commit = state.commits.get(ACCEPTANCE_SHAS.feature)
  assert.ok(commit !== undefined)
  const members: MockStackMember[] = []
  let baseRef = 'main'
  let baseSha: string = ACCEPTANCE_SHAS.default
  for (const [number, headRef, headSha, treeSha] of [
    [1, 'stack-bottom', ACCEPTANCE_SHAS.stackBottom, 'c'.repeat(40)],
    [2, 'stack-middle', ACCEPTANCE_SHAS.stackMiddle, 'd'.repeat(40)],
    [3, 'stack-top', ACCEPTANCE_SHAS.stackTop, 'e'.repeat(40)]
  ] as const) {
    const pullRequest = {
      baseRef,
      draft: false,
      headLabel: `${state.owner}:${headRef}`,
      headRef,
      headRepoFork: false,
      headRepoFullName: `${state.owner}/${state.repo}`,
      headSha,
      merged: false,
      number
    }
    members.push({
      baseSha,
      graphqlCommitOid: null,
      mergeStateStatus: 'CLEAN',
      pullRequest,
      reviewDecision: 'APPROVED',
      rollupAvailable: true,
      rollupContexts: state.rollupContexts,
      rollupState: 'SUCCESS',
      state: 'OPEN'
    })
    state.branches.set(headRef, {name: headRef, sha: headSha, treeSha})
    state.commits.set(headSha, {
      ...commit,
      htmlUrl: `https://github.com/${state.owner}/${state.repo}/commit/${headSha}`,
      sha: headSha,
      treeSha
    })
    baseRef = headRef
    baseSha = headSha
  }
  const selected = members.find(
    member => member.pullRequest.number === selectedNumber
  )
  assert.ok(selected !== undefined)
  state.pullRequest = selected.pullRequest
  state.prStack = {baseRef: 'main', members}
  return state.prStack
}

function requireStackMember(
  state: MockGitHubState,
  number: number
): MockStackMember {
  assert.ok(state.prStack !== null)
  const member = state.prStack.members.find(
    item => item.pullRequest.number === number
  )
  assert.ok(member !== undefined)
  return member
}

function setClassicRequiredChecks(
  state: MockGitHubState,
  checks: readonly MockClassicRequiredCheck[],
  contexts: readonly string[] = checks.map(check => check.context)
): void {
  const branch = state.branches.get('main')
  assert.ok(branch !== undefined)
  state.branches.set('main', {
    ...branch,
    protection: {
      enabled: true,
      required_status_checks: {
        enforcement_level: 'non_admins',
        contexts,
        checks
      }
    }
  })
}

function setStackRollupContexts(
  state: MockGitHubState,
  contexts: readonly MockRollupContext[]
): void {
  assert.ok(state.prStack !== null)
  state.rollupContexts = contexts
  for (const member of state.prStack.members) {
    member.rollupContexts = contexts
  }
}

function stackQueryRoutes(context: ScenarioContext): readonly MockRouteLog[] {
  return context.routeLog.filter(
    route =>
      route.path === '/graphql' &&
      route.body.includes('BranchDeployPullRequestStack')
  )
}

function prechecksQueryNumbers(context: ScenarioContext): readonly number[] {
  return context.routeLog
    .filter(
      route =>
        route.path === '/graphql' &&
        route.body.includes('pullRequest(number:$number)') &&
        route.body.includes('statusCheckRollup')
    )
    .map(route => {
      const body = requireRecordValue(
        JSON.parse(route.body),
        diagnostics(context)
      )
      const variables = requireRecordValue(
        body['variables'],
        diagnostics(context)
      )
      const number = variables['number']
      assert.equal(typeof number, 'number')
      return Number(number)
    })
}

function seedDeployment(
  state: MockGitHubState,
  sha: string,
  environment = 'production'
): void {
  const status = {
    environment,
    environmentUrl: null,
    id: state.nextStatusId,
    state: 'success'
  }
  state.nextStatusId += 1
  state.deployments.push({
    createdAt: '2026-01-01T00:15:00Z',
    environment,
    id: state.nextDeploymentId,
    payload: {type: 'branch-deploy'},
    ref: 'main',
    sha,
    statuses: [status],
    updatedAt: '2026-01-01T00:16:00Z'
  })
  state.nextDeploymentId += 1
}

function seedUnrelatedDeployment(
  state: MockGitHubState,
  sha: string,
  environment: string
): void {
  const status = {
    environment,
    environmentUrl: null,
    id: state.nextStatusId,
    state: 'success' as const
  }
  state.nextStatusId += 1
  state.deployments.unshift({
    createdAt: '2026-01-01T00:16:30Z',
    environment,
    id: state.nextDeploymentId,
    payload: null,
    ref: 'main',
    sha,
    statuses: [status],
    updatedAt: '2026-01-01T00:17:00Z'
  })
  state.nextDeploymentId += 1
}

async function withMockGitHub(
  name: string,
  run: (context: ScenarioContext) => Promise<void>
): Promise<void> {
  const state = createMockState()
  const server = await startMockGitHub(state)
  const context = {
    port: server.port,
    routeLog: server.routeLog,
    state
  }
  try {
    await run(context)
  } catch (error) {
    throw new Error(`${name} failed\n${String(error)}\n${diagnostics(context)}`)
  } finally {
    await server.close()
  }
}

function runMain(
  context: ScenarioContext,
  inputs: Readonly<Record<string, string>> = {},
  actor = 'octocat',
  commentId?: number
): Promise<AcceptanceRunResult> {
  return runAction({
    actor,
    ...(commentId === undefined ? {} : {commentId}),
    inputs,
    mode: 'main',
    port: context.port,
    previousState: {},
    state: context.state,
    status: 'success'
  })
}

function runPost(
  context: ScenarioContext,
  mainResult: AcceptanceRunResult,
  inputs: Readonly<Record<string, string>> = {},
  status: 'cancelled' | 'failure' | 'success' = 'success',
  actor = 'octocat',
  environment: Readonly<Record<string, string>> = {}
): Promise<AcceptanceRunResult> {
  return runAction({
    actor,
    environment,
    inputs,
    mode: 'post',
    port: context.port,
    previousState: mainResult.state,
    state: context.state,
    status
  })
}

function getMockRoute(port: number, path: string): Promise<HttpResult> {
  return requestMockRoute(port, path)
}

function requestMockRoute(
  port: number,
  path: string,
  method = 'GET',
  body: Record<string, unknown> | string | undefined = undefined
): Promise<HttpResult> {
  const init: RequestInit = {method}
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    init.headers = {'content-type': 'application/json'}
  }
  return fetch(`http://127.0.0.1:${port}${path}`, init).then(
    async response => ({
      body: await response.text(),
      status: response.status
    })
  )
}

const scenarios = [
  {
    name: '.help',
    run: () =>
      withMockGitHub('.help', async context => {
        setTriggerComment(context.state, '.help')

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertDecision(context, result, 'complete')
        assertReason(context, result, 'help_completed')
        assertOutput(context, result, 'triggered', 'true')
        assertOutput(context, result, 'comment_body', '.help')
        assertOutput(context, result, 'issue_number', '1')
        assertOutput(context, result, 'actor', 'octocat')
        assertOutput(context, result, 'comment_id', '1000')
        assertOutput(context, result, 'initial_reaction_id', '5000')
        assertOutput(context, result, 'actor_handle', 'octocat')
        assertOutput(context, result, 'type', 'help')
        assertCommentIncludes(context, '## 📚 Branch Deployment Help')
        assertReaction(context, '+1')

        const routeCount = context.routeLog.length
        const postResult = await runPost(context, result)
        assertExit(context, postResult, 0)
        assert.equal(
          context.routeLog.length,
          routeCount,
          diagnostics(context, postResult)
        )
        assert.equal(
          postResult.stdout.includes('bypass'),
          true,
          diagnostics(context, postResult)
        )
      })
  },
  {
    name: 'safe-exit commands',
    run: async () => {
      for (const [name, command, inputs, reason, fragment] of [
        ['no trigger', 'looks good', {}, 'no_trigger', null],
        [
          'deprecated noop',
          '.deploy noop',
          {},
          'deprecated_command',
          'Deprecated Input Detected'
        ],
        [
          'naked deploy disabled',
          '.deploy',
          {disable_naked_commands: 'true'},
          'naked_command_disabled',
          'Missing Explicit Environment'
        ],
        [
          'invalid environment',
          '.deploy to qa',
          {},
          'invalid_environment',
          'No matching environment target found'
        ]
      ] as const) {
        await withMockGitHub(name, async context => {
          setTriggerComment(context.state, command)

          const result = await runMain(context, inputs)

          assertExit(context, result, 0)
          assertDecision(context, result, 'stop')
          assertReason(context, result, reason)
          assertNoDeployment(context, result)
          assert.equal(context.state.lockFiles.size, 0)
          if (fragment === null) {
            assertOutput(context, result, 'triggered', 'false')
            assert.equal(context.routeLog.length, 0)
          } else {
            assertCommentIncludes(context, fragment)
            assertReaction(context, '-1')
          }
        })
      }

      await withMockGitHub('explicit deploy permitted', async context => {
        setTriggerComment(context.state, '.deploy to production')
        const result = await runMain(context, {disable_naked_commands: 'true'})
        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
      })
    }
  },
  {
    name: '.noop',
    run: () =>
      withMockGitHub('.noop', async context => {
        setTriggerComment(context.state, '.noop')
        context.state.reviewDecision = 'REVIEW_REQUIRED'

        const inputs = {
          failed_noop_labels: 'noop-failed',
          successful_noop_labels: 'noop-success'
        }
        const mainResult = await runMain(context, inputs)

        assertExit(context, mainResult, 0)
        assertDecision(context, mainResult, 'continue')
        assertReason(context, mainResult, 'noop_ready')
        assertOutput(context, mainResult, 'continue', 'true')
        assertOutput(context, mainResult, 'noop', 'true')
        assertOutput(context, mainResult, 'base_ref', 'main')
        assertOutput(
          context,
          mainResult,
          'default_branch_tree_sha',
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        )
        assertOutput(context, mainResult, 'approved_reviews_count', '0')
        assertOutput(context, mainResult, 'commit_verified', 'true')
        assertOutput(context, mainResult, 'initial_comment_id', '2000')
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, mainResult)
        )
        assertCommentIncludes(context, '### Deployment Triggered 🚀')

        const postResult = await runPost(context, mainResult, inputs)

        assertExit(context, postResult, 0)
        assert.match(
          requireOutput(context, postResult, 'total_seconds'),
          /^\d+$/u
        )
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, postResult)
        )
        assert.equal(context.state.labels.has('noop-success'), true)
        assertReaction(context, 'rocket')
      })
  },
  {
    name: 'noop cleanup with global lock',
    run: () =>
      withMockGitHub('noop cleanup with global lock', async context => {
        setTriggerComment(
          context.state,
          '.lock --global --reason release freeze'
        )
        const globalLockResult = await runMain(context)
        assertExit(context, globalLockResult, 0)
        assertReason(context, globalLockResult, 'lock_acquired')
        const originalGlobalLock = mockLockContents(
          context.state,
          'global-branch-deploy-lock'
        )
        assert.ok(originalGlobalLock !== undefined, diagnostics(context))

        setTriggerComment(context.state, '.noop')
        const mainResult = await runMain(context)
        assertExit(context, mainResult, 0)
        assertReason(context, mainResult, 'noop_ready')
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, mainResult)
        )

        const postResult = await runPost(context, mainResult)
        assertExit(context, postResult, 0)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, postResult)
        )
        assert.equal(
          mockLockContents(context.state, 'global-branch-deploy-lock'),
          originalGlobalLock,
          diagnostics(context, postResult)
        )
      })
  },
  {
    name: 'sticky noop lifecycle',
    run: () =>
      withMockGitHub('sticky noop lifecycle', async context => {
        setTriggerComment(context.state, '.noop')
        const inputs = {sticky_locks_for_noop: 'true'}

        const mainResult = await runMain(context, inputs)
        assertExit(context, mainResult, 0)
        assertReason(context, mainResult, 'noop_ready')
        assert.equal(
          requireMockLock(context, lockBranch('production'))['sticky'],
          true
        )

        const postResult = await runPost(context, mainResult, inputs)
        assertExit(context, postResult, 0)
        assert.equal(context.state.deployments.length, 0)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, postResult)
        )
      })
  },
  {
    name: 'disabled decorative reactions',
    run: async () => {
      for (const [command, reason] of [
        ['.help', 'help_completed'],
        ['.deploy', 'deployment_ready']
      ] as const) {
        await withMockGitHub(`reaction disabled ${command}`, async context => {
          setTriggerComment(context.state, command)
          const inputs = {reaction: ''}

          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)
          assertReason(context, mainResult, reason)
          assertOutput(context, mainResult, 'initial_reaction_id', '')
          assert.equal(mainResult.state['reaction_id'], '')

          const postResult = await runPost(context, mainResult, inputs)
          assertExit(context, postResult, 0)
          assert.deepEqual(context.state.reactions, [])
          assert.equal(
            context.routeLog.some(route => route.path.includes('/reactions')),
            false,
            diagnostics(context, postResult)
          )
        })
      }
    }
  },
  {
    name: 'disabled lock commands',
    run: () =>
      withMockGitHub('disabled lock commands', async context => {
        seedLock(context.state, 'production', 'other-branch', 'OtherUser', 99)
        const originalLock = mockLockContents(
          context.state,
          lockBranch('production')
        )

        for (const [command, operation] of [
          ['.lock production', 'lock'],
          ['.unlock production', 'unlock'],
          ['.wcid', 'lock_info']
        ] as const) {
          setTriggerComment(context.state, command)
          const result = await runMain(context, {disable_lock: 'true'})

          assertExit(context, result, 0)
          assertDecision(context, result, 'complete')
          assertReason(context, result, 'locking_disabled')
          assertResultField(context, result, 'operation', operation)
          assert.equal(
            mockLockContents(context.state, lockBranch('production')),
            originalLock,
            diagnostics(context, result)
          )
        }

        assertCommentIncludes(
          context,
          'Deployment locking is disabled for this Action'
        )
        assertNoLockRoutes(context)
      })
  },
  {
    name: 'disabled lock noop lifecycle',
    run: () =>
      withMockGitHub('disabled lock noop lifecycle', async context => {
        seedLock(context.state, 'production', 'other-branch', 'OtherUser', 99)
        const originalLock = mockLockContents(
          context.state,
          lockBranch('production')
        )
        setTriggerComment(context.state, '.noop')
        const inputs = {
          disable_lock: 'true',
          successful_noop_labels: 'noop-success'
        }

        const mainResult = await runMain(context, inputs)
        assertExit(context, mainResult, 0)
        assertReason(context, mainResult, 'noop_ready')
        assert.equal(mainResult.state['disable_lock'], 'true')
        assert.equal(
          mockLockContents(context.state, lockBranch('production')),
          originalLock,
          diagnostics(context, mainResult)
        )

        const postResult = await runPost(context, mainResult, inputs)
        assertExit(context, postResult, 0)
        assert.equal(context.state.labels.has('noop-success'), true)
        assert.equal(
          mockLockContents(context.state, lockBranch('production')),
          originalLock,
          diagnostics(context, postResult)
        )
        assertNoLockRoutes(context)
      })
  },
  {
    name: 'disabled lock deploy lifecycle',
    run: () =>
      withMockGitHub('disabled lock deploy lifecycle', async context => {
        seedLock(context.state, 'production', 'other-branch', 'OtherUser', 99)
        const originalLock = mockLockContents(
          context.state,
          lockBranch('production')
        )
        setTriggerComment(context.state, '.deploy')
        const inputs = {
          disable_lock: 'true',
          successful_deploy_labels: 'deploy-success'
        }

        const mainResult = await runMain(context, inputs)
        assertExit(context, mainResult, 0)
        assertReason(context, mainResult, 'deployment_ready')
        assert.equal(mainResult.state['disable_lock'], 'true')
        assert.equal(
          mockLockContents(context.state, lockBranch('production')),
          originalLock,
          diagnostics(context, mainResult)
        )
        const deployment = requireDeployment(context)
        assert.equal(
          requireDeploymentStatus(context, deployment, 0).state,
          'in_progress'
        )

        const postResult = await runPost(context, mainResult, inputs)
        assertExit(context, postResult, 0)
        assert.equal(
          requireDeploymentStatus(context, deployment, 1).state,
          'success'
        )
        assert.equal(context.state.labels.has('deploy-success'), true)
        assert.equal(
          mockLockContents(context.state, lockBranch('production')),
          originalLock,
          diagnostics(context, postResult)
        )
        assertNoLockRoutes(context)
      })
  },
  {
    name: '.deploy',
    run: () =>
      withMockGitHub('.deploy', async context => {
        setTriggerComment(context.state, '.deploy')

        const inputs = {
          failed_deploy_labels: 'deploy-failed',
          sticky_locks: 'true',
          successful_deploy_labels: 'deploy-success'
        }
        const mainResult = await runMain(context, inputs)

        assertExit(context, mainResult, 0)
        assertDecision(context, mainResult, 'continue')
        assertReason(context, mainResult, 'deployment_ready')
        assertOutput(context, mainResult, 'continue', 'true')
        assertOutput(context, mainResult, 'noop', 'false')
        assertOutput(context, mainResult, 'deployment_id', '3000')
        const deployment = requireDeployment(context)
        assert.equal(deployment.environment, 'production')
        assert.equal(deployment.ref, 'feature-branch')
        assert.equal(deployment.sha, ACCEPTANCE_SHAS.feature)
        assert.equal(
          requireDeploymentStatus(context, deployment, 0).state,
          'in_progress'
        )
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, mainResult)
        )
        const graphqlRoute = requireRoute(context, 'POST', '/graphql')
        assert.equal(graphqlRoute.authorizationPresent, true)
        assert.equal(
          graphqlRoute.accept,
          'application/vnd.github.merge-info-preview+json'
        )
        assert.equal(
          graphqlRoute.userAgent.includes('github/branch-deploy@'),
          true
        )
        const deploymentBody = routeBody(
          context,
          'POST',
          apiPath('/deployments')
        )
        const deploymentRoute = requireRoute(
          context,
          'POST',
          apiPath('/deployments')
        )
        assert.equal(deploymentRoute.apiVersion, '2022-11-28')
        assert.equal(deploymentBody['ref'], 'feature-branch')
        assert.equal(deploymentBody['environment'], 'production')
        assert.equal(deploymentBody['auto_merge'], true)
        assert.equal(deploymentBody['production_environment'], true)
        assert.deepEqual(deploymentBody['required_contexts'], [])
        const payload = requireRecordValue(
          deploymentBody['payload'],
          diagnostics(context, mainResult)
        )
        assert.equal(payload['type'], 'branch-deploy')
        assert.equal(payload['sha'], ACCEPTANCE_SHAS.feature)
        const statusBody = routeBody(
          context,
          'POST',
          apiPath(`/deployments/${String(deployment.id)}/statuses`)
        )
        assert.equal(statusBody['state'], 'in_progress')
        assert.equal(statusBody['environment'], 'production')

        const postResult = await runPost(context, mainResult, inputs)

        assertExit(context, postResult, 0)
        assert.equal(
          requireDeploymentStatus(context, deployment, 1).state,
          'success'
        )
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, postResult)
        )
        assert.equal(context.state.labels.has('deploy-success'), true)
      })
  },
  {
    name: 'failed deploy post lifecycle',
    run: () =>
      withMockGitHub('failed deploy post lifecycle', async context => {
        setTriggerComment(context.state, '.deploy')
        const inputs = {
          failed_deploy_labels: 'deploy-failed',
          sticky_locks: 'true',
          successful_deploy_labels: 'deploy-success'
        }
        const mainResult = await runMain(context, inputs)
        assertExit(context, mainResult, 0)

        const deployment = requireDeployment(context)
        const postResult = await runPost(context, mainResult, inputs, 'failure')

        assertExit(context, postResult, 0)
        assert.equal(
          requireDeploymentStatus(context, deployment, 1).state,
          'failure'
        )
        assert.equal(context.state.labels.has('deploy-failed'), true)
        assert.equal(context.state.labels.has('deploy-success'), false)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, postResult)
        )
        assertCommentIncludes(context, '"status": "failure"')
        assertReaction(context, '-1')
      })
  },
  {
    name: 'failed noop post lifecycle',
    run: () =>
      withMockGitHub('failed noop post lifecycle', async context => {
        setTriggerComment(context.state, '.noop')
        const inputs = {
          failed_noop_labels: 'noop-failed',
          successful_noop_labels: 'noop-success'
        }
        const mainResult = await runMain(context, inputs)
        assertExit(context, mainResult, 0)

        const postResult = await runPost(context, mainResult, inputs, 'failure')

        assertExit(context, postResult, 0)
        assert.equal(context.state.labels.has('noop-failed'), true)
        assert.equal(context.state.labels.has('noop-success'), false)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, postResult)
        )
        assertCommentIncludes(context, '"status": "failure"')
        assertReaction(context, '-1')
      })
  },
  {
    name: 'cancelled deploy post lifecycle',
    run: () =>
      withMockGitHub('cancelled deploy post lifecycle', async context => {
        setTriggerComment(context.state, '.deploy')
        const inputs = {
          failed_deploy_labels: 'deploy-cancelled',
          successful_deploy_labels: 'deploy-success'
        }
        const mainResult = await runMain(context, inputs)
        assertExit(context, mainResult, 0)

        const deployment = requireDeployment(context)
        const postResult = await runPost(
          context,
          mainResult,
          inputs,
          'cancelled'
        )

        assertExit(context, postResult, 0)
        assert.equal(
          requireDeploymentStatus(context, deployment, 1).state,
          'failure'
        )
        assert.equal(context.state.labels.has('deploy-cancelled'), true)
        assert.equal(context.state.labels.has('deploy-success'), false)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, postResult)
        )
        assertCommentIncludes(context, '"status": "cancelled"')
        assertReaction(context, '-1')
      })
  },
  {
    name: 'cancelled noop post lifecycle',
    run: () =>
      withMockGitHub('cancelled noop post lifecycle', async context => {
        setTriggerComment(context.state, '.noop')
        const inputs = {
          failed_noop_labels: 'noop-cancelled',
          successful_noop_labels: 'noop-success'
        }
        const mainResult = await runMain(context, inputs)
        assertExit(context, mainResult, 0)

        const postResult = await runPost(
          context,
          mainResult,
          inputs,
          'cancelled'
        )

        assertExit(context, postResult, 0)
        assert.equal(context.state.deployments.length, 0)
        assert.equal(context.state.labels.has('noop-cancelled'), true)
        assert.equal(context.state.labels.has('noop-success'), false)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, postResult)
        )
        assertCommentIncludes(context, '"status": "cancelled"')
        assertReaction(context, '-1')
      })
  },
  {
    name: 'post skip completing',
    run: () =>
      withMockGitHub('post skip completing', async context => {
        setTriggerComment(context.state, '.deploy')
        const inputs = {skip_completing: 'true'}
        const mainResult = await runMain(context, inputs)
        assertExit(context, mainResult, 0)
        const deployment = requireDeployment(context)
        const routeCount = context.routeLog.length

        const postResult = await runPost(context, mainResult, inputs)

        assertExit(context, postResult, 0)
        assert.equal(context.routeLog.length, routeCount)
        assert.equal(deployment.statuses.length, 1)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, postResult)
        )
        assert.equal(
          postResult.stdout.includes('skip_completing'),
          true,
          diagnostics(context, postResult)
        )
      })
  },
  {
    name: 'deployment label cleanup paginates stale labels',
    run: () =>
      withMockGitHub(
        'deployment label cleanup paginates stale labels',
        async context => {
          for (let index = 0; index < 100; index += 1) {
            context.state.labels.add(`unrelated-${String(index)}`)
          }
          context.state.labels.add('deploy-failed')
          setTriggerComment(context.state, '.deploy')
          const inputs = {
            failed_deploy_labels: 'deploy-failed',
            successful_deploy_labels: 'deploy-success'
          }

          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)
          const postResult = await runPost(context, mainResult, inputs)

          assertExit(context, postResult, 0)
          assert.equal(context.state.labels.has('deploy-failed'), false)
          assert.equal(context.state.labels.has('deploy-success'), true)
          assert.equal(context.state.labels.size, 101)
          const labelRoutes = context.routeLog.filter(
            route =>
              route.method === 'GET' &&
              route.path === apiPath('/issues/1/labels')
          )
          assert.equal(labelRoutes.length, 2, diagnostics(context, postResult))
          assert.deepEqual(
            labelRoutes.map(route =>
              new URLSearchParams(route.query).get('page')
            ),
            ['1', '2']
          )
          assert.deepEqual(
            labelRoutes.map(route =>
              new URLSearchParams(route.query).get('per_page')
            ),
            ['100', '100']
          )
        }
      )
  },
  {
    name: 'post missing state fails',
    run: () =>
      withMockGitHub('post missing state fails', async context => {
        setTriggerComment(context.state, '.deploy')
        const mainResult = await runMain(context)
        assertExit(context, mainResult, 0)
        const routeCount = context.routeLog.length
        const incompleteMainResult = {
          ...mainResult,
          state: {...mainResult.state, deployment_id: ''}
        }

        const postResult = await runPost(context, incompleteMainResult)

        assertExit(context, postResult, 1)
        assert.equal(context.routeLog.length, routeCount)
        assert.equal(
          postResult.stdout.includes('no deployment_id provided'),
          true,
          diagnostics(context, postResult)
        )
        assert.equal(requireDeployment(context).statuses.length, 1)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, postResult)
        )
      })
  },
  {
    name: 'post API failure does not complete',
    run: () =>
      withMockGitHub('post API failure does not complete', async context => {
        setTriggerComment(context.state, '.deploy')
        const mainResult = await runMain(context)
        assertExit(context, mainResult, 0)
        const deployment = requireDeployment(context)
        queueFault(context.state, {
          method: 'POST',
          path: apiPath(`/deployments/${String(deployment.id)}/statuses`),
          response: {message: 'status rejected', status: 422}
        })

        const postResult = await runPost(context, mainResult)

        assertExit(context, postResult, 1)
        assert.equal(context.state.faults.length, 0)
        assert.equal(deployment.statuses.length, 1)
        assert.equal(context.state.labels.size, 0)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, postResult)
        )
        assert.equal(
          postResult.stdout.includes('status rejected'),
          true,
          diagnostics(context, postResult)
        )
      })
  },
  {
    name: 'failed deployment startup preserves a replacement lock',
    run: () =>
      withMockGitHub(
        'failed deployment startup preserves a replacement lock',
        async context => {
          setTriggerComment(context.state, '.deploy')
          const branch = lockBranch('production')
          const replacement = {
            schema_version: 1,
            reason: 'deployment',
            branch: 'other-branch',
            created_at: '2026-01-01T01:00:00.000Z',
            created_by: 'OtherUser',
            sticky: false,
            environment: 'production',
            global: false,
            unlock_command: '.unlock production',
            link: `https://github.com/${ACCEPTANCE_REPOSITORY.owner}/${ACCEPTANCE_REPOSITORY.repo}/pull/2#issuecomment-2001`,
            claim_id: `sha256:${'b'.repeat(64)}`
          }
          queueFault(context.state, {
            method: 'POST',
            path: apiPath('/issues/1/comments'),
            response: {message: 'comment rejected', status: 403},
            seedLock: {branch, contents: JSON.stringify(replacement)}
          })

          const result = await runMain(context)

          assertExit(context, result, 1)
          assertReason(context, result, 'unexpected_error')
          assert.equal(
            context.state.branches.has(branch),
            true,
            diagnostics(context, result)
          )
          assert.deepEqual(requireMockLock(context, branch), replacement)
          assert.equal(
            result.stdout.includes(
              'reference no longer points to the expected OID'
            ),
            true,
            diagnostics(context, result)
          )
          assert.equal(
            context.routeLog.filter(route => route.method === 'DELETE').length,
            0,
            diagnostics(context, result)
          )
        }
      )
  },
  {
    name: 'post completion preserves a replacement deployment lock',
    run: () =>
      withMockGitHub(
        'post completion preserves a replacement deployment lock',
        async context => {
          setTriggerComment(context.state, '.deploy')
          const mainResult = await runMain(context)
          assertExit(context, mainResult, 0)
          const branch = lockBranch('production')
          const originalSha = mainResult.state['lock_ref_sha']
          assert.equal(
            originalSha,
            context.state.branches.get(branch)?.sha,
            diagnostics(context, mainResult)
          )
          const replacement = {
            ...requireMockLock(context, branch),
            claim_id: `sha256:${'b'.repeat(64)}`,
            created_at: '2026-01-01T01:00:00.000Z',
            created_by: 'OtherUser'
          }
          addBranch(context.state, branch, ACCEPTANCE_SHAS.fork)
          context.state.lockFiles.set(
            `${context.state.owner}/${context.state.repo}/${branch}/lock.json`,
            JSON.stringify(replacement)
          )

          const postResult = await runPost(context, mainResult)

          assertExit(context, postResult, 0)
          assert.equal(
            requireDeploymentStatus(context, requireDeployment(context), 1)
              .state,
            'success'
          )
          assert.equal(
            context.state.branches.get(branch)?.sha,
            ACCEPTANCE_SHAS.fork,
            diagnostics(context, postResult)
          )
          assert.deepEqual(requireMockLock(context, branch), replacement)
          assert.equal(
            postResult.stdout.includes(
              'reference no longer points to the expected OID'
            ),
            true,
            diagnostics(context, postResult)
          )
        }
      )
  },
  {
    name: 'post completion preserves a same-claim replacement lock',
    run: () =>
      withMockGitHub(
        'post completion preserves a same-claim replacement lock',
        async context => {
          setTriggerComment(context.state, '.noop')
          const mainResult = await runMain(context)
          assertExit(context, mainResult, 0)
          const branch = lockBranch('production')
          const replacement = {
            ...requireMockLock(context, branch),
            created_at: '2026-01-01T01:00:00.000Z'
          }
          addBranch(context.state, branch, ACCEPTANCE_SHAS.fork)
          context.state.lockFiles.set(
            `${context.state.owner}/${context.state.repo}/${branch}/lock.json`,
            JSON.stringify(replacement)
          )

          const postResult = await runPost(context, mainResult)

          assertExit(context, postResult, 0)
          assertNoDeployment(context, postResult)
          assert.equal(
            context.state.branches.get(branch)?.sha,
            ACCEPTANCE_SHAS.fork,
            diagnostics(context, postResult)
          )
          assert.deepEqual(requireMockLock(context, branch), replacement)
          assert.equal(
            postResult.stdout.includes(
              'reference no longer points to the expected OID'
            ),
            true,
            diagnostics(context, postResult)
          )
        }
      )
  },
  {
    name: 'post comment failure completes deployment cleanup',
    run: () =>
      withMockGitHub(
        'post comment failure completes deployment cleanup',
        async context => {
          setTriggerComment(context.state, '.deploy')
          const inputs = {successful_deploy_labels: 'deployed'}
          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)
          const deployment = requireDeployment(context)
          queueFault(context.state, {
            method: 'POST',
            path: apiPath('/issues/1/comments'),
            response: {message: 'comment rejected', status: 403}
          })

          const postResult = await runPost(context, mainResult, inputs)

          assertExit(context, postResult, 1)
          assert.equal(context.state.faults.length, 0)
          assert.equal(
            requireDeploymentStatus(context, deployment, 1).state,
            'success'
          )
          assert.equal(context.state.labels.has('deployed'), true)
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, postResult)
          )
          assert.equal(
            postResult.stdout.includes('comment rejected'),
            true,
            diagnostics(context, postResult)
          )
        }
      )
  },
  {
    name: 'post comment failure completes noop cleanup',
    run: () =>
      withMockGitHub(
        'post comment failure completes noop cleanup',
        async context => {
          setTriggerComment(context.state, '.noop')
          const inputs = {successful_noop_labels: 'noop-complete'}
          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)
          queueFault(context.state, {
            method: 'POST',
            path: apiPath('/issues/1/comments'),
            response: {message: 'comment rejected', status: 403}
          })

          const postResult = await runPost(context, mainResult, inputs)

          assertExit(context, postResult, 1)
          assertNoDeployment(context, postResult)
          assert.equal(context.state.labels.has('noop-complete'), true)
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, postResult)
          )
          assert.equal(
            postResult.stdout.includes('comment rejected'),
            true,
            diagnostics(context, postResult)
          )
        }
      )
  },
  {
    name: 'post label failure occurs after deployment cleanup',
    run: () =>
      withMockGitHub(
        'post label failure occurs after deployment cleanup',
        async context => {
          setTriggerComment(context.state, '.deploy')
          const inputs = {successful_deploy_labels: 'deployed'}
          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)
          const deployment = requireDeployment(context)
          queueFault(context.state, {
            method: 'POST',
            path: apiPath('/issues/1/labels'),
            response: {message: 'label rejected', status: 403}
          })

          const postResult = await runPost(context, mainResult, inputs)

          assertExit(context, postResult, 1)
          assert.equal(context.state.faults.length, 0)
          assert.equal(
            requireDeploymentStatus(context, deployment, 1).state,
            'success'
          )
          assert.equal(context.state.labels.has('deployed'), false)
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, postResult)
          )
          assert.equal(
            postResult.stdout.includes('label rejected'),
            true,
            diagnostics(context, postResult)
          )
        }
      )
  },
  {
    name: 'explicit lock lifecycle',
    run: () =>
      withMockGitHub('explicit lock lifecycle', async context => {
        const command = '.lock production --reason maintenance window'
        setTriggerComment(context.state, command)

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertDecision(context, result, 'complete')
        assertReason(context, result, 'lock_acquired')
        assertOutput(context, result, 'type', 'lock')
        const branch = lockBranch('production')
        const lock = requireMockLock(context, branch)
        assert.equal(lock['schema_version'], 1)
        assert.match(String(lock['claim_id']), /^sha256:[a-f0-9]{64}$/u)
        assert.equal(lock['created_by'], 'octocat')
        assert.equal(lock['branch'], 'feature-branch')
        assert.equal(lock['environment'], 'production')
        assert.equal(lock['global'], false)
        assert.equal(lock['sticky'], true)
        assert.equal(lock['reason'], 'maintenance window')
        assert.equal(lock['unlock_command'], '.unlock production')
        const blobBody = routeBody(context, 'POST', apiPath('/git/blobs'))
        assert.equal(blobBody['encoding'], 'utf-8')
        assert.deepEqual(JSON.parse(String(blobBody['content'])), lock)

        const rerun = await runMain(context)
        assertExit(context, rerun, 0)
        assertReason(context, rerun, 'lock_already_owned')

        context.state.comments[0] = {body: command, id: 1001}
        const conflict = await runMain(context, {}, 'OtherUser')
        assertExit(context, conflict, 1)
        assertDecision(context, conflict, 'stop')
        assertReason(context, conflict, 'lock_conflict')
        assertCommentIncludes(context, 'currently claimed by __octocat__')
      })
  },
  {
    name: 'global lock contract',
    run: () =>
      withMockGitHub('global lock contract', async context => {
        setTriggerComment(
          context.state,
          '.lock --global --reason release freeze'
        )

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertReason(context, result, 'lock_acquired')
        assertOutput(context, result, 'global_lock_claimed', 'true')
        const lock = requireMockLock(context, 'global-branch-deploy-lock')
        assert.equal(lock['environment'], null)
        assert.equal(lock['global'], true)
        assert.equal(lock['sticky'], true)
        assert.equal(lock['reason'], 'release freeze')
        assert.equal(lock['unlock_command'], '.unlock --global')
        assertCommentIncludes(context, 'This is a **global** deploy lock')

        setTriggerComment(context.state, '.unlock --global')
        const unlockResult = await runMain(context)
        assertExit(context, unlockResult, 0)
        assertReason(context, unlockResult, 'unlock_completed')
        assertOutput(context, unlockResult, 'global_lock_released', 'true')
        assert.equal(
          context.state.branches.has('global-branch-deploy-lock'),
          false,
          diagnostics(context, unlockResult)
        )
      })
  },
  {
    name: 'atomic lock collision',
    run: () =>
      withMockGitHub('atomic lock collision', async context => {
        setTriggerComment(context.state, '.lock production')
        const branch = lockBranch('production')
        const winningLock = JSON.stringify({
          schema_version: 1,
          reason: 'other deployment',
          branch: 'other-branch',
          created_at: '2026-01-01T00:00:00.000Z',
          created_by: 'OtherUser',
          sticky: true,
          environment: 'production',
          global: false,
          unlock_command: '.unlock production',
          link: `https://github.com/${ACCEPTANCE_REPOSITORY.owner}/${ACCEPTANCE_REPOSITORY.repo}/pull/2#issuecomment-2001`,
          claim_id:
            'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        })
        queueFault(context.state, {
          method: 'POST',
          path: apiPath('/git/refs'),
          response: {message: 'Reference already exists', status: 422},
          seedLock: {branch, contents: winningLock}
        })

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertDecision(context, result, 'stop')
        assertReason(context, result, 'lock_conflict')
        assert.deepEqual(
          requireMockLock(context, branch),
          JSON.parse(winningLock)
        )
        assertCommentIncludes(context, 'currently claimed by __OtherUser__')
        assert.equal(context.state.faults.length, 0)
      })
  },
  {
    name: 'concurrent lock acquisition',
    run: () =>
      withMockGitHub('concurrent lock acquisition', async context => {
        setTriggerComment(context.state, '.lock production')
        context.state.comments.push({body: '.lock production', id: 1001})
        context.state.refCreationBarrierTarget = 2

        const [firstResult, secondResult] = await Promise.all([
          runMain(context, {}, 'octocat', 1000),
          runMain(context, {}, 'OtherUser', 1001)
        ])
        assert.deepEqual(
          new Set([
            [
              String(firstResult.code),
              requireOutput(context, firstResult, 'reason_code')
            ].join(':'),
            [
              String(secondResult.code),
              requireOutput(context, secondResult, 'reason_code')
            ].join(':')
          ]),
          new Set(['0:lock_acquired', '1:lock_conflict']),
          diagnostics(context, secondResult)
        )
        const lock = requireMockLock(context, lockBranch('production'))
        assert.equal(
          ['octocat', 'OtherUser'].includes(String(lock['created_by'])),
          true,
          diagnostics(context, firstResult)
        )
        assert.equal(
          context.routeLog.filter(
            route =>
              route.method === 'POST' && route.path === apiPath('/git/refs')
          ).length,
          2,
          diagnostics(context, secondResult)
        )
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, firstResult)
        )
      })
  },
  {
    name: 'ambiguous lock fails closed',
    run: () =>
      withMockGitHub('ambiguous lock fails closed', async context => {
        setTriggerComment(context.state, '.lock production')
        addBranch(context.state, lockBranch('production'))

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertDecision(context, result, 'stop')
        assertReason(context, result, 'lock_conflict')
        assertCommentIncludes(
          context,
          'does not contain a readable `lock.json`'
        )
        assert.equal(
          mockLockContents(context.state, lockBranch('production')),
          undefined
        )
      })
  },
  {
    name: 'legacy lock compatibility',
    run: () =>
      withMockGitHub('legacy lock compatibility', async context => {
        const branch = lockBranch('production')
        seedLock(context.state, 'production', 'feature-branch', 'octocat', 1)
        const legacyLock = requireMockLock(context, branch)
        delete legacyLock['schema_version']
        delete legacyLock['claim_id']
        context.state.lockFiles.set(
          `${context.state.owner}/${context.state.repo}/${branch}/lock.json`,
          JSON.stringify(legacyLock)
        )
        setTriggerComment(context.state, '.wcid')

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertDecision(context, result, 'complete')
        assertReason(context, result, 'lock_info_completed')
        assertCommentIncludes(context, '- __Created By__: `octocat`')
      })
  },
  {
    name: '.wcid',
    run: () =>
      withMockGitHub('.wcid', async context => {
        seedLock(context.state, 'production', 'feature-branch', 'octocat', 1)
        setTriggerComment(context.state, '.wcid')

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertReason(context, result, 'lock_info_completed')
        assertCommentIncludes(context, '### Lock Details 🔒')
        assertCommentIncludes(context, '- __Branch__: `feature-branch`')
      })
  },
  {
    name: '.unlock',
    run: () =>
      withMockGitHub('.unlock', async context => {
        seedLock(context.state, 'production', 'feature-branch', 'octocat', 1)
        setTriggerComment(context.state, '.unlock production')

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertReason(context, result, 'unlock_completed')
        assertOutput(context, result, 'type', 'unlock')
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, result)
        )
        assertCommentIncludes(context, '### 🔓 Deployment Lock Removed')
      })
  },
  {
    name: '.deploy main',
    run: () =>
      withMockGitHub('.deploy main', async context => {
        setTriggerComment(context.state, '.deploy main')
        context.state.reviewDecision = 'REVIEW_REQUIRED'
        context.state.rollupState = 'FAILURE'

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'ref', 'main')
        assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.default)
        const deployment = requireDeployment(context)
        assert.equal(deployment.ref, 'main')
        assert.equal(deployment.sha, ACCEPTANCE_SHAS.default)
      })
  },
  {
    name: 'merge deploy required',
    run: () =>
      withMockGitHub('merge deploy required', async context => {
        seedDeployment(context.state, ACCEPTANCE_SHAS.oldDeployment)

        const result = await runMain(context, {merge_deploy_mode: 'true'})

        assertExit(context, result, 0)
        assertDecision(context, result, 'continue')
        assertReason(context, result, 'merge_deploy_required')
        assertOutput(context, result, 'continue', 'true')
        assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.default)
      })
  },
  {
    name: 'merge deploy retries a failed latest deployment',
    run: () =>
      withMockGitHub(
        'merge deploy retries a failed latest deployment',
        async context => {
          seedDeployment(context.state, ACCEPTANCE_SHAS.default)
          requireDeployment(context).statuses.push({
            environment: 'production',
            environmentUrl: null,
            id: context.state.nextStatusId,
            state: 'failure'
          })
          context.state.nextStatusId += 1

          const result = await runMain(context, {merge_deploy_mode: 'true'})

          assertExit(context, result, 0)
          assertDecision(context, result, 'continue')
          assertReason(context, result, 'merge_deploy_required')
          assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.default)
        }
      )
  },
  {
    name: 'merge deploy already deployed',
    run: () =>
      withMockGitHub('merge deploy already deployed', async context => {
        seedDeployment(context.state, ACCEPTANCE_SHAS.default)

        const result = await runMain(context, {merge_deploy_mode: 'true'})

        assertExit(context, result, 0)
        assertDecision(context, result, 'stop')
        assertReason(context, result, 'merge_deploy_not_required')
        assertOutput(context, result, 'continue', 'false')
      })
  },
  {
    name: 'merge deploy finds active history on page two',
    run: () =>
      withMockGitHub(
        'merge deploy finds active history on page two',
        async context => {
          seedDeployment(context.state, ACCEPTANCE_SHAS.default)
          const activeDeployment = requireDeployment(context)
          for (let index = 0; index < 100; index += 1) {
            context.state.deployments.unshift({
              ...activeDeployment,
              id: context.state.nextDeploymentId,
              payload: {type: 'other-deploy'}
            })
            context.state.nextDeploymentId += 1
          }

          const result = await runMain(context, {merge_deploy_mode: 'true'})

          assertExit(context, result, 0)
          assertDecision(context, result, 'stop')
          assertReason(context, result, 'merge_deploy_not_required')
          assert.equal(
            context.routeLog.filter(route => route.path === '/graphql').length,
            2,
            diagnostics(context, result)
          )
          assert.equal(
            routeVariables(context, 'POST', '/graphql', 0)['cursor'],
            null
          )
          assert.equal(
            routeVariables(context, 'POST', '/graphql', 1)['cursor'],
            '100'
          )
        }
      )
  },
  {
    name: 'merge deploy retries malformed latest history',
    run: () =>
      withMockGitHub(
        'merge deploy retries malformed latest history',
        async context => {
          seedDeployment(context.state, ACCEPTANCE_SHAS.default)
          const validDeployment = requireDeployment(context)
          context.state.deployments.unshift({
            ...validDeployment,
            id: context.state.nextDeploymentId,
            payload: '{'
          })
          context.state.nextDeploymentId += 1

          const result = await runMain(context, {merge_deploy_mode: 'true'})

          assertExit(context, result, 0)
          assertDecision(context, result, 'continue')
          assertReason(context, result, 'merge_deploy_required')
        }
      )
  },
  {
    name: 'unlock on merge',
    run: () =>
      withMockGitHub('unlock on merge', async context => {
        seedLock(context.state, 'production', 'feature-branch', 'octocat', 1)
        seedLock(context.state, 'staging', 'other-branch', 'octocat', 99)
        const unrelatedLock = mockLockContents(
          context.state,
          lockBranch('staging')
        )

        const result = await runMain(context, {
          environment_targets: ' production , staging ',
          unlock_on_merge_mode: 'true'
        })

        assertExit(context, result, 0)
        assertReason(context, result, 'unlock_on_merge_completed')
        assertOutput(context, result, 'unlocked_environments', 'production')
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, result)
        )
        assert.equal(
          context.state.branches.has(lockBranch('staging')),
          true,
          diagnostics(context, result)
        )
        assert.equal(
          mockLockContents(context.state, lockBranch('staging')),
          unrelatedLock,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'closed unmerged pull request retains locks',
    run: () =>
      withMockGitHub(
        'closed unmerged pull request retains locks',
        async context => {
          seedLock(context.state, 'production', 'feature-branch', 'octocat', 1)
          const originalLock = mockLockContents(
            context.state,
            lockBranch('production')
          )
          context.state.pullRequest = {
            ...context.state.pullRequest,
            merged: false
          }

          const result = await runMain(context, {
            unlock_on_merge_mode: 'true'
          })

          assertExit(context, result, 0)
          assertReason(context, result, 'unlock_on_merge_completed')
          assert.equal(
            mockLockContents(context.state, lockBranch('production')),
            originalLock,
            diagnostics(context, result)
          )
          assert.equal(
            result.stdout.includes('closed but not merged'),
            true,
            diagnostics(context, result)
          )
          assertNoLockRoutes(context)
        }
      )
  },
  {
    name: 'confirmation confirmed',
    run: () =>
      withMockGitHub('confirmation confirmed', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.confirmationReaction = '+1'

        const result = await runMain(context, {
          deployment_confirmation: 'true',
          deployment_confirmation_timeout: '1'
        })

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertCommentIncludes(context, 'Deployment confirmed by __octocat__')
        assert.equal(context.state.deployments.length, 1)
      })
  },
  {
    name: 'confirmation finds actor reaction on page two',
    run: () =>
      withMockGitHub(
        'confirmation finds actor reaction on page two',
        async context => {
          setTriggerComment(context.state, '.deploy')
          const confirmationCommentId = context.state.nextCommentId
          for (let index = 0; index < 100; index += 1) {
            context.state.reactions.push({
              commentId: confirmationCommentId,
              content: '+1',
              id: context.state.nextReactionId,
              user: `other-user-${String(index)}`
            })
            context.state.nextReactionId += 1
          }
          context.state.reactions.push({
            commentId: confirmationCommentId,
            content: '+1',
            id: context.state.nextReactionId,
            user: 'octocat'
          })
          context.state.nextReactionId += 1

          const result = await runMain(context, {
            deployment_confirmation: 'true',
            deployment_confirmation_timeout: '1'
          })

          assertExit(context, result, 0)
          assertReason(context, result, 'deployment_ready')
          assertCommentIncludes(context, 'Deployment confirmed by __octocat__')
          const reactionPath = apiPath(
            `/issues/comments/${String(confirmationCommentId)}/reactions`
          )
          assert.equal(
            requireRoute(context, 'GET', reactionPath, 0).query,
            '?per_page=100&page=1'
          )
          assert.equal(
            requireRoute(context, 'GET', reactionPath, 1).query,
            '?per_page=100&page=2'
          )
          assert.equal(context.state.deployments.length, 1)
        }
      )
  },
  {
    name: 'confirmation rejected',
    run: () =>
      withMockGitHub('confirmation rejected', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.confirmationReaction = '-1'

        const result = await runMain(context, {
          deployment_confirmation: 'true',
          deployment_confirmation_timeout: '1'
        })

        assertExit(context, result, 1)
        assertDecision(context, result, 'failure')
        assertReason(context, result, 'confirmation_rejected')
        assertCommentIncludes(context, 'Deployment rejected by __octocat__')
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'confirmation timeout',
    run: () =>
      withMockGitHub('confirmation timeout', async context => {
        setTriggerComment(context.state, '.deploy')

        const result = await runMain(context, {
          deployment_confirmation: 'true',
          deployment_confirmation_timeout: '1'
        })

        assertExit(context, result, 1)
        assertReason(context, result, 'confirmation_timed_out')
        assertCommentIncludes(context, 'Deployment confirmation timed out')
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'confirmed deployment rejects moved ref',
    run: () =>
      withMockGitHub(
        'confirmed deployment rejects moved ref',
        async context => {
          setTriggerComment(context.state, '.deploy')
          context.state.confirmationReaction = '+1'
          context.state.pullRequestMoveAfterReads = 3
          context.state.pullRequestMoveSha = ACCEPTANCE_SHAS.default

          const result = await runMain(context, {
            deployment_confirmation: 'true',
            deployment_confirmation_timeout: '1'
          })

          assertExit(context, result, 1)
          assertReason(context, result, 'ref_changed')
          assertCommentIncludes(context, 'Deployment confirmed by __octocat__')
          assertNoDeployment(context, result)
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, result)
          )
        }
      )
  },
  {
    name: 'fork rejected by default',
    run: () =>
      withMockGitHub('fork rejected by default', async context => {
        setTriggerComment(context.state, '.deploy')
        setForkPullRequest(context.state)

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertDecision(context, result, 'failure')
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'fork', 'true')
        assertCommentIncludes(context, 'prevent deployments from forks')
      })
  },
  {
    name: 'fork explicit opt-in',
    run: () =>
      withMockGitHub('fork explicit opt-in', async context => {
        setTriggerComment(context.state, '.noop')
        setForkPullRequest(context.state)

        const result = await runMain(context, {allow_forks: 'true'})

        assertExit(context, result, 0)
        assertReason(context, result, 'noop_ready')
        assertOutput(context, result, 'fork', 'true')
        assertOutput(context, result, 'fork_ref', 'fork-branch')
        assertOutput(context, result, 'fork_label', 'fork-owner:fork-branch')
        assertOutput(
          context,
          result,
          'fork_checkout',
          'fork-owner-fork-branch fork-branch'
        )
        assertOutput(
          context,
          result,
          'fork_full_name',
          'fork-owner/branch-deploy'
        )
        assertOutput(context, result, 'ref', ACCEPTANCE_SHAS.fork)
        assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.fork)
        assertOutput(context, result, 'commit_verified', 'false')
        assert.equal(
          context.routeLog.filter(
            route =>
              `${route.method} ${route.path}` === `GET ${apiPath('/pulls/1')}`
          ).length,
          1,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'fork stable deployments reject moved branch refs',
    run: async () => {
      for (const command of ['.deploy main', '.noop main'] as const) {
        await withMockGitHub(
          `fork ${command} rejects moved main`,
          async context => {
            setTriggerComment(context.state, command)
            setForkPullRequest(context.state)
            context.state.stableBranchMoveSha = ACCEPTANCE_SHAS.feature

            const result = await runMain(context, {allow_forks: 'true'})

            assertExit(context, result, 1)
            assertDecision(context, result, 'failure')
            assertReason(context, result, 'ref_changed')
            assertOutput(context, result, 'ref', 'main')
            assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.default)
            assertNoDeployment(context, result)
            assert.equal(
              context.state.branches.get('main')?.sha,
              ACCEPTANCE_SHAS.feature,
              diagnostics(context, result)
            )
            assert.equal(
              context.state.branches.has(lockBranch('production')),
              false,
              diagnostics(context, result)
            )
            assert.equal(
              context.routeLog.filter(
                route =>
                  `${route.method} ${route.path}` ===
                  `GET ${apiPath('/branches/main')}`
              ).length,
              3,
              diagnostics(context, result)
            )
            assertCommentIncludes(context, 'Deployment Ref Changed')
          }
        )
      }
    }
  },
  {
    name: 'fork opt-in preserves trusted template boundary',
    run: () =>
      withMockGitHub(
        'fork opt-in preserves trusted template boundary',
        async context => {
          const templatePath = '.github/deployment_message.md'
          context.state.repositoryFiles.set(
            `${context.state.owner}/${context.state.repo}/${ACCEPTANCE_SHAS.default}/${templatePath}`,
            '### Trusted default template\n\n{{ results }}'
          )
          context.state.repositoryFiles.set(
            `${context.state.owner}/${context.state.repo}/${ACCEPTANCE_SHAS.fork}/${templatePath}`,
            '### Untrusted fork template'
          )
          setTriggerComment(context.state, '.noop')
          setForkPullRequest(context.state)
          const inputs = {
            allow_forks: 'true',
            deploy_message_path: templatePath
          }

          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)
          assertReason(context, mainResult, 'noop_ready')
          assertOutput(context, mainResult, 'sha', ACCEPTANCE_SHAS.fork)
          assertOutput(context, mainResult, 'ref', ACCEPTANCE_SHAS.fork)

          const postResult = await runPost(
            context,
            mainResult,
            inputs,
            'success',
            'octocat',
            {DEPLOY_MESSAGE: 'fork deployment completed'}
          )
          assertExit(context, postResult, 0)
          assertCommentIncludes(context, '### Trusted default template')
          assert.equal(
            context.state.comments.some(comment =>
              comment.body.includes('Untrusted fork template')
            ),
            false,
            diagnostics(context, postResult)
          )
          const templateRoute = requireRoute(
            context,
            'GET',
            apiPath(`/contents/${encodeURIComponent(templatePath)}`)
          )
          assert.equal(
            templateRoute.query,
            `?ref=${ACCEPTANCE_SHAS.default}`,
            diagnostics(context, postResult)
          )
        }
      )
  },
  {
    name: 'parameters and environment metadata',
    run: () =>
      withMockGitHub('parameters and environment metadata', async context => {
        setTriggerComment(
          context.state,
          '.deploy to development | --log-level=debug --replicas=2'
        )

        const result = await runMain(context, {
          environment_urls: 'development|https://dev.example.test'
        })

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'environment', 'development')
        assertOutput(
          context,
          result,
          'environment_url',
          'https://dev.example.test'
        )
        assertOutput(
          context,
          result,
          'params',
          '--log-level=debug --replicas=2'
        )
        assert.equal(
          requireOutput(context, result, 'parsed_params').includes(
            '"replicas":2'
          ),
          true,
          diagnostics(context, result)
        )
        assertResultField(context, result, 'environment', 'development')
        const deployment = requireDeployment(context)
        const payload = JSON.stringify(deployment.payload)
        assert.equal(payload.includes('"stable_branch_used":false'), true)
        assert.equal(payload.includes('"replicas":2'), true)
        assert.equal(
          requireDeploymentStatus(context, deployment, 0).environmentUrl,
          'https://dev.example.test'
        )
      })
  },
  {
    name: 'custom parameter separator and deployment inputs',
    run: () =>
      withMockGitHub(
        'custom parameter separator and deployment inputs',
        async context => {
          setTriggerComment(
            context.state,
            '.deploy to development :: --flag=true --count=2'
          )
          const inputs = {
            param_separator: '::',
            production_environments: 'development',
            required_contexts: 'lint, test',
            update_branch: 'disabled'
          }

          const result = await runMain(context, inputs)

          assertExit(context, result, 0)
          assertReason(context, result, 'deployment_ready')
          assertOutput(context, result, 'params', '--flag=true --count=2')
          assertOutput(
            context,
            result,
            'parsed_params',
            '{"_":[],"flag":"true","count":2}'
          )
          const deploymentBody = routeBody(
            context,
            'POST',
            apiPath('/deployments')
          )
          assert.equal(deploymentBody['production_environment'], true)
          assert.deepEqual(deploymentBody['required_contexts'], [
            'lint',
            'test'
          ])
          assert.equal(deploymentBody['auto_merge'], false)
          const payload = requireRecordValue(
            deploymentBody['payload'],
            diagnostics(context, result)
          )
          assert.equal(payload['params'], '--flag=true --count=2')
          assert.deepEqual(payload['parsed_params'], {
            _: [],
            count: 2,
            flag: 'true'
          })
        }
      )
  },
  {
    name: 'commit verification blocks unsigned feature commit',
    run: () =>
      withMockGitHub(
        'commit verification blocks unsigned feature commit',
        async context => {
          setTriggerComment(context.state, '.deploy')
          const commit = context.state.commits.get(ACCEPTANCE_SHAS.feature)
          assert.ok(commit !== undefined)
          context.state.commits.set(ACCEPTANCE_SHAS.feature, {
            ...commit,
            verified: false,
            verifiedAt: null,
            verificationReason: 'unsigned'
          })

          const result = await runMain(context, {commit_verification: 'true'})

          assertExit(context, result, 1)
          assertDecision(context, result, 'failure')
          assertReason(context, result, 'commit_safety_failed')
          assertOutput(context, result, 'commit_verified', 'false')
          assertCommentIncludes(context, 'commit signature is not valid')
          assertNoDeployment(context, result)
          assert.equal(context.state.lockFiles.size, 0)
        }
      )
  },
  {
    name: 'complex environment names use valid lock refs',
    run: () =>
      withMockGitHub(
        'complex environment names use valid lock refs',
        async context => {
          const inputs = {
            environment: 'super production',
            environment_targets: 'super production,prod/us-east'
          }

          for (const [environment, branch] of [
            ['super production', 'super-production-branch-deploy-lock'],
            ['prod/us-east', 'prod/us-east-branch-deploy-lock']
          ] as const) {
            setTriggerComment(context.state, `.lock ${environment}`)
            const lockResult = await runMain(context, inputs)
            assertExit(context, lockResult, 0)
            assertReason(context, lockResult, 'lock_acquired')
            assertResultField(context, lockResult, 'environment', environment)
            assert.equal(
              context.state.branches.has(branch),
              true,
              diagnostics(context, lockResult)
            )

            setTriggerComment(context.state, `.unlock ${environment}`)
            const unlockResult = await runMain(context, inputs)
            assertExit(context, unlockResult, 0)
            assertReason(context, unlockResult, 'unlock_completed')
            assert.equal(
              context.state.branches.has(branch),
              false,
              diagnostics(context, unlockResult)
            )
          }
        }
      )
  },
  {
    name: 'disabled and missing environment URLs stay empty',
    run: async () => {
      for (const [description, environmentUrls] of [
        ['disabled', 'development|disabled'],
        ['missing', 'production|https://production.example.test']
      ] as const) {
        await withMockGitHub(
          `${description} environment URL`,
          async context => {
            setTriggerComment(context.state, '.deploy to development')
            const inputs = {
              environment: 'development',
              environment_targets: 'development',
              environment_urls: environmentUrls
            }

            const mainResult = await runMain(context, inputs)
            assertExit(context, mainResult, 0)
            assertReason(context, mainResult, 'deployment_ready')
            assertOutput(context, mainResult, 'environment_url', 'null')
            const deployment = requireDeployment(context)
            assert.equal(
              requireDeploymentStatus(context, deployment, 0).environmentUrl,
              null,
              diagnostics(context, mainResult)
            )

            const postResult = await runPost(context, mainResult, inputs)
            assertExit(context, postResult, 0)
            assert.equal(
              requireDeploymentStatus(context, deployment, 1).environmentUrl,
              null,
              diagnostics(context, postResult)
            )
            assert.equal(
              context.state.branches.has(lockBranch('development')),
              false,
              diagnostics(context, postResult)
            )
          }
        )
      }
    }
  },
  {
    name: 'review-required rejection',
    run: () =>
      withMockGitHub('review-required rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.reviewDecision = 'REVIEW_REQUIRED'

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'commit_status', 'SUCCESS')
        assertCommentIncludes(
          context,
          'approval is required before you can proceed'
        )
      })
  },
  {
    name: 'unavailable CI rejection',
    run: () =>
      withMockGitHub('unavailable CI rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupAvailable = false

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'commit_status', 'UNAVAILABLE')
        assertCommentIncludes(context, 'commitStatus: `UNAVAILABLE`')
      })
  },
  {
    name: 'permission denied precheck',
    run: () =>
      withMockGitHub('permission denied precheck', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.permission = 'read'

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertNoDeployment(context, result)
        assertCommentIncludes(
          context,
          'command requires the following permission'
        )
      })
  },
  {
    name: 'restricted reaction permission is best effort',
    run: () =>
      withMockGitHub(
        'restricted reaction permission is best effort',
        async context => {
          setTriggerComment(context.state, '.help')
          queueFault(context.state, {
            method: 'POST',
            path: apiPath('/issues/comments/1000/reactions'),
            response: {message: 'Resource not accessible', status: 403}
          })

          const result = await runMain(context)

          assertExit(context, result, 0)
          assertReason(context, result, 'help_completed')
          assert.equal(context.state.faults.length, 0)
          assertCommentIncludes(context, '## 📚 Branch Deployment Help')
        }
      )
  },
  {
    name: 'restricted lock permission leaves no partial lock',
    run: () =>
      withMockGitHub(
        'restricted lock permission leaves no partial lock',
        async context => {
          setTriggerComment(context.state, '.lock production')
          queueFault(context.state, {
            method: 'POST',
            path: apiPath('/git/refs'),
            response: {message: 'Resource not accessible', status: 403}
          })

          const result = await runMain(context)

          assertExit(context, result, 1)
          assertReason(context, result, 'unexpected_error')
          assert.equal(context.state.faults.length, 0)
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, result)
          )
          assert.equal(
            mockLockContents(context.state, lockBranch('production')),
            undefined,
            diagnostics(context, result)
          )
        }
      )
  },
  {
    name: 'restricted comment permission cleans deployment lock',
    run: () =>
      withMockGitHub(
        'restricted comment permission cleans deployment lock',
        async context => {
          setTriggerComment(context.state, '.deploy')
          queueFault(context.state, {
            method: 'POST',
            path: apiPath('/issues/1/comments'),
            response: {message: 'Resource not accessible', status: 403}
          })

          const result = await runMain(context)

          assertExit(context, result, 1)
          assertReason(context, result, 'unexpected_error')
          assert.equal(context.state.faults.length, 0)
          assertNoDeployment(context, result)
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, result)
          )
        }
      )
  },
  {
    name: 'restricted deployment permission cleans deployment lock',
    run: () =>
      withMockGitHub(
        'restricted deployment permission cleans deployment lock',
        async context => {
          setTriggerComment(context.state, '.deploy')
          queueFault(context.state, {
            method: 'POST',
            path: apiPath('/deployments'),
            response: {message: 'Resource not accessible', status: 403}
          })

          const result = await runMain(context)

          assertExit(context, result, 1)
          assertReason(context, result, 'unexpected_error')
          assert.equal(context.state.faults.length, 0)
          assertNoDeployment(context, result)
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, result)
          )
        }
      )
  },
  {
    name: 'draft PR rejected by default',
    run: () =>
      withMockGitHub('draft PR rejected by default', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.pullRequest = {...context.state.pullRequest, draft: true}

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'pull request is in a draft state')
      })
  },
  {
    name: 'draft PR permitted target',
    run: () =>
      withMockGitHub('draft PR permitted target', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.pullRequest = {...context.state.pullRequest, draft: true}

        const result = await runMain(context, {
          draft_permitted_targets: 'production'
        })

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'environment', 'production')
        assert.equal(context.state.deployments.length, 1)
      })
  },
  {
    name: 'non-default base rejected',
    run: () =>
      withMockGitHub('non-default base rejected', async context => {
        setTriggerComment(context.state, '.deploy')
        addBranch(context.state, 'release')
        context.state.pullRequest = {
          ...context.state.pullRequest,
          baseRef: 'release'
        }

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'non_default_target_branch_used', 'true')
        assertNoDeployment(context, result)
        assertCommentIncludes(
          context,
          'not the default branch of this repository'
        )
      })
  },
  {
    name: 'non-default base explicit opt-in',
    run: () =>
      withMockGitHub('non-default base explicit opt-in', async context => {
        setTriggerComment(context.state, '.deploy')
        addBranch(context.state, 'release')
        context.state.pullRequest = {
          ...context.state.pullRequest,
          baseRef: 'release'
        }

        const result = await runMain(context, {
          allow_non_default_target_branch_deployments: 'true',
          use_security_warnings: 'false'
        })

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'non_default_target_branch_used', 'true')
        assert.equal(context.state.deployments.length, 1)
      })
  },
  {
    name: 'PR stacks disabled preserve the existing base check',
    run: async () => {
      for (const inputs of [{}, {enable_pr_stacks: 'false'}] as const) {
        await withMockGitHub('PR stacks disabled', async context => {
          seedPrStack(context.state)

          const result = await runMain(context, inputs)

          assertExit(context, result, 1)
          assertReason(context, result, 'prechecks_failed')
          assertOutput(
            context,
            result,
            'non_default_target_branch_used',
            'true'
          )
          assertCommentIncludes(
            context,
            'not the default branch of this repository'
          )
          assertNoDeployment(context, result)
          assertNoLockRoutes(context)
          assert.deepEqual(stackQueryRoutes(context), [])
        })
      }
    }
  },
  {
    name: 'PR stacks enabled preserve ordinary deployments',
    run: async () => {
      for (const [mode, inputs] of [
        ['omitted', {}],
        ['false', {enable_pr_stacks: 'false'}],
        ['true', {enable_pr_stacks: 'true'}]
      ] as const) {
        for (const membership of [undefined, null]) {
          for (const unavailable of [false, true]) {
            await withMockGitHub(
              `ordinary PR stacks ${mode}, membership ${String(membership)}, unavailable ${String(unavailable)}`,
              async context => {
                context.state.pullRequest = {
                  ...context.state.pullRequest,
                  merged: false
                }
                context.state.pullRequestStackResponses.push(
                  membership,
                  membership,
                  membership
                )
                const previewResponse = unavailable
                  ? new Error('Pull request stack preview is unavailable')
                  : {repository: null}
                context.state.prStackResponses.push(previewResponse)
                seedLock(
                  context.state,
                  'development',
                  'other-branch',
                  'other',
                  9
                )
                const otherLock = requireMockLock(
                  context,
                  lockBranch('development')
                )
                const otherLockSha = context.state.branches.get(
                  lockBranch('development')
                )?.sha

                const result = await runMain(context, inputs)

                assertExit(context, result, 0)
                assertDecision(context, result, 'continue')
                assertReason(context, result, 'deployment_ready')
                assertOutput(context, result, 'continue', 'true')
                assertOutput(context, result, 'noop', 'false')
                assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.feature)
                assertOutput(context, result, 'ref', 'feature-branch')
                assertOutput(context, result, 'base_ref', 'main')
                assertOutput(context, result, 'commit_status', 'SUCCESS')
                assertOutput(context, result, 'review_decision', 'APPROVED')
                assert.equal(
                  result.output['non_default_target_branch_used'],
                  undefined
                )
                assertResultField(context, result, 'deployment_type', 'branch')
                assertResultField(context, result, 'ref', 'feature-branch')
                assertResultField(
                  context,
                  result,
                  'sha',
                  ACCEPTANCE_SHAS.feature
                )
                const deployment = requireDeployment(context)
                assert.equal(deployment.ref, 'feature-branch')
                assert.equal(deployment.sha, ACCEPTANCE_SHAS.feature)
                const deploymentBody = routeBody(
                  context,
                  'POST',
                  apiPath('/deployments')
                )
                assert.equal(deploymentBody['ref'], 'feature-branch')
                assert.equal(deploymentBody['auto_merge'], true)
                assert.equal(
                  requireDeploymentStatus(context, deployment, 0).state,
                  'in_progress'
                )
                assert.equal(
                  context.state.branches.has(lockBranch('production')),
                  true
                )

                const postResult = await runPost(context, result, inputs)

                assertExit(context, postResult, 0)
                assert.equal(
                  requireDeploymentStatus(context, deployment, 1).state,
                  'success'
                )
                assert.equal(
                  context.state.branches.has(lockBranch('production')),
                  false
                )
                assert.deepEqual(
                  requireMockLock(context, lockBranch('development')),
                  otherLock
                )
                assert.equal(
                  context.state.branches.get(lockBranch('development'))?.sha,
                  otherLockSha
                )
                assert.equal(context.state.pullRequestReads, 3)
                assert.deepEqual(stackQueryRoutes(context), [])
                assert.deepEqual(context.state.prStackResponses, [
                  previewResponse
                ])
              }
            )
          }
        }
      }
    }
  },
  {
    name: 'ordinary PR policy remains independent of stack preview',
    run: async () => {
      for (const failure of [
        'CI',
        'review',
        'draft',
        'force update'
      ] as const) {
        await withMockGitHub(`ordinary PR ${failure}`, async context => {
          context.state.pullRequest = {
            ...context.state.pullRequest,
            merged: false
          }
          const previewResponse = new Error('Stack preview is unavailable')
          context.state.prStackResponses.push(previewResponse)
          const inputs = {
            enable_pr_stacks: 'true',
            update_branch: failure === 'force update' ? 'force' : 'warn'
          }
          switch (failure) {
            case 'CI':
              context.state.rollupState = 'FAILURE'
              context.state.rollupContexts = [
                {
                  conclusion: 'FAILURE',
                  isRequired: true,
                  name: 'acceptance',
                  type: 'check-run'
                }
              ]
              break
            case 'review':
              context.state.reviewDecision = 'REVIEW_REQUIRED'
              break
            case 'draft':
              context.state.pullRequest = {
                ...context.state.pullRequest,
                draft: true
              }
              break
            case 'force update':
              context.state.mergeStateStatus = 'BEHIND'
              break
          }

          const result = await runMain(context, inputs)

          assertExit(context, result, 1)
          assertReason(context, result, 'prechecks_failed')
          assertNoDeployment(context, result)
          assertNoLockRoutes(context)
          switch (failure) {
            case 'CI':
              assertOutput(context, result, 'commit_status', 'FAILURE')
              assertCommentIncludes(context, 'CI checks are failing')
              break
            case 'review':
              assertOutput(
                context,
                result,
                'review_decision',
                'REVIEW_REQUIRED'
              )
              assertCommentIncludes(
                context,
                'approval is required before you can proceed'
              )
              break
            case 'draft':
              assertCommentIncludes(context, 'pull request is in a draft state')
              break
            case 'force update': {
              const update = requireRoute(
                context,
                'PUT',
                apiPath('/pulls/1/update-branch')
              )
              assert.equal(update.body, '')
              assertCommentIncludes(context, 'updated your branch with `main`')
              context.state.mergeStateStatus = 'CLEAN'
              const retry = await runMain(context, inputs)
              assertExit(context, retry, 0)
              assertReason(context, retry, 'deployment_ready')
              assertOutput(context, retry, 'is_outdated', 'false')
              const post = await runPost(context, retry, inputs)
              assertExit(context, post, 0)
              assert.equal(
                requireDeploymentStatus(context, requireDeployment(context), 1)
                  .state,
                'success'
              )
              assert.equal(
                context.state.branches.has(lockBranch('production')),
                false
              )
              break
            }
          }
          assert.deepEqual(stackQueryRoutes(context), [])
          assert.deepEqual(context.state.prStackResponses, [previewResponse])
        })
      }
    }
  },
  {
    name: 'ordinary PR membership changes require fresh checks when enabled',
    run: async () => {
      for (const phase of [
        'after prechecks',
        'after confirmation',
        'after started comment'
      ] as const) {
        for (const enabled of [false, true]) {
          await withMockGitHub(
            `ordinary PR joins a stack ${phase}, enabled ${String(enabled)}`,
            async context => {
              context.state.pullRequest = {
                ...context.state.pullRequest,
                merged: false
              }
              const membership = {
                id: 1,
                number: 1,
                size: 1,
                position: 1,
                base: {ref: 'main', sha: ACCEPTANCE_SHAS.default}
              }
              context.state.pullRequestStackResponses.push(
                undefined,
                phase === 'after started comment' ? null : membership,
                membership
              )
              const previewResponse = new Error('Stack preview is unavailable')
              context.state.prStackResponses.push(previewResponse)
              context.state.confirmationReaction = '+1'
              const inputs = {
                enable_pr_stacks: String(enabled),
                deployment_confirmation: String(phase === 'after confirmation'),
                deployment_confirmation_timeout: '1'
              }

              const result = await runMain(context, inputs)

              assertExit(context, result, enabled ? 1 : 0)
              assertReason(
                context,
                result,
                enabled ? 'ref_changed' : 'deployment_ready'
              )
              assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.feature)
              if (phase === 'after confirmation') {
                assertCommentIncludes(
                  context,
                  'Deployment confirmed by __octocat__'
                )
              }
              if (enabled) {
                assertNoDeployment(context, result)
                assertResultField(context, result, 'deployment_id', null)
                assert.equal(result.state['bypass'], 'true')
                assert.equal(
                  context.state.branches.has(lockBranch('production')),
                  false
                )
                assert.equal(
                  context.state.pullRequestReads,
                  phase === 'after started comment' ? 3 : 2
                )
              } else {
                assert.equal(requireDeployment(context).ref, 'feature-branch')
              }
              const post = await runPost(
                context,
                result,
                inputs,
                enabled ? 'failure' : 'success'
              )
              assertExit(context, post, 0)
              assert.equal(
                context.state.branches.has(lockBranch('production')),
                false
              )
              assert.deepEqual(stackQueryRoutes(context), [])
              assert.deepEqual(context.state.prStackResponses, [
                previewResponse
              ])
            }
          )
        }
      }
    }
  },
  {
    name: 'fork-hosted ordinary PRs preserve stack recheck boundaries',
    run: async () => {
      for (const variant of [
        {mode: 'true', sameRepository: true, rechecks: true},
        {mode: 'omitted', sameRepository: true, rechecks: false},
        {mode: 'false', sameRepository: true, rechecks: false},
        {mode: 'true', sameRepository: false, rechecks: false}
      ] as const) {
        for (const initialMembership of [undefined, null]) {
          for (const phase of [
            'after confirmation',
            'after started comment',
            'unchanged'
          ] as const) {
            await withMockGitHub(
              `fork ordinary ${variant.mode}, same repository ${String(variant.sameRepository)}, membership ${String(initialMembership)}, ${phase}`,
              async context => {
                const repository = `${context.state.owner}/${context.state.repo}`
                const headRepository = variant.sameRepository
                  ? phase === 'after started comment'
                    ? repository.toUpperCase()
                    : repository
                  : `fork-owner/${context.state.repo}`
                context.state.pullRequest = {
                  ...context.state.pullRequest,
                  headLabel: `${variant.sameRepository ? context.state.owner : 'fork-owner'}:${context.state.pullRequest.headRef}`,
                  headRepoFork: true,
                  headRepoFullName: headRepository,
                  merged: false
                }
                const membership = {
                  id: 1,
                  number: 1,
                  size: 1,
                  position: 1,
                  base: {ref: 'main', sha: ACCEPTANCE_SHAS.default}
                }
                const responses = [
                  initialMembership,
                  phase === 'after confirmation'
                    ? membership
                    : initialMembership,
                  phase === 'unchanged' ? initialMembership : membership
                ]
                context.state.pullRequestStackResponses.push(...responses)
                const previewResponse = new Error(
                  'Stack preview is unavailable'
                )
                context.state.prStackResponses.push(previewResponse)
                context.state.confirmationReaction = '+1'
                seedLock(
                  context.state,
                  'development',
                  'other-branch',
                  'other',
                  9
                )
                const otherLock = requireMockLock(
                  context,
                  lockBranch('development')
                )
                const otherLockSha = context.state.branches.get(
                  lockBranch('development')
                )?.sha
                const inputs = {
                  ...(variant.mode === 'omitted'
                    ? {}
                    : {enable_pr_stacks: variant.mode}),
                  allow_forks: 'true',
                  deployment_confirmation: 'true',
                  deployment_confirmation_timeout: '1'
                }
                const rejected = variant.rechecks && phase !== 'unchanged'
                const expectedReads = variant.rechecks
                  ? phase === 'after confirmation'
                    ? 2
                    : 3
                  : 1

                const result = await runMain(context, inputs)

                assertExit(context, result, rejected ? 1 : 0)
                assertReason(
                  context,
                  result,
                  rejected ? 'ref_changed' : 'deployment_ready'
                )
                assertOutput(context, result, 'fork', 'true')
                assertOutput(context, result, 'fork_full_name', headRepository)
                assertOutput(context, result, 'ref', ACCEPTANCE_SHAS.feature)
                assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.feature)
                assertResultField(
                  context,
                  result,
                  'ref',
                  ACCEPTANCE_SHAS.feature
                )
                assertResultField(
                  context,
                  result,
                  'sha',
                  ACCEPTANCE_SHAS.feature
                )
                assertCommentIncludes(
                  context,
                  'Deployment confirmed by __octocat__'
                )
                if (rejected) {
                  assertNoDeployment(context, result)
                  assertResultField(context, result, 'deployment_id', null)
                  assert.equal(result.state['bypass'], 'true')
                  assert.equal(
                    context.state.branches.has(lockBranch('production')),
                    false
                  )
                } else {
                  const deployment = requireDeployment(context)
                  assert.equal(deployment.ref, ACCEPTANCE_SHAS.feature)
                  assert.equal(deployment.sha, ACCEPTANCE_SHAS.feature)
                  assert.equal(
                    routeBody(context, 'POST', apiPath('/deployments'))[
                      'auto_merge'
                    ],
                    true
                  )
                }

                const post = await runPost(
                  context,
                  result,
                  inputs,
                  rejected ? 'failure' : 'success'
                )

                assertExit(context, post, 0)
                if (!rejected) {
                  assert.equal(
                    requireDeploymentStatus(
                      context,
                      requireDeployment(context),
                      1
                    ).state,
                    'success'
                  )
                }
                assert.equal(context.state.pullRequestReads, expectedReads)
                assert.deepEqual(
                  context.state.pullRequestStackResponses,
                  responses.slice(expectedReads)
                )
                assert.deepEqual(prechecksQueryNumbers(context), [1])
                assert.deepEqual(stackQueryRoutes(context), [])
                assert.deepEqual(context.state.prStackResponses, [
                  previewResponse
                ])
                assert.equal(
                  context.state.branches.has(lockBranch('production')),
                  false
                )
                assert.deepEqual(
                  requireMockLock(context, lockBranch('development')),
                  otherLock
                )
                assert.equal(
                  context.state.branches.get(lockBranch('development'))?.sha,
                  otherLockSha
                )
              }
            )
          }
        }
      }
    }
  },
  {
    name: 'fork-hosted explicit SHA and stable deploys keep their recheck paths',
    run: async () => {
      for (const selection of [
        'exact SHA',
        'stable',
        'moved stable'
      ] as const) {
        await withMockGitHub(`fork-hosted ${selection}`, async context => {
          context.state.pullRequest = {
            ...context.state.pullRequest,
            headRepoFork: true,
            merged: false
          }
          const membership = {
            id: 1,
            number: 1,
            size: 1,
            position: 1,
            base: {ref: 'main', sha: ACCEPTANCE_SHAS.default}
          }
          context.state.pullRequestStackResponses.push(membership, membership)
          const previewResponse = new Error('Stack preview is unavailable')
          context.state.prStackResponses.push(previewResponse)
          context.state.confirmationReaction = '+1'
          const exactSha = selection === 'exact SHA'
          const moved = selection === 'moved stable'
          setTriggerComment(
            context.state,
            `.deploy ${exactSha ? ACCEPTANCE_SHAS.default : 'main'}`
          )
          if (moved) {
            context.state.stableBranchMoveSha = ACCEPTANCE_SHAS.feature
          }
          const inputs = {
            enable_pr_stacks: 'true',
            allow_forks: 'true',
            allow_sha_deployments: String(exactSha),
            deployment_confirmation: 'true',
            deployment_confirmation_timeout: '1'
          }

          const result = await runMain(context, inputs)

          assertExit(context, result, moved ? 1 : 0)
          assertReason(
            context,
            result,
            moved ? 'ref_changed' : 'deployment_ready'
          )
          assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.default)
          assertOutput(
            context,
            result,
            'ref',
            exactSha ? ACCEPTANCE_SHAS.default : 'main'
          )
          if (moved) {
            assertNoDeployment(context, result)
          } else {
            assert.equal(
              requireDeployment(context).ref,
              exactSha ? ACCEPTANCE_SHAS.default : 'main'
            )
            assert.equal(
              routeBody(context, 'POST', apiPath('/deployments'))['auto_merge'],
              !exactSha
            )
          }

          const post = await runPost(
            context,
            result,
            inputs,
            moved ? 'failure' : 'success'
          )

          assertExit(context, post, 0)
          if (!moved) {
            assert.equal(
              requireDeploymentStatus(context, requireDeployment(context), 1)
                .state,
              'success'
            )
          }
          assert.equal(context.state.pullRequestReads, 1)
          assert.deepEqual(context.state.pullRequestStackResponses, [
            membership
          ])
          assert.deepEqual(stackQueryRoutes(context), [])
          assert.deepEqual(context.state.prStackResponses, [previewResponse])
          assert.equal(
            context.routeLog.filter(
              route =>
                route.method === 'GET' &&
                route.path === apiPath('/branches/main')
            ).length,
            exactSha ? 2 : moved ? 3 : 4
          )
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false
          )
        })
      }
    }
  },
  {
    name: 'native REST membership fails closed on main-target PRs',
    run: async () => {
      const membership = {
        id: 1,
        number: 1,
        size: 3,
        position: 1,
        base: {ref: 'main', sha: ACCEPTANCE_SHAS.default}
      }
      for (const [description, response] of [
        ['false', false],
        ['zero', 0],
        ['empty string', ''],
        ['empty object', {}],
        ['missing base', {number: 1, position: 1}],
        ['invalid position', {...membership, position: 0}],
        ['different number', {...membership, number: 2}],
        ['different position', {...membership, position: 2}],
        ['different base', {...membership, base: {ref: 'release'}}]
      ] as const) {
        await withMockGitHub(
          `native REST membership ${description}`,
          async context => {
            seedPrStack(context.state, 1)
            context.state.pullRequestStackResponses.push(response)

            const result = await runMain(context, {enable_pr_stacks: 'true'})

            assertExit(context, result, 1)
            assertReason(context, result, 'prechecks_failed')
            assertOutput(context, result, 'base_ref', 'main')
            assertNoDeployment(context, result)
            assertNoLockRoutes(context)
            assertCommentIncludes(
              context,
              'could not verify this pull request stack'
            )
          }
        )
      }
      for (const failure of [
        'disappeared',
        'malformed',
        'unavailable'
      ] as const) {
        await withMockGitHub(
          `native stack preview ${failure}`,
          async context => {
            seedPrStack(context.state, 1)
            let previewResponse: unknown
            if (failure === 'disappeared') {
              const stack = context.state.prStack
              context.state.prStack = null
              previewResponse = mockPrStackResponse(
                context.state,
                'refs/heads/main',
                null
              )
              context.state.prStack = stack
            } else {
              previewResponse =
                failure === 'malformed'
                  ? {repository: null}
                  : new Error('Pull request stack preview is unavailable')
            }
            context.state.prStackResponses.push(previewResponse)

            const result = await runMain(context, {enable_pr_stacks: 'true'})

            assertExit(context, result, 1)
            assertReason(context, result, 'prechecks_failed')
            assertOutput(context, result, 'base_ref', 'main')
            assertNoDeployment(context, result)
            assertNoLockRoutes(context)
            assertCommentIncludes(
              context,
              'could not verify this pull request stack'
            )
            assert.equal(stackQueryRoutes(context).length, 1)
            assert.deepEqual(context.state.prStackResponses, [])
          }
        )
      }
    }
  },
  {
    name: 'native PR stacks deploy the selected cumulative SHA',
    run: async () => {
      for (const selectedNumber of [1, 2, 3]) {
        await withMockGitHub(
          `native stack layer ${String(selectedNumber)}`,
          async context => {
            seedPrStack(context.state, selectedNumber)
            const selected = context.state.pullRequest
            const inputs = {enable_pr_stacks: 'true', checks: 'acceptance'}
            if (selectedNumber === 2) {
              requireStackMember(context.state, 3).reviewDecision =
                'CHANGES_REQUESTED'
            }

            const result = await runMain(context, inputs)

            assertExit(context, result, 0)
            assertReason(context, result, 'deployment_ready')
            assertOutput(context, result, 'sha', selected.headSha)
            assertOutput(context, result, 'ref', selected.headRef)
            assertOutput(context, result, 'base_ref', selected.baseRef)
            assertResultField(context, result, 'deployment_type', 'branch')
            const deployment = requireDeployment(context)
            assert.equal(deployment.sha, selected.headSha)
            assert.equal(deployment.ref, selected.headSha)
            const deploymentBody = routeBody(
              context,
              'POST',
              apiPath('/deployments')
            )
            assert.equal(deploymentBody['ref'], selected.headSha)
            assert.equal(deploymentBody['auto_merge'], false)
            const payload = requireRecordValue(
              deploymentBody['payload'],
              diagnostics(context, result)
            )
            assert.equal(payload['sha'], selected.headSha)
            const checkedNumbers = prechecksQueryNumbers(context)
            assert.deepEqual(
              [...new Set(checkedNumbers)].sort(),
              [1, 2, 3].slice(0, selectedNumber)
            )
            for (const route of stackQueryRoutes(context)) {
              assert.equal(route.authorizationPresent, true)
            }
            assert.ok(
              stackQueryRoutes(context).length >= 2,
              diagnostics(context, result)
            )
            requireRoute(
              context,
              'GET',
              apiPath(
                `/compare/${ACCEPTANCE_SHAS.default}...${ACCEPTANCE_SHAS.stackBottom}`
              )
            )
            if (selectedNumber > 1) {
              requireRoute(
                context,
                'GET',
                apiPath(
                  `/compare/${ACCEPTANCE_SHAS.stackBottom}...${ACCEPTANCE_SHAS.stackMiddle}`
                )
              )
            }

            const postResult = await runPost(context, result, inputs)

            assertExit(context, postResult, 0)
            assert.equal(
              requireDeploymentStatus(context, deployment, 1).state,
              'success'
            )
            assert.equal(
              context.state.branches.has(lockBranch('production')),
              false,
              diagnostics(context, postResult)
            )
          }
        )
      }
    }
  },
  {
    name: 'native PR stacks preserve deployment required contexts',
    run: async () => {
      for (const accepted of [true, false]) {
        await withMockGitHub(
          `native stack required contexts ${String(accepted)}`,
          async context => {
            seedPrStack(context.state)
            requireStackMember(context.state, 1).rollupContexts = [
              {
                type: 'status-context',
                context: 'artifact-ready',
                isRequired: false,
                state: 'FAILURE'
              }
            ]
            context.state.rollupContexts = [
              {
                type: 'status-context',
                context: 'artifact-ready',
                isRequired: false,
                state: accepted ? 'SUCCESS' : 'FAILURE'
              }
            ]
            if (!accepted) {
              queueFault(context.state, {
                method: 'POST',
                path: apiPath('/deployments'),
                response: {
                  message: 'Required deployment status is not successful',
                  status: 409
                }
              })
            }

            const result = await runMain(context, {
              enable_pr_stacks: 'true',
              skip_ci: 'production',
              required_contexts: 'artifact-ready'
            })

            const deploymentBody = routeBody(
              context,
              'POST',
              apiPath('/deployments')
            )
            assert.equal(deploymentBody['ref'], ACCEPTANCE_SHAS.stackTop)
            assert.deepEqual(deploymentBody['required_contexts'], [
              'artifact-ready'
            ])
            if (accepted) {
              assertExit(context, result, 0)
              assertReason(context, result, 'deployment_ready')
              assert.equal(
                requireDeployment(context).sha,
                ACCEPTANCE_SHAS.stackTop
              )
            } else {
              assertExit(context, result, 1)
              assertReason(context, result, 'unexpected_error')
              assertNoDeployment(context, result)
              assert.equal(context.state.faults.length, 0)
              assert.equal(
                context.state.branches.has(lockBranch('production')),
                false,
                diagnostics(context, result)
              )
            }
          }
        )
      }
    }
  },
  {
    name: 'native PR stacks require configured CI to be present',
    run: async () => {
      for (const [checks, number, missing] of [
        ['required', 1, 'optional-only'],
        ['all', 1, 'empty'],
        ['', 1, 'optional-only'],
        ['required', 3, 'empty'],
        ['all', 3, 'not-required']
      ] as const) {
        await withMockGitHub(
          `native stack ${checks} ${missing} CI on PR ${String(number)}`,
          async context => {
            seedPrStack(context.state)
            setClassicRequiredChecks(context.state, [
              {context: 'acceptance', app_id: 1}
            ])
            const pull =
              number === context.state.pullRequest.number
                ? context.state
                : requireStackMember(context.state, number)
            pull.rollupContexts =
              missing === 'empty'
                ? []
                : [
                    {
                      conclusion: 'SUCCESS',
                      integrationId: 1,
                      isRequired: false,
                      name:
                        missing === 'optional-only'
                          ? 'optional-lint'
                          : 'acceptance',
                      type: 'check-run'
                    }
                  ]

            const result = await runMain(context, {
              enable_pr_stacks: 'true',
              checks
            })

            assertExit(context, result, 1)
            assertReason(context, result, 'prechecks_failed')
            assertNoDeployment(context, result)
            assertNoLockRoutes(context)
            assertCommentIncludes(
              context,
              'Required CI checks have not been reported for this stack'
            )
            if (number === context.state.pullRequest.number) {
              assertOutput(context, result, 'commit_status', 'MISSING')
            } else {
              assertCommentIncludes(context, `PR #${String(number)}`)
            }
            const policyRoute = requireRoute(
              context,
              'GET',
              apiPath('/rules/branches/main')
            )
            assert.equal(policyRoute.apiVersion, '2022-11-28')
            assert.equal(
              new URLSearchParams(policyRoute.query).get('per_page'),
              '100'
            )
          }
        )
      }
    }
  },
  {
    name: 'native PR stacks combine classic and ruleset required CI',
    run: async () => {
      for (const missing of [
        'legacy-required',
        'second-ruleset-required',
        null
      ]) {
        await withMockGitHub(
          `native stack combined required CI ${String(missing)}`,
          async context => {
            seedPrStack(context.state)
            setClassicRequiredChecks(
              context.state,
              [{context: 'acceptance', app_id: 1}],
              ['acceptance', 'legacy-required']
            )
            context.state.branchRules = [
              {
                type: 'required_status_checks',
                parameters: {
                  required_status_checks: [
                    {context: 'ruleset-required', integration_id: 15368}
                  ],
                  strict_required_status_checks_policy: true
                }
              },
              {
                type: 'required_status_checks',
                parameters: {
                  required_status_checks: [
                    {context: 'second-ruleset-required'}
                  ],
                  strict_required_status_checks_policy: false
                }
              }
            ]
            const reported: readonly MockRollupContext[] = [
              ...context.state.rollupContexts,
              {
                context: 'legacy-required',
                isRequired: true,
                state: 'SUCCESS',
                type: 'status-context'
              },
              {
                conclusion: 'SUCCESS',
                integrationId: 15368,
                isRequired: true,
                name: 'ruleset-required',
                type: 'check-run'
              },
              {
                conclusion: 'SUCCESS',
                isRequired: true,
                name: 'second-ruleset-required',
                type: 'check-run'
              }
            ]
            setStackRollupContexts(context.state, reported)
            if (missing !== null) {
              requireStackMember(context.state, 1).rollupContexts =
                reported.filter(
                  check =>
                    (check.type === 'check-run'
                      ? check.name
                      : check.context) !== missing
                )
            }

            const result = await runMain(context, {
              enable_pr_stacks: 'true',
              checks: 'required'
            })

            if (missing === null) {
              assertExit(context, result, 0)
              assertReason(context, result, 'deployment_ready')
              assert.equal(
                requireDeployment(context).sha,
                ACCEPTANCE_SHAS.stackTop
              )
            } else {
              assertExit(context, result, 1)
              assertReason(context, result, 'prechecks_failed')
              assertNoDeployment(context, result)
              assertNoLockRoutes(context)
              assertCommentIncludes(context, missing)
              assertCommentIncludes(context, 'PR #1')
            }
          }
        )
      }
    }
  },
  {
    name: 'native PR stacks enforce required CI App sources',
    run: async () => {
      const required: MockRollupContext = {
        conclusion: 'SUCCESS',
        integrationId: 15368,
        isRequired: true,
        name: 'acceptance',
        type: 'check-run'
      }
      const cases = [
        {
          name: 'wrong App',
          checks: 'required',
          reported: {...required, integrationId: 7},
          accepted: false
        },
        {
          name: 'unknown App',
          checks: 'all',
          reported: {...required, integrationId: null},
          accepted: false
        },
        {
          name: 'legacy status without App identity',
          checks: 'required',
          reported: {
            context: 'acceptance',
            isRequired: true,
            state: 'SUCCESS',
            type: 'status-context'
          },
          accepted: false
        },
        {
          name: 'optional result from the right App',
          checks: 'all',
          reported: {...required, isRequired: false},
          accepted: false
        },
        {
          name: 'required result from the right App',
          checks: 'required',
          reported: required,
          accepted: true
        }
      ] satisfies readonly {
        readonly name: string
        readonly checks: string
        readonly reported: MockRollupContext
        readonly accepted: boolean
      }[]
      for (const testCase of cases) {
        await withMockGitHub(`native stack ${testCase.name}`, async context => {
          seedPrStack(context.state)
          setClassicRequiredChecks(context.state, [
            {context: 'acceptance', app_id: 15368}
          ])
          context.state.branchRules = [
            {
              type: 'required_status_checks',
              parameters: {
                required_status_checks: [
                  {context: 'acceptance', integration_id: 15368}
                ],
                strict_required_status_checks_policy: true
              }
            }
          ]
          setStackRollupContexts(context.state, [required])
          requireStackMember(context.state, 1).rollupContexts = [
            testCase.reported
          ]

          const result = await runMain(context, {
            enable_pr_stacks: 'true',
            checks: testCase.checks
          })

          if (testCase.accepted) {
            assertExit(context, result, 0)
            assertReason(context, result, 'deployment_ready')
            assert.equal(
              requireDeployment(context).sha,
              ACCEPTANCE_SHAS.stackTop
            )
          } else {
            assertExit(context, result, 1)
            assertReason(context, result, 'prechecks_failed')
            assertNoDeployment(context, result)
            assertNoLockRoutes(context)
            assertCommentIncludes(context, 'acceptance (GitHub App 15368)')
            assertCommentIncludes(context, 'PR #1')
          }
        })
      }
    }
  },
  {
    name: 'native PR stacks read every required CI rules page',
    run: async () => {
      for (const complete of [false, true]) {
        await withMockGitHub(
          `native stack required CI pagination ${String(complete)}`,
          async context => {
            seedPrStack(context.state)
            context.state.branchRules = [
              ...Array.from({length: complete ? 99 : 100}, () => ({
                type: 'deletion'
              })),
              {
                type: 'required_status_checks',
                parameters: {
                  required_status_checks: [{context: 'late-required'}],
                  strict_required_status_checks_policy: true
                }
              }
            ]
            const initial = context.state.rollupContexts
            setStackRollupContexts(context.state, [
              ...initial,
              {
                conclusion: 'SUCCESS',
                isRequired: true,
                name: 'late-required',
                type: 'check-run'
              }
            ])
            if (!complete) {
              requireStackMember(context.state, 1).rollupContexts = initial
            }

            const result = await runMain(context, {
              enable_pr_stacks: 'true',
              checks: 'required',
              use_security_warnings: 'false'
            })

            assert.deepEqual(
              context.routeLog
                .filter(route => route.path === apiPath('/rules/branches/main'))
                .map(route => new URLSearchParams(route.query).get('page')),
              ['1', '2'],
              diagnostics(context, result)
            )
            if (complete) {
              assertExit(context, result, 0)
              assertReason(context, result, 'deployment_ready')
            } else {
              assertExit(context, result, 1)
              assertReason(context, result, 'prechecks_failed')
              assertNoDeployment(context, result)
              assertNoLockRoutes(context)
              assertCommentIncludes(context, 'late-required')
            }
          }
        )
      }
    }
  },
  {
    name: 'native PR stacks fail closed on unavailable required CI policy',
    run: async () => {
      for (const failure of [
        'unreadable rules',
        'malformed rule',
        'required workflow rule'
      ] as const) {
        await withMockGitHub(`native stack ${failure}`, async context => {
          seedPrStack(context.state)
          switch (failure) {
            case 'unreadable rules':
              queueFault(context.state, {
                method: 'GET',
                path: apiPath('/rules/branches/main'),
                response: {message: 'Resource not accessible', status: 403}
              })
              break
            case 'malformed rule':
              context.state.branchRules = [
                {type: 'required_status_checks', parameters: {}}
              ]
              break
            case 'required workflow rule':
              context.state.branchRules = [
                {type: 'workflows', parameters: {workflows: []}}
              ]
              break
          }

          const result = await runMain(context, {
            enable_pr_stacks: 'true',
            checks: 'required'
          })

          assertExit(context, result, 1)
          assertReason(context, result, 'prechecks_failed')
          assertNoDeployment(context, result)
          assertNoLockRoutes(context)
          assertCommentIncludes(
            context,
            'could not read the required CI checks for this pull request stack'
          )
        })
      }
    }
  },
  {
    name: 'native PR stacks limit automatic required CI inventory',
    run: async () => {
      for (const mode of [
        'ordinary PR',
        'explicit checks',
        'skip CI',
        'disabled stacks'
      ] as const) {
        await withMockGitHub(`required CI inventory ${mode}`, async context => {
          if (mode !== 'ordinary PR') seedPrStack(context.state)
          setClassicRequiredChecks(context.state, [
            {context: 'missing-required', app_id: 15368}
          ])
          context.state.branchRules = [
            {
              type: 'required_status_checks',
              parameters: {
                required_status_checks: [{context: 'missing-required'}],
                strict_required_status_checks_policy: true
              }
            }
          ]

          const result = await runMain(context, {
            enable_pr_stacks: mode === 'disabled stacks' ? 'false' : 'true',
            checks: mode === 'explicit checks' ? 'acceptance' : 'required',
            ...(mode === 'skip CI' ? {skip_ci: 'production'} : {}),
            use_security_warnings: 'false'
          })

          if (mode === 'disabled stacks') {
            assertExit(context, result, 1)
            assertReason(context, result, 'prechecks_failed')
            assertNoDeployment(context, result)
          } else {
            assertExit(context, result, 0)
            assertReason(context, result, 'deployment_ready')
          }
          assert.deepEqual(
            context.routeLog.filter(
              route => route.path === apiPath('/rules/branches/main')
            ),
            [],
            diagnostics(context, result)
          )
        })
      }
    }
  },
  {
    name: 'native PR stacks enforce lower-layer policy',
    run: async () => {
      for (const failure of [
        'failed check',
        'pending check',
        'missing check',
        'missing approval',
        'changes requested',
        'draft'
      ] as const) {
        await withMockGitHub(`native stack lower ${failure}`, async context => {
          seedPrStack(context.state)
          const lower = requireStackMember(context.state, 1)
          switch (failure) {
            case 'failed check':
              lower.rollupState = 'FAILURE'
              lower.rollupContexts = [
                {
                  conclusion: 'FAILURE',
                  isRequired: true,
                  name: 'acceptance',
                  type: 'check-run'
                }
              ]
              break
            case 'pending check':
              lower.rollupState = 'PENDING'
              lower.rollupContexts = [
                {
                  conclusion: null,
                  isRequired: true,
                  name: 'acceptance',
                  type: 'check-run'
                }
              ]
              break
            case 'missing check':
              lower.rollupContexts = []
              break
            case 'missing approval':
              lower.reviewDecision = 'REVIEW_REQUIRED'
              break
            case 'changes requested':
              lower.reviewDecision = 'CHANGES_REQUESTED'
              break
            case 'draft':
              lower.pullRequest = {...lower.pullRequest, draft: true}
              break
          }

          const result = await runMain(context, {
            enable_pr_stacks: 'true',
            checks: 'acceptance'
          })

          assertExit(context, result, 1)
          assertReason(context, result, 'prechecks_failed')
          assertNoDeployment(context, result)
          assertNoLockRoutes(context)
          assert.ok(
            prechecksQueryNumbers(context).includes(1),
            diagnostics(context, result)
          )
        })
      }
    }
  },
  {
    name: 'native PR stacks preserve noop review policy',
    run: () =>
      withMockGitHub('native stack noop review policy', async context => {
        seedPrStack(context.state)
        setTriggerComment(context.state, '.noop')
        requireStackMember(context.state, 1).reviewDecision = 'REVIEW_REQUIRED'
        const inputs = {enable_pr_stacks: 'true'}

        const result = await runMain(context, inputs)

        assertExit(context, result, 0)
        assertReason(context, result, 'noop_ready')
        assertResultField(context, result, 'deployment_type', 'noop')
        assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.stackTop)
        assertOutput(context, result, 'ref', 'stack-top')
        assertOutput(context, result, 'noop', 'true')
        assertNoDeployment(context, result)
        assert.ok(prechecksQueryNumbers(context).includes(1))
        assert.ok(stackQueryRoutes(context).length >= 2)

        const postResult = await runPost(context, result, inputs)

        assertExit(context, postResult, 0)
        assertNoDeployment(context, postResult)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, postResult)
        )
      })
  },
  {
    name: 'native PR stacks handle a merged lower layer',
    run: async () => {
      for (const [selectedNumber, ref, sha] of [
        [2, 'stack-middle', ACCEPTANCE_SHAS.stackMiddle],
        [3, 'stack-top', ACCEPTANCE_SHAS.stackTop]
      ] as const) {
        await withMockGitHub(
          `native stack merged lower layers before PR ${String(selectedNumber)}`,
          async context => {
            seedPrStack(context.state, selectedNumber)
            for (const number of [1, 2].slice(0, selectedNumber - 1)) {
              const lower = requireStackMember(context.state, number)
              lower.state = 'MERGED'
              lower.pullRequest = {...lower.pullRequest, merged: true}
            }
            const previous = requireStackMember(
              context.state,
              selectedNumber - 1
            )
            const mergedBranch = context.state.branches.get(
              previous.pullRequest.headRef
            )
            assert.ok(mergedBranch !== undefined)
            context.state.branches.set('main', {...mergedBranch, name: 'main'})
            const selected = requireStackMember(context.state, selectedNumber)
            selected.pullRequest = {...selected.pullRequest, baseRef: 'main'}
            context.state.pullRequest = selected.pullRequest
            const inputs = {enable_pr_stacks: 'true'}

            const result = await runMain(context, inputs)

            assertExit(context, result, 0)
            assertReason(context, result, 'deployment_ready')
            assertOutput(context, result, 'base_ref', 'main')
            assertOutput(context, result, 'ref', ref)
            assertOutput(context, result, 'sha', sha)
            assert.deepEqual(
              [...new Set(prechecksQueryNumbers(context))],
              [selectedNumber]
            )
            const deploymentBody = routeBody(
              context,
              'POST',
              apiPath('/deployments')
            )
            assert.equal(deploymentBody['ref'], sha)
            assert.equal(deploymentBody['auto_merge'], false)
            const deployment = requireDeployment(context)
            assert.equal(deployment.sha, sha)
            assert.ok(stackQueryRoutes(context).length >= 2)

            const post = await runPost(context, result, inputs)

            assertExit(context, post, 0)
            assert.equal(
              requireDeploymentStatus(context, deployment, 1).state,
              'success'
            )
            assert.equal(
              context.state.branches.has(lockBranch('production')),
              false
            )
          }
        )
      }
    }
  },
  {
    name: 'native PR stacks reject stale lower policy data',
    run: () =>
      withMockGitHub('native stack stale lower policy data', async context => {
        seedPrStack(context.state)
        requireStackMember(context.state, 1).graphqlCommitOid =
          ACCEPTANCE_SHAS.oldDeployment

        const result = await runMain(context, {enable_pr_stacks: 'true'})

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertNoDeployment(context, result)
        assertNoLockRoutes(context)
        assert.ok(prechecksQueryNumbers(context).includes(1))
        assertCommentIncludes(
          context,
          'could not verify this pull request stack'
        )
      })
  },
  {
    name: 'native PR stacks read every lower-layer CI page',
    run: () =>
      withMockGitHub('native stack lower CI pagination', async context => {
        seedPrStack(context.state)
        const lower = requireStackMember(context.state, 1)
        lower.rollupContexts = [
          ...Array.from({length: 100}, (_, index) => ({
            conclusion: 'SUCCESS',
            databaseId: index + 1,
            isRequired: true,
            name: `check-${String(index)}`,
            type: 'check-run' as const
          })),
          {
            conclusion: 'FAILURE',
            databaseId: 101,
            isRequired: true,
            name: 'late-failure',
            type: 'check-run'
          }
        ]

        const result = await runMain(context, {enable_pr_stacks: 'true'})

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertNoDeployment(context, result)
        assertNoLockRoutes(context)
        assert.ok(
          context.routeLog.some(
            route =>
              route.path === '/graphql' &&
              route.body.includes('C_acceptance_1') &&
              route.body.includes('"cursor":"100"')
          ),
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'native PR stacks reject invalid membership and ancestry',
    run: async () => {
      for (const failure of [
        'wrong trunk',
        'unregistered chain',
        'malformed response',
        'missing selected member',
        'cross-repository member',
        'non-linear stack',
        'behind trunk'
      ] as const) {
        await withMockGitHub(`native stack ${failure}`, async context => {
          const stack = seedPrStack(context.state)
          const lower = requireStackMember(context.state, 1)
          switch (failure) {
            case 'wrong trunk':
              addBranch(context.state, 'release')
              stack.baseRef = 'release'
              lower.pullRequest = {...lower.pullRequest, baseRef: 'release'}
              break
            case 'unregistered chain':
              context.state.prStack = null
              break
            case 'malformed response':
              context.state.prStackResponses.push({repository: null})
              break
            case 'missing selected member':
              context.state.pullRequestStackResponses.push({
                id: 1,
                number: 1,
                size: 3,
                position: 3,
                base: {ref: 'main', sha: ACCEPTANCE_SHAS.default}
              })
              stack.members = stack.members.filter(
                member =>
                  member.pullRequest.number !== context.state.pullRequest.number
              )
              break
            case 'cross-repository member':
              lower.pullRequest = {
                ...lower.pullRequest,
                headRepoFork: true,
                headRepoFullName: 'other/branch-deploy'
              }
              break
            case 'non-linear stack':
              requireStackMember(context.state, 2).baseSha =
                ACCEPTANCE_SHAS.default
              break
            case 'behind trunk':
              context.state.comparisonBehindBy = 1
              break
          }

          const result = await runMain(context, {enable_pr_stacks: 'true'})

          assertExit(context, result, 1)
          assertReason(context, result, 'prechecks_failed')
          assertNoDeployment(context, result)
          assertNoLockRoutes(context)
          if (failure === 'unregistered chain') {
            assertCommentIncludes(
              context,
              'not the default branch of this repository'
            )
            assert.deepEqual(stackQueryRoutes(context), [])
          }
          if (failure === 'missing selected member') {
            assert.equal(stackQueryRoutes(context).length, 1)
          }
        })
      }
    }
  },
  {
    name: 'native PR stacks reject moved lower members',
    run: () =>
      withMockGitHub('native stack lower member moves', async context => {
        seedPrStack(context.state)
        const original = mockPrStackResponse(
          context.state,
          'refs/heads/main',
          null
        )
        const lower = requireStackMember(context.state, 1)
        const previous = lower.pullRequest
        lower.pullRequest = {
          ...previous,
          headSha: ACCEPTANCE_SHAS.oldDeployment
        }
        const moved = mockPrStackResponse(
          context.state,
          'refs/heads/main',
          null
        )
        lower.pullRequest = previous
        context.state.prStackResponses.push(original, moved)

        const result = await runMain(context, {enable_pr_stacks: 'true'})

        assertExit(context, result, 1)
        assertReason(context, result, 'ref_changed')
        assert.equal(
          context.state.pullRequest.headSha,
          ACCEPTANCE_SHAS.stackTop
        )
        assertNoDeployment(context, result)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'native PR stacks ignore changes above the selected layer',
    run: () =>
      withMockGitHub('native stack upper member moves', async context => {
        seedPrStack(context.state, 2)
        const original = mockPrStackResponse(
          context.state,
          'refs/heads/main',
          null
        )
        const upper = requireStackMember(context.state, 3)
        const previous = upper.pullRequest
        upper.pullRequest = {
          ...previous,
          headSha: ACCEPTANCE_SHAS.oldDeployment
        }
        const moved = mockPrStackResponse(
          context.state,
          'refs/heads/main',
          null
        )
        upper.pullRequest = previous
        context.state.prStackResponses.push(original, moved)

        const result = await runMain(context, {enable_pr_stacks: 'true'})

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.stackMiddle)
        assert.equal(
          requireDeployment(context).sha,
          ACCEPTANCE_SHAS.stackMiddle
        )
      })
  },
  {
    name: 'native PR stacks can satisfy required deployment rules',
    run: () =>
      withMockGitHub(
        'native stack required production deployment',
        async context => {
          const stack = seedPrStack(context.state)
          context.state.branchRules = [
            {
              type: 'required_deployments',
              parameters: {required_deployment_environments: ['production']}
            }
          ]
          context.state.mergeStateStatus = 'BLOCKED'
          for (const member of stack.members) {
            member.mergeStateStatus = 'BLOCKED'
          }
          assert.equal(context.state.deployments.length, 0)

          const result = await runMain(context, {
            enable_pr_stacks: 'true',
            checks: 'required'
          })

          assertExit(context, result, 0)
          assertReason(context, result, 'deployment_ready')
          assert.equal(requireDeployment(context).environment, 'production')
          assert.equal(requireDeployment(context).sha, ACCEPTANCE_SHAS.stackTop)
          assert.equal(
            routeBody(context, 'POST', apiPath('/deployments'))['auto_merge'],
            false
          )
        }
      )
  },
  {
    name: 'trusted deployment template',
    run: () =>
      withMockGitHub('trusted deployment template', async context => {
        const templatePath = '.github/deployment_message.md'
        context.state.repositoryFiles.set(
          `${context.state.owner}/${context.state.repo}/${ACCEPTANCE_SHAS.default}/${templatePath}`,
          '### Trusted {{ environment }}\n\n{{ results }}\n\nTriggered by {{ actor }}'
        )
        setTriggerComment(context.state, '.deploy')

        const mainResult = await runMain(context)
        assertExit(context, mainResult, 0)
        const postResult = await runPost(
          context,
          mainResult,
          {deploy_message_path: templatePath},
          'success',
          'octocat',
          {DEPLOY_MESSAGE: 'deployed {{ actor }} unchanged'}
        )

        assertExit(context, postResult, 0)
        assertCommentIncludes(context, '### Trusted production')
        assertCommentIncludes(context, 'deployed {{ actor }} unchanged')
        const templateRoute = requireRoute(
          context,
          'GET',
          apiPath(`/contents/${encodeURIComponent(templatePath)}`)
        )
        assert.equal(
          templateRoute.query,
          `?ref=${ACCEPTANCE_SHAS.default}`,
          diagnostics(context, postResult)
        )
      })
  },
  {
    name: 'missing trusted template uses standard message',
    run: () =>
      withMockGitHub(
        'missing trusted template uses standard message',
        async context => {
          const templatePath = '.github/missing-deployment-message.md'
          setTriggerComment(context.state, '.deploy')
          const inputs = {deploy_message_path: templatePath}

          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)
          const postResult = await runPost(context, mainResult, inputs)

          assertExit(context, postResult, 0)
          assertCommentIncludes(context, '### Deployment Results ✅')
          const templateRoute = requireRoute(
            context,
            'GET',
            apiPath(`/contents/${encodeURIComponent(templatePath)}`)
          )
          assert.equal(
            templateRoute.query,
            `?ref=${ACCEPTANCE_SHAS.default}`,
            diagnostics(context, postResult)
          )
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, postResult)
          )
        }
      )
  },
  {
    name: 'invalid trusted template completes deployment cleanup',
    run: () =>
      withMockGitHub(
        'invalid trusted template completes deployment cleanup',
        async context => {
          const templatePath = '.github/deployment_message.md'
          context.state.repositoryFiles.set(
            `${context.state.owner}/${context.state.repo}/${ACCEPTANCE_SHAS.default}/${templatePath}`,
            '{% for item in items %}invalid{% endfor %}'
          )
          setTriggerComment(context.state, '.deploy')
          const inputs = {
            deploy_message_path: templatePath,
            successful_deploy_labels: 'deployed'
          }

          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)
          const deployment = requireDeployment(context)
          const postResult = await runPost(context, mainResult, inputs)

          assertExit(context, postResult, 1)
          assert.equal(
            postResult.stdout.includes(
              'Unsupported deployment template statement: for item in items'
            ),
            true,
            diagnostics(context, postResult)
          )
          assert.equal(
            requireDeploymentStatus(context, deployment, 1).state,
            'success'
          )
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, postResult)
          )
          assert.equal(context.state.labels.has('deployed'), true)
        }
      )
  },
  {
    name: 'invalid trusted template completes noop cleanup',
    run: () =>
      withMockGitHub(
        'invalid trusted template completes noop cleanup',
        async context => {
          const templatePath = '.github/deployment_message.md'
          context.state.repositoryFiles.set(
            `${context.state.owner}/${context.state.repo}/${ACCEPTANCE_SHAS.default}/${templatePath}`,
            '{% for item in items %}invalid{% endfor %}'
          )
          setTriggerComment(context.state, '.noop')
          const inputs = {
            deploy_message_path: templatePath,
            successful_noop_labels: 'noop-complete'
          }
          const mainResult = await runMain(context, inputs)
          assertExit(context, mainResult, 0)

          const postResult = await runPost(context, mainResult, inputs)

          assertExit(context, postResult, 1)
          assertNoDeployment(context, postResult)
          assert.equal(context.state.labels.has('noop-complete'), true)
          assert.equal(
            context.state.branches.has(lockBranch('production')),
            false,
            diagnostics(context, postResult)
          )
          assert.equal(
            postResult.stdout.includes(
              'Unsupported deployment template statement: for item in items'
            ),
            true,
            diagnostics(context, postResult)
          )
        }
      )
  },
  {
    name: 'trusted template API failure completes post cleanup',
    run: async () => {
      for (const [command, label] of [
        ['.deploy', 'deployed'],
        ['.noop', 'noop-complete']
      ] as const) {
        await withMockGitHub(
          `trusted template API failure completes ${command} cleanup`,
          async context => {
            const templatePath = '.github/deployment_message.md'
            setTriggerComment(context.state, command)
            const inputs = {
              deploy_message_path: templatePath,
              successful_deploy_labels: command === '.deploy' ? label : '',
              successful_noop_labels: command === '.noop' ? label : ''
            }
            const mainResult = await runMain(context, inputs)
            assertExit(context, mainResult, 0)
            queueFault(context.state, {
              method: 'GET',
              path: apiPath(`/contents/${encodeURIComponent(templatePath)}`),
              response: {message: 'template rejected', status: 403}
            })

            const postResult = await runPost(context, mainResult, inputs)

            assertExit(context, postResult, 1)
            assert.equal(context.state.labels.has(label), true)
            assert.equal(
              context.state.branches.has(lockBranch('production')),
              false,
              diagnostics(context, postResult)
            )
            assert.equal(
              postResult.stdout.includes('template rejected'),
              true,
              diagnostics(context, postResult)
            )
            if (command === '.noop') {
              assertNoDeployment(context, postResult)
            } else {
              assert.equal(
                requireDeploymentStatus(context, requireDeployment(context), 1)
                  .state,
                'success'
              )
            }
          }
        )
      }
    }
  },
  {
    name: 'mutable ref movement rejection',
    run: () =>
      withMockGitHub('mutable ref movement rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.pullRequestMoveSha = ACCEPTANCE_SHAS.default

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'ref_changed')
        assertNoDeployment(context, result)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'late mutable ref movement rejection',
    run: () =>
      withMockGitHub('late mutable ref movement rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.pullRequestMoveAfterReads = 3
        context.state.pullRequestMoveSha = ACCEPTANCE_SHAS.default

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'ref_changed')
        assertNoDeployment(context, result)
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'deployment SHA mismatch rejection',
    run: () =>
      withMockGitHub('deployment SHA mismatch rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.deploymentResponseSha = ACCEPTANCE_SHAS.default

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'deployment_sha_mismatch')
        const deployment = requireDeployment(context)
        assert.equal(
          requireDeploymentStatus(context, deployment, 0).state,
          'error'
        )
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          false,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'successful CI rerun replaces failure',
    run: () =>
      withMockGitHub('successful CI rerun replaces failure', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupState = 'FAILURE'
        context.state.rollupContexts = [
          {
            completedAt: '2026-01-01T00:01:00Z',
            conclusion: 'FAILURE',
            databaseId: 1,
            integrationId: 1,
            isRequired: true,
            name: 'acceptance',
            type: 'check-run'
          },
          {
            completedAt: '2026-01-01T00:02:00Z',
            conclusion: 'SUCCESS',
            databaseId: 2,
            integrationId: 1,
            isRequired: true,
            name: 'acceptance',
            type: 'check-run'
          }
        ]

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'commit_status', 'SUCCESS')
      })
  },
  {
    name: 'policy-excluded ambiguous GitHub App identities allow deployment',
    run: async () => {
      for (const {description, inputs, isRequired} of [
        {
          description: 'ignored check',
          inputs: {ignored_checks: 'excluded-check'},
          isRequired: true
        },
        {
          description: 'check outside an explicit list',
          inputs: {checks: 'required-check'},
          isRequired: true
        },
        {
          description: 'optional check in required mode',
          inputs: {checks: 'required'},
          isRequired: false
        }
      ] as const) {
        await withMockGitHub(
          `ambiguous GitHub App identity is ignored for ${description}`,
          async context => {
            setTriggerComment(context.state, '.deploy')
            context.state.rollupState = 'FAILURE'
            context.state.rollupContexts = [
              {
                conclusion: 'SUCCESS',
                databaseId: 12,
                integrationId: 1,
                isRequired: true,
                name: 'required-check',
                type: 'check-run'
              },
              {
                conclusion: 'FAILURE',
                databaseId: 10,
                integrationId: null,
                isRequired,
                name: 'excluded-check',
                type: 'check-run'
              },
              {
                conclusion: 'SUCCESS',
                databaseId: 11,
                integrationId: null,
                isRequired,
                name: 'excluded-check',
                type: 'check-run'
              }
            ]

            const result = await runMain(context, inputs)

            assertExit(context, result, 0)
            assertReason(context, result, 'deployment_ready')
            assertOutput(context, result, 'commit_status', 'SUCCESS')
            requireDeployment(context)
          }
        )
      }
    }
  },
  {
    name: 'ambiguous GitHub App identity fails closed for all check modes',
    run: async () => {
      for (const checks of ['all', 'required', 'required-check'] as const) {
        await withMockGitHub(
          `ambiguous GitHub App identity fails closed for ${checks} checks`,
          async context => {
            setTriggerComment(context.state, '.deploy')
            context.state.rollupState = 'FAILURE'
            context.state.rollupContexts = [
              {
                completedAt: '2026-01-01T00:01:00Z',
                conclusion: 'FAILURE',
                databaseId: 10,
                integrationId: null,
                isRequired: true,
                name: 'required-check',
                type: 'check-run'
              },
              {
                completedAt: '2026-01-01T00:02:00Z',
                conclusion: 'SUCCESS',
                databaseId: 11,
                integrationId: null,
                isRequired: true,
                name: 'required-check',
                type: 'check-run'
              }
            ]

            const result = await runMain(context, {checks})

            assertExit(context, result, 1)
            assertReason(context, result, 'prechecks_failed')
            assertOutput(context, result, 'commit_status', 'UNAVAILABLE')
            assertNoDeployment(context, result)
            assertNoLockRoutes(context)
            assertCommentIncludes(context, 'could not verify all CI checks')
          }
        )
      }
    }
  },
  {
    name: 'pending CI rerun replaces success',
    run: () =>
      withMockGitHub('pending CI rerun replaces success', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupState = 'SUCCESS'
        context.state.rollupContexts = [
          {
            completedAt: '2026-01-01T00:03:00Z',
            conclusion: 'SUCCESS',
            databaseId: 1,
            integrationId: 1,
            isRequired: true,
            name: 'acceptance',
            startedAt: '2026-01-01T00:00:00Z',
            type: 'check-run'
          },
          {
            conclusion: null,
            databaseId: 2,
            integrationId: 1,
            isRequired: true,
            name: 'acceptance',
            startedAt: '2026-01-01T00:01:00Z',
            type: 'check-run'
          }
        ]

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'commit_status', 'PENDING')
        assertNoDeployment(context, result)
      })
  },
  {
    name: 'CI failure rejection',
    run: () =>
      withMockGitHub('CI failure rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupState = 'FAILURE'
        context.state.rollupContexts = [
          {
            conclusion: 'FAILURE',
            isRequired: true,
            name: 'acceptance',
            type: 'check-run'
          }
        ]

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'commit_status', 'FAILURE')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'CI checks are failing')
      })
  },
  {
    name: 'CI failure on page two blocks deployment',
    run: () =>
      withMockGitHub(
        'CI failure on page two blocks deployment',
        async context => {
          setTriggerComment(context.state, '.deploy')
          context.state.rollupState = 'FAILURE'
          context.state.rollupContexts = [
            ...Array.from({length: 100}, (_, index) => ({
              conclusion: 'SUCCESS',
              databaseId: index + 1,
              isRequired: true,
              name: `healthy-${String(index)}`,
              type: 'check-run' as const
            })),
            {
              conclusion: 'FAILURE',
              databaseId: 101,
              isRequired: true,
              name: 'required-page-two',
              type: 'check-run'
            }
          ]

          const result = await runMain(context)

          assertExit(context, result, 1)
          assertReason(context, result, 'prechecks_failed')
          assertOutput(context, result, 'commit_status', 'FAILURE')
          assertNoDeployment(context, result)
          assert.equal(context.state.lockFiles.size, 0)
          assert.equal(
            context.routeLog.filter(route => route.path === '/graphql').length,
            2,
            diagnostics(context, result)
          )
          assert.equal(
            routeVariables(context, 'POST', '/graphql', 1)['commitId'],
            'C_acceptance'
          )
          assert.equal(
            routeVariables(context, 'POST', '/graphql', 1)['cursor'],
            '100'
          )
        }
      )
  },
  {
    name: 'CI pending rejection',
    run: () =>
      withMockGitHub('CI pending rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupState = 'PENDING'
        context.state.rollupContexts = [
          {
            conclusion: null,
            isRequired: true,
            name: 'acceptance',
            type: 'check-run'
          }
        ]

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'commit_status', 'PENDING')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'CI checks must be passing')
      })
  },
  {
    name: 'no CI checks with approval',
    run: () =>
      withMockGitHub('no CI checks with approval', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupState = null

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assert.equal(context.state.deployments.length, 1)
      })
  },
  {
    name: 'skip ci bypasses failing rollup',
    run: () =>
      withMockGitHub('skip ci bypasses failing rollup', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupState = 'FAILURE'

        const result = await runMain(context, {skip_ci: 'production'})

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'commit_status', 'skip_ci')
      })
  },
  {
    name: 'skip reviews bypasses review-required',
    run: () =>
      withMockGitHub('skip reviews bypasses review-required', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.reviewDecision = 'REVIEW_REQUIRED'

        const result = await runMain(context, {skip_reviews: 'production'})

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'review_decision', 'skip_reviews')
      })
  },
  {
    name: 'admin bypasses review-required',
    run: () =>
      withMockGitHub('admin bypasses review-required', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.reviewDecision = 'REVIEW_REQUIRED'

        const result = await runMain(context, {admins: 'octocat'})

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'review_decision', 'REVIEW_REQUIRED')
      })
  },
  {
    name: 'noop still waits for pending CI',
    run: () =>
      withMockGitHub('noop still waits for pending CI', async context => {
        setTriggerComment(context.state, '.noop')
        context.state.reviewDecision = 'REVIEW_REQUIRED'
        context.state.rollupState = 'PENDING'
        context.state.rollupContexts = [
          {
            conclusion: null,
            isRequired: true,
            name: 'acceptance',
            type: 'check-run'
          }
        ]

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'type', 'deploy')
        assertOutput(context, result, 'commit_status', 'PENDING')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'CI checks must be passing')
      })
  },
  {
    name: 'deployment order passes at selected SHA',
    run: () =>
      withMockGitHub(
        'deployment order passes at selected SHA',
        async context => {
          seedDeployment(context.state, ACCEPTANCE_SHAS.feature, 'development')
          setTriggerComment(context.state, '.deploy')

          const result = await runMain(context, {
            enforced_deployment_order: 'development,production'
          })

          assertExit(context, result, 0)
          assertReason(context, result, 'deployment_ready')
        }
      )
  },
  {
    name: 'deployment order rejects a newer unrelated deployment by default',
    run: () =>
      withMockGitHub(
        'deployment order rejects a newer unrelated deployment by default',
        async context => {
          seedDeployment(context.state, ACCEPTANCE_SHAS.feature, 'development')
          seedUnrelatedDeployment(
            context.state,
            ACCEPTANCE_SHAS.default,
            'development'
          )
          setTriggerComment(context.state, '.deploy')

          const result = await runMain(context, {
            enforced_deployment_order: 'development,production'
          })

          assertExit(context, result, 1)
          assertReason(context, result, 'deployment_order_failed')
          assertOutput(context, result, 'needs_to_be_deployed', 'development')
          assert.equal(context.state.deployments.length, 2)
        }
      )
  },
  {
    name: 'deployment order ignores a newer unrelated deployment when scoped',
    run: () =>
      withMockGitHub(
        'deployment order ignores a newer unrelated deployment when scoped',
        async context => {
          seedDeployment(context.state, ACCEPTANCE_SHAS.feature, 'development')
          seedUnrelatedDeployment(
            context.state,
            ACCEPTANCE_SHAS.default,
            'development'
          )
          setTriggerComment(context.state, '.deploy')

          const result = await runMain(context, {
            deployment_order_scope: 'branch-deploy',
            enforced_deployment_order: 'development,production'
          })

          assertExit(context, result, 0)
          assertReason(context, result, 'deployment_ready')
        }
      )
  },
  {
    name: 'deployment order rejects newest failed deployment',
    run: () =>
      withMockGitHub(
        'deployment order rejects newest failed deployment',
        async context => {
          seedDeployment(context.state, ACCEPTANCE_SHAS.feature, 'development')
          requireDeployment(context).statuses.push({
            environment: 'development',
            environmentUrl: null,
            id: context.state.nextStatusId,
            state: 'failure'
          })
          context.state.nextStatusId += 1
          setTriggerComment(context.state, '.deploy')

          const result = await runMain(context, {
            enforced_deployment_order: 'development,production'
          })

          assertExit(context, result, 1)
          assertReason(context, result, 'deployment_order_failed')
          assertOutput(context, result, 'needs_to_be_deployed', 'development')
          assert.equal(context.state.deployments.length, 1)
        }
      )
  },
  {
    name: 'deployment order rejects duplicate configuration',
    run: () =>
      withMockGitHub(
        'deployment order rejects duplicate configuration',
        async context => {
          setTriggerComment(context.state, '.deploy')

          const result = await runMain(context, {
            enforced_deployment_order: 'production,production'
          })

          assertExit(context, result, 1)
          assertReason(context, result, 'deployment_order_failed')
          assertCommentIncludes(context, 'contains duplicate environments')
          assertNoDeployment(context, result)
        }
      )
  },
  {
    name: 'deployment order rejects missing requested environment',
    run: () =>
      withMockGitHub(
        'deployment order rejects missing requested environment',
        async context => {
          setTriggerComment(context.state, '.deploy')

          const result = await runMain(context, {
            enforced_deployment_order: 'development,staging'
          })

          assertExit(context, result, 1)
          assertReason(context, result, 'deployment_order_failed')
          assertCommentIncludes(context, 'requested environment is not present')
          assertNoDeployment(context, result)
        }
      )
  },
  {
    name: 'outdated branch warn mode rejects',
    run: () =>
      withMockGitHub('outdated branch warn mode rejects', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.mergeStateStatus = 'BEHIND'

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'is_outdated', 'true')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'branch is behind the base branch')
      })
  },
  {
    name: 'outdated branch disabled mode continues',
    run: () =>
      withMockGitHub(
        'outdated branch disabled mode continues',
        async context => {
          setTriggerComment(context.state, '.deploy')
          context.state.mergeStateStatus = 'BEHIND'

          const result = await runMain(context, {update_branch: 'disabled'})

          assertExit(context, result, 0)
          assertReason(context, result, 'deployment_ready')
          assertOutput(context, result, 'is_outdated', 'true')
          assertOutput(context, result, 'merge_state_status', 'BEHIND')
        }
      )
  },
  {
    name: 'outdated branch force update exits',
    run: () =>
      withMockGitHub('outdated branch force update exits', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.mergeStateStatus = 'BEHIND'

        const result = await runMain(context, {update_branch: 'force'})

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'updated your branch with `main`')
      })
  },
  {
    name: 'outdated branch force update succeeds on retry',
    run: () =>
      withMockGitHub(
        'outdated branch force update succeeds on retry',
        async context => {
          setTriggerComment(context.state, '.deploy')
          context.state.mergeStateStatus = 'BEHIND'
          const inputs = {update_branch: 'force'}

          const updateResult = await runMain(context, inputs)
          assertExit(context, updateResult, 1)
          assertReason(context, updateResult, 'prechecks_failed')
          const updateRoute = requireRoute(
            context,
            'PUT',
            apiPath('/pulls/1/update-branch')
          )
          assert.equal(updateRoute.body, '', diagnostics(context, updateResult))
          assertNoDeployment(context, updateResult)

          context.state.mergeStateStatus = 'CLEAN'
          const retryResult = await runMain(context, inputs)
          assertExit(context, retryResult, 0)
          assertReason(context, retryResult, 'deployment_ready')
          assertOutput(context, retryResult, 'is_outdated', 'false')
          assert.equal(
            context.state.deployments.length,
            1,
            diagnostics(context, retryResult)
          )
        }
      )
  },
  {
    name: 'dirty merge state rejects',
    run: () =>
      withMockGitHub('dirty merge state rejects', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.mergeStateStatus = 'DIRTY'

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'merge_state_status', 'DIRTY')
        assertNoDeployment(context, result)
        assertCommentIncludes(
          context,
          'A merge commit cannot be cleanly created'
        )
      })
  },
  {
    name: 'deleted branch rejection',
    run: () =>
      withMockGitHub('deleted branch rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.branches.delete('feature-branch')

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertNoDeployment(context, result)
        assertCommentIncludes(
          context,
          'The branch for this pull request no longer exists'
        )
      })
  },
  {
    name: 'graphql commit mismatch rejection',
    run: () =>
      withMockGitHub('graphql commit mismatch rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.graphqlCommitOid = ACCEPTANCE_SHAS.default

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'does not match the commit sha')
      })
  },
  {
    name: 'exact SHA rejected without opt-in',
    run: () =>
      withMockGitHub('exact SHA rejected without opt-in', async context => {
        setTriggerComment(context.state, `.deploy ${ACCEPTANCE_SHAS.default}`)

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'sha deployments have not been enabled')
      })
  },
  {
    name: 'exact SHA explicit opt-in',
    run: () =>
      withMockGitHub('exact SHA explicit opt-in', async context => {
        setTriggerComment(context.state, `.deploy ${ACCEPTANCE_SHAS.default}`)

        const result = await runMain(context, {allow_sha_deployments: 'true'})

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'sha_deployment', ACCEPTANCE_SHAS.default)
        assertOutput(context, result, 'ref', ACCEPTANCE_SHAS.default)
        assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.default)
        assert.equal(requireDeployment(context).ref, ACCEPTANCE_SHAS.default)
      })
  },
  {
    name: 'required checks ignore optional failure',
    run: () =>
      withMockGitHub(
        'required checks ignore optional failure',
        async context => {
          setTriggerComment(context.state, '.deploy')
          context.state.rollupState = 'FAILURE'
          context.state.rollupContexts = [
            {
              conclusion: 'SUCCESS',
              isRequired: true,
              name: 'acceptance',
              type: 'check-run'
            },
            {
              conclusion: 'FAILURE',
              isRequired: false,
              name: 'optional-lint',
              type: 'check-run'
            }
          ]

          const result = await runMain(context, {checks: 'required'})

          assertExit(context, result, 0)
          assertReason(context, result, 'deployment_ready')
          assertOutput(context, result, 'commit_status', 'SUCCESS')
        }
      )
  },
  {
    name: 'ignored failing check allows all checks',
    run: () =>
      withMockGitHub(
        'ignored failing check allows all checks',
        async context => {
          setTriggerComment(context.state, '.deploy')
          context.state.rollupState = 'FAILURE'
          context.state.rollupContexts = [
            {
              conclusion: 'SUCCESS',
              isRequired: true,
              name: 'acceptance',
              type: 'check-run'
            },
            {
              conclusion: 'FAILURE',
              isRequired: true,
              name: 'flaky-ci',
              type: 'check-run'
            }
          ]

          const result = await runMain(context, {ignored_checks: 'flaky-ci'})

          assertExit(context, result, 0)
          assertReason(context, result, 'deployment_ready')
          assertOutput(context, result, 'commit_status', 'SUCCESS')
        }
      )
  },
  {
    name: 'explicit check list missing check',
    run: () =>
      withMockGitHub('explicit check list missing check', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupContexts = [
          {
            conclusion: 'SUCCESS',
            isRequired: true,
            name: 'security',
            type: 'check-run'
          }
        ]

        const result = await runMain(context, {checks: 'security,build'})

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'commit_status', 'MISSING')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'following checks are missing: `build`')
      })
  },
  {
    name: 'status context explicit check passes',
    run: () =>
      withMockGitHub('status context explicit check passes', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupContexts = [
          {
            context: 'legacy-ci',
            isRequired: true,
            state: 'SUCCESS',
            type: 'status-context'
          }
        ]

        const result = await runMain(context, {checks: 'legacy-ci'})

        assertExit(context, result, 0)
        assertReason(context, result, 'deployment_ready')
        assertOutput(context, result, 'commit_status', 'SUCCESS')
      })
  },
  {
    name: 'reaction failure is best effort',
    run: () =>
      withMockGitHub('reaction failure is best effort', async context => {
        setTriggerComment(context.state, '.help')
        context.state.failInitialReaction = true

        const result = await runMain(context)

        assertExit(context, result, 0)
        assertReason(context, result, 'help_completed')
        assertCommentIncludes(context, '## 📚 Branch Deployment Help')
        assert.equal(
          result.stdout.includes('failed to add the initial reaction'),
          true,
          diagnostics(context, result)
        )
      })
  },
  {
    name: 'mock branch protection and active rules pagination',
    run: () =>
      withMockGitHub(
        'mock branch protection and active rules pagination',
        async context => {
          const branchPath = apiPath('/branches/main')
          const unprotected = await getMockRoute(context.port, branchPath)
          assert.equal(unprotected.status, 200)
          const unprotectedBody = requireRecordValue(
            JSON.parse(unprotected.body),
            diagnostics(context)
          )
          assert.equal(unprotectedBody['protected'], false)
          assert.deepEqual(unprotectedBody['protection'], {
            enabled: false,
            required_status_checks: {
              enforcement_level: 'off',
              contexts: [],
              checks: []
            }
          })

          const checks = [
            {context: 'app-bound', app_id: 15368},
            {context: 'any-app', app_id: null},
            {context: 'legacy-any-app', app_id: -1}
          ]
          const contexts = [
            'app-bound',
            'any-app',
            'legacy-any-app',
            'legacy-context-only'
          ]
          setClassicRequiredChecks(context.state, checks, contexts)
          const protectedBranch = await getMockRoute(context.port, branchPath)
          assert.equal(protectedBranch.status, 200)
          const protectedBody = requireRecordValue(
            JSON.parse(protectedBranch.body),
            diagnostics(context)
          )
          assert.equal(protectedBody['protected'], true)
          assert.deepEqual(protectedBody['protection'], {
            enabled: true,
            required_status_checks: {
              enforcement_level: 'non_admins',
              contexts,
              checks
            }
          })

          context.state.branchRules = Array.from({length: 35}, (_, index) => ({
            type: 'deletion',
            ruleset_id: index + 1
          }))
          for (const [query, start, end] of [
            ['', 0, 30],
            ['?per_page=20&page=2', 20, 35],
            ['?per_page=20&page=3', 40, 60]
          ] as const) {
            const result = await getMockRoute(
              context.port,
              `${apiPath('/rules/branches/main')}${query}`
            )
            assert.equal(result.status, 200)
            const page: unknown = JSON.parse(result.body)
            assert.deepEqual(page, context.state.branchRules.slice(start, end))
          }
        }
      )
  },
  {
    name: 'mock GraphQL deployment lookup',
    run: () =>
      withMockGitHub('mock GraphQL deployment lookup', async context => {
        seedDeployment(context.state, ACCEPTANCE_SHAS.oldDeployment)
        seedDeployment(context.state, ACCEPTANCE_SHAS.feature, 'staging')
        requireDeployment(context, 1).statuses.push({
          environment: 'staging',
          environmentUrl: null,
          id: context.state.nextStatusId,
          state: 'failure'
        })
        context.state.nextStatusId += 1
        const query =
          'query($repo_owner:String!,$repo_name:String!,$environment:String!){repository(owner:$repo_owner,name:$repo_name){deployments(environments:[$environment],first:100,after:null,orderBy: { field: CREATED_AT, direction: DESC }){nodes{id state}}}}'
        const variables = {
          cursor: null,
          environment: 'production',
          first: 100,
          repo_name: ACCEPTANCE_REPOSITORY.repo,
          repo_owner: ACCEPTANCE_REPOSITORY.owner
        }

        const result = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query,
            variables
          }
        )

        assert.equal(result.status, 200, diagnostics(context))
        assert.equal(
          result.body.includes(ACCEPTANCE_SHAS.oldDeployment),
          true,
          diagnostics(context)
        )

        const inactiveResult = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query,
            variables: {...variables, environment: 'staging'}
          }
        )
        assert.equal(inactiveResult.status, 200, diagnostics(context))
        assert.equal(
          inactiveResult.body.includes('"state":"INACTIVE"'),
          true,
          diagnostics(context)
        )

        const invalidVariablesResult = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query,
            variables: {environment: 'production'}
          }
        )
        assert.equal(invalidVariablesResult.status, 500, diagnostics(context))
        assert.equal(
          invalidVariablesResult.body.includes(
            'expected string field: repo_owner'
          ),
          true,
          diagnostics(context)
        )
      })
  },
  {
    name: 'mock PR stack GraphQL contract',
    run: () =>
      withMockGitHub('mock PR stack GraphQL contract', async context => {
        const query = 'query BranchDeployPullRequestStack { repository { id } }'
        const variables = {
          owner: ACCEPTANCE_REPOSITORY.owner,
          repo: ACCEPTANCE_REPOSITORY.repo,
          pullNumber: context.state.pullRequest.number,
          stableRef: 'refs/heads/main',
          cursor: null
        }
        const responseRepository = (
          result: HttpResult
        ): Record<string, unknown> => {
          assert.equal(result.status, 200, diagnostics(context))
          const body = requireRecordValue(
            JSON.parse(result.body),
            diagnostics(context)
          )
          const data = requireRecordValue(body['data'], diagnostics(context))
          return requireRecordValue(data['repository'], diagnostics(context))
        }
        const standalone = responseRepository(
          await requestMockRoute(context.port, '/graphql', 'POST', {
            query,
            variables
          })
        )
        assert.equal(
          requireRecordValue(standalone['pullRequest'], diagnostics(context))[
            'stack'
          ],
          null
        )
        context.state.pullRequest = {
          ...context.state.pullRequest,
          merged: false
        }
        const missingStable = responseRepository(
          await requestMockRoute(context.port, '/graphql', 'POST', {
            query,
            variables: {...variables, stableRef: 'refs/heads/missing'}
          })
        )
        assert.equal(missingStable['ref'], null)

        for (const [override, error] of [
          [{owner: 'Other'}, 'unexpected pull request stack GraphQL variables'],
          [{repo: 'other'}, 'unexpected pull request stack GraphQL variables'],
          [
            {pullNumber: 999},
            'unexpected pull request stack GraphQL variables'
          ],
          [{cursor: 1}, 'unexpected pull request stack GraphQL cursor']
        ] as const) {
          const invalid = await requestMockRoute(
            context.port,
            '/graphql',
            'POST',
            {query, variables: {...variables, ...override}}
          )
          assert.equal(invalid.status, 500, diagnostics(context))
          assert.ok(invalid.body.includes(error), diagnostics(context))
        }

        const prechecksQuery =
          'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}'
        const prechecksVariables = {
          owner: ACCEPTANCE_REPOSITORY.owner,
          name: ACCEPTANCE_REPOSITORY.repo,
          number: 999
        }
        const noStackMember = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {query: prechecksQuery, variables: prechecksVariables}
        )
        assert.equal(noStackMember.status, 500, diagnostics(context))
        assert.ok(
          noStackMember.body.includes('unexpected prechecks GraphQL variables'),
          diagnostics(context)
        )

        const stack = seedPrStack(context.state)
        let previous = requireStackMember(context.state, 3)
        for (let number = 4; number <= 101; number += 1) {
          const headRef = `stack-${String(number)}`
          const member: MockStackMember = {
            ...previous,
            baseSha: previous.pullRequest.headSha,
            pullRequest: {
              ...previous.pullRequest,
              baseRef: previous.pullRequest.headRef,
              headLabel: `${ACCEPTANCE_REPOSITORY.owner}:${headRef}`,
              headRef,
              headSha: number.toString(16).padStart(40, '0'),
              number
            }
          }
          stack.members.push(member)
          previous = member
        }
        const stackedVariables = {
          ...variables,
          pullNumber: context.state.pullRequest.number
        }
        for (const [cursor, expectedLength, hasNextPage, endCursor] of [
          [null, 100, true, '100'],
          ['100', 1, false, null]
        ] as const) {
          const repository = responseRepository(
            await requestMockRoute(context.port, '/graphql', 'POST', {
              query,
              variables: {...stackedVariables, cursor}
            })
          )
          const pull = requireRecordValue(
            repository['pullRequest'],
            diagnostics(context)
          )
          const stackResponse = requireRecordValue(
            pull['stack'],
            diagnostics(context)
          )
          const entries = requireRecordValue(
            stackResponse['entries'],
            diagnostics(context)
          )
          const nodes = entries['nodes']
          assert.ok(Array.isArray(nodes), diagnostics(context))
          assert.equal(nodes.length, expectedLength)
          assert.deepEqual(entries['pageInfo'], {hasNextPage, endCursor})
        }

        for (const invalidVariables of [
          prechecksVariables,
          {...prechecksVariables, number: 1, name: 'other'}
        ]) {
          const invalid = await requestMockRoute(
            context.port,
            '/graphql',
            'POST',
            {query: prechecksQuery, variables: invalidVariables}
          )
          assert.equal(invalid.status, 500, diagnostics(context))
          assert.ok(
            invalid.body.includes('unexpected prechecks GraphQL variables'),
            diagnostics(context)
          )
        }
        const unknownPaginatedMember = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query:
              'query($commitId:ID!,$cursor:String!,$number:Int!){node(id:$commitId){... on Commit{statusCheckRollup{contexts(first:100,after:$cursor){nodes{id}}}}}}',
            variables: {commitId: 'C_missing', cursor: '100', number: 999}
          }
        )
        assert.equal(unknownPaginatedMember.status, 500, diagnostics(context))
        assert.ok(
          unknownPaginatedMember.body.includes(
            'unexpected paginated prechecks GraphQL variables'
          ),
          diagnostics(context)
        )

        const identical = await getMockRoute(
          context.port,
          apiPath(
            `/compare/${ACCEPTANCE_SHAS.default}...${ACCEPTANCE_SHAS.default}`
          )
        )
        assert.equal(identical.status, 200, diagnostics(context))
        assert.equal(
          requireRecordValue(JSON.parse(identical.body), diagnostics(context))[
            'status'
          ],
          'identical'
        )
      })
  },
  {
    name: 'mock server platform helpers',
    run: () => {
      assert.equal(
        mockServerPort({address: '127.0.0.1', family: 'IPv4', port: 1234}),
        1234
      )
      assert.throws(() => mockServerPort(null), /did not bind/u)
      assert.throws(() => mockServerPort('pipe'), /did not bind/u)
      assert.equal(mockServerCloseAction(undefined), 'resolve')
      assert.equal(mockServerCloseAction(new Error('close failed')), 'reject')
      assert.equal(mockErrorMessage(new Error('message')), 'message')
      assert.equal(mockErrorMessage('string failure'), 'string failure')
      assert.equal(mockHeaderValue('value'), 'value')
      assert.equal(mockHeaderValue(['first', 'second']), 'first,second')
      assert.equal(mockHeaderValue(undefined), '')
      assert.equal(progressDot(true), '\u001b[32m.\u001b[0m')
      assert.equal(progressDot(false), '\u001b[31m.\u001b[0m')
      const environmentName = 'BRANCH_DEPLOY_ACCEPTANCE_RESTORE_TEST'
      const previousValue = process.env[environmentName]
      restoreEnvironment(environmentName, 'restored')
      assert.equal(process.env[environmentName], 'restored')
      restoreEnvironment(environmentName, undefined)
      assert.equal(process.env[environmentName], undefined)
      restoreEnvironment(environmentName, previousValue)
      return Promise.resolve()
    }
  },
  {
    name: 'action process timeout',
    run: async () => {
      await assert.rejects(
        () =>
          runAcceptanceProcess(
            "process.stderr.write('waiting for timeout\\n');setInterval(() => {}, 1000)",
            {},
            250
          ),
        /action process timed out after 250ms[\s\S]*waiting for timeout/u
      )
    }
  },
  {
    name: 'runner environment isolation',
    run: () =>
      withMockGitHub('runner environment isolation', async context => {
        const poisonedEnvironment = {
          GITHUB_API_URL: process.env['GITHUB_API_URL'],
          INPUT_TRIGGER: process.env['INPUT_TRIGGER'],
          STATE_isPost: process.env['STATE_isPost']
        }
        process.env['GITHUB_API_URL'] = 'http://127.0.0.1:1'
        process.env['INPUT_TRIGGER'] = '.poison'
        process.env['STATE_isPost'] = 'true'
        try {
          setTriggerComment(context.state, '.help')
          const result = await runMain(context)
          assertExit(context, result, 0)
          assertReason(context, result, 'help_completed')
        } finally {
          for (const [name, value] of Object.entries(poisonedEnvironment)) {
            restoreEnvironment(name, value)
          }
        }
      })
  },
  {
    name: 'mock fault status matrix',
    run: () =>
      withMockGitHub('mock fault status matrix', async context => {
        for (const status of [403, 404, 409, 500]) {
          const path = apiPath(`/fault-${String(status)}`)
          queueFault(context.state, {
            method: 'GET',
            path,
            response: {message: `fault ${String(status)}`, status}
          })
          const result = await getMockRoute(context.port, path)
          assert.equal(result.status, status, diagnostics(context))
          assert.equal(
            result.body.includes(`fault ${String(status)}`),
            true,
            diagnostics(context)
          )
        }
        assert.equal(context.state.faults.length, 0)
      })
  },
  {
    name: 'mock server strict request validation',
    run: () =>
      withMockGitHub('mock server strict request validation', async context => {
        seedDeployment(context.state, ACCEPTANCE_SHAS.oldDeployment)
        const deployment = requireDeployment(context)
        context.state.comments.splice(0, context.state.comments.length)
        setTriggerComment(context.state, '.deploy')
        context.state.labels.add('deploying')
        const route = apiPath

        const malformedGraphql = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {variables: {}}
        )
        assert.equal(malformedGraphql.status, 500, diagnostics(context))
        assert.equal(
          malformedGraphql.body.includes('expected string field: query'),
          true,
          diagnostics(context)
        )

        const nonObjectJson = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          '[]'
        )
        assert.equal(nonObjectJson.status, 500, diagnostics(context))
        assert.equal(
          nonObjectJson.body.includes('expected JSON object request body'),
          true,
          diagnostics(context)
        )

        const unknownGraphql = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {query: 'query{viewer{login}}'}
        )
        assert.equal(unknownGraphql.status, 500, diagnostics(context))
        assert.equal(
          unknownGraphql.body.includes('Unhandled mock GitHub route'),
          true,
          diagnostics(context)
        )

        for (const query of [
          'query{repository{pullRequest(number:$number){id}}}',
          'query{repository{deployments(environments:[$environment]){nodes{id}}}}'
        ]) {
          const incompleteOperation = await requestMockRoute(
            context.port,
            '/graphql',
            'POST',
            {query}
          )
          assert.equal(incompleteOperation.status, 500, diagnostics(context))
          assert.equal(
            incompleteOperation.body.includes('Unhandled mock GitHub route'),
            true,
            diagnostics(context)
          )
        }

        const prechecksQuery =
          'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}'
        const invalidNumberVariable = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query: prechecksQuery,
            variables: {
              name: ACCEPTANCE_REPOSITORY.repo,
              number: '1',
              owner: ACCEPTANCE_REPOSITORY.owner
            }
          }
        )
        assert.equal(invalidNumberVariable.status, 500, diagnostics(context))
        assert.equal(
          invalidNumberVariable.body.includes('expected number field: number'),
          true,
          diagnostics(context)
        )

        const wrongPrechecksRepository = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query: prechecksQuery,
            variables: {
              name: ACCEPTANCE_REPOSITORY.repo,
              number: 1,
              owner: 'Other'
            }
          }
        )
        assert.equal(wrongPrechecksRepository.status, 500, diagnostics(context))
        assert.equal(
          wrongPrechecksRepository.body.includes(
            'unexpected prechecks GraphQL variables'
          ),
          true,
          diagnostics(context)
        )

        const wrongPaginatedCommit = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query:
              'query($commitId:ID!,$cursor:String!,$number:Int!){node(id:$commitId){... on Commit{statusCheckRollup{contexts(first:100,after:$cursor){nodes{id}}}}}}',
            variables: {commitId: 'C_other', cursor: '100', number: 1}
          }
        )
        assert.equal(wrongPaginatedCommit.status, 500, diagnostics(context))
        assert.equal(
          wrongPaginatedCommit.body.includes(
            'unexpected paginated prechecks GraphQL variables'
          ),
          true,
          diagnostics(context)
        )

        const deploymentQuery =
          'query($repo_owner:String!,$repo_name:String!,$environment:String!){repository(owner:$repo_owner,name:$repo_name){deployments(environments:[$environment],first:100,after:null,orderBy: { field: CREATED_AT, direction: DESC }){nodes{id}}}}'
        const wrongDeploymentRepository = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query: deploymentQuery,
            variables: {
              environment: 'production',
              repo_name: ACCEPTANCE_REPOSITORY.repo,
              repo_owner: 'Other'
            }
          }
        )
        assert.equal(
          wrongDeploymentRepository.status,
          500,
          diagnostics(context)
        )
        assert.equal(
          wrongDeploymentRepository.body.includes(
            'unexpected deployment GraphQL repository variables'
          ),
          true,
          diagnostics(context)
        )

        const invalidDeploymentCursor = await requestMockRoute(
          context.port,
          '/graphql',
          'POST',
          {
            query: deploymentQuery,
            variables: {
              cursor: 1,
              environment: 'production',
              first: 100,
              repo_name: ACCEPTANCE_REPOSITORY.repo,
              repo_owner: ACCEPTANCE_REPOSITORY.owner
            }
          }
        )
        assert.equal(invalidDeploymentCursor.status, 500, diagnostics(context))
        assert.equal(
          invalidDeploymentCursor.body.includes(
            'unexpected deployment GraphQL cursor variable'
          ),
          true,
          diagnostics(context)
        )

        const updateRefsQuery =
          'mutation($input:UpdateRefsInput!){updateRefs(input: $input){clientMutationId}}'
        const repositoryId = `R_${ACCEPTANCE_REPOSITORY.owner}_${ACCEPTANCE_REPOSITORY.repo}`
        addBranch(context.state, 'validation-lock')
        for (const [input, expectedError] of [
          [null, 'expected ref update input'],
          [
            {repositoryId: 'R_other', refUpdates: []},
            'unexpected ref update repository ID'
          ],
          [{repositoryId, refUpdates: []}, 'expected ref update'],
          [{repositoryId, refUpdates: null}, 'expected ref update'],
          [
            {
              repositoryId,
              refUpdates: [
                {
                  name: 'refs/heads/validation-lock',
                  beforeOid: ACCEPTANCE_SHAS.default,
                  afterOid: ACCEPTANCE_SHAS.feature
                }
              ]
            },
            'expected ref deletion'
          ]
        ] as const) {
          const invalidRefUpdate = await requestMockRoute(
            context.port,
            '/graphql',
            'POST',
            {query: updateRefsQuery, variables: {input}}
          )
          assert.equal(invalidRefUpdate.status, 500, diagnostics(context))
          assert.equal(
            invalidRefUpdate.body.includes(expectedError),
            true,
            diagnostics(context)
          )
        }

        const listedDeployments = await getMockRoute(
          context.port,
          route('/deployments')
        )
        assert.equal(listedDeployments.status, 200, diagnostics(context))
        assert.equal(
          listedDeployments.body.includes(String(deployment.id)),
          true,
          diagnostics(context)
        )
        const filteredDeployments = await getMockRoute(
          context.port,
          `${route('/deployments')}?environment=missing`
        )
        assert.equal(filteredDeployments.status, 200, diagnostics(context))
        assert.equal(filteredDeployments.body, '[]', diagnostics(context))

        const missingPart = await getMockRoute(context.port, '/repos')
        assert.equal(missingPart.status, 500, diagnostics(context))
        assert.equal(
          missingPart.body.includes('missing path segment 1'),
          true,
          diagnostics(context)
        )

        const wrongRepository = await getMockRoute(
          context.port,
          '/repos/Other/branch-deploy'
        )
        assert.equal(wrongRepository.status, 500, diagnostics(context))
        assert.equal(
          wrongRepository.body.includes('Unhandled mock GitHub route'),
          true,
          diagnostics(context)
        )

        const unknownArea = await getMockRoute(
          context.port,
          route('/unexpected')
        )
        assert.equal(unknownArea.status, 500, diagnostics(context))
        assert.equal(
          unknownArea.body.includes('Unhandled mock GitHub route'),
          true,
          diagnostics(context)
        )

        const missingCommit = await getMockRoute(
          context.port,
          route('/commits/missing')
        )
        assert.equal(missingCommit.status, 404, diagnostics(context))

        const defaultContentRef = await getMockRoute(
          context.port,
          route('/contents/lock.json')
        )
        assert.equal(defaultContentRef.status, 404, diagnostics(context))

        const missingComment = await requestMockRoute(
          context.port,
          route('/issues/comments/999'),
          'PATCH',
          {body: 'missing'}
        )
        assert.equal(missingComment.status, 404, diagnostics(context))
        assert.equal(
          missingComment.body.includes('Comment not found'),
          true,
          diagnostics(context)
        )

        const unpagedReactions = await getMockRoute(
          context.port,
          route('/issues/comments/1000/reactions')
        )
        assert.equal(unpagedReactions.status, 200, diagnostics(context))
        assert.equal(unpagedReactions.body, '[]', diagnostics(context))

        const invalidLabelPayload = await requestMockRoute(
          context.port,
          route('/issues/1/labels'),
          'POST',
          {labels: [1]}
        )
        assert.equal(invalidLabelPayload.status, 500, diagnostics(context))
        assert.equal(
          invalidLabelPayload.body.includes('expected string array field'),
          true,
          diagnostics(context)
        )

        const listedLabels = await getMockRoute(
          context.port,
          route('/issues/1/labels')
        )
        assert.equal(listedLabels.status, 200, diagnostics(context))
        assert.equal(
          listedLabels.body.includes('deploying'),
          true,
          diagnostics(context)
        )

        const deletedLabel = await requestMockRoute(
          context.port,
          route('/issues/1/labels/deploying'),
          'DELETE'
        )
        assert.equal(deletedLabel.status, 200, diagnostics(context))

        const unknownIssueRoute = await getMockRoute(
          context.port,
          route('/issues/1/milestones')
        )
        assert.equal(unknownIssueRoute.status, 500, diagnostics(context))

        const invalidTree = await requestMockRoute(
          context.port,
          route('/git/trees'),
          'POST',
          {base_tree: ACCEPTANCE_SHAS.default, tree: []}
        )
        assert.equal(invalidTree.status, 500, diagnostics(context))
        assert.equal(
          invalidTree.body.includes('expected tree item'),
          true,
          diagnostics(context)
        )

        const invalidTreeItem = await requestMockRoute(
          context.port,
          route('/git/trees'),
          'POST',
          {
            base_tree: ACCEPTANCE_SHAS.default,
            tree: [
              {
                mode: '100755',
                path: 'unexpected',
                sha: ACCEPTANCE_SHAS.default,
                type: 'blob'
              }
            ]
          }
        )
        assert.equal(invalidTreeItem.status, 500, diagnostics(context))
        assert.equal(
          invalidTreeItem.body.includes('unexpected lock tree item'),
          true,
          diagnostics(context)
        )

        const invalidBlobEncoding = await requestMockRoute(
          context.port,
          route('/git/blobs'),
          'POST',
          {content: '{}', encoding: 'base64'}
        )
        assert.equal(invalidBlobEncoding.status, 500, diagnostics(context))
        assert.equal(
          invalidBlobEncoding.body.includes('expected lock blob encoding'),
          true,
          diagnostics(context)
        )

        const duplicateRef = await requestMockRoute(
          context.port,
          route('/git/refs'),
          'POST',
          {ref: 'refs/heads/main', sha: ACCEPTANCE_SHAS.default}
        )
        assert.equal(duplicateRef.status, 422, diagnostics(context))

        const directRef = await requestMockRoute(
          context.port,
          route('/git/refs'),
          'POST',
          {ref: 'refs/heads/direct-ref', sha: ACCEPTANCE_SHAS.default}
        )
        assert.equal(directRef.status, 201, diagnostics(context))

        const missingRef = await requestMockRoute(
          context.port,
          route('/git/refs/heads%2Fmissing'),
          'DELETE'
        )
        assert.equal(missingRef.status, 422, diagnostics(context))

        const unknownGitRoute = await getMockRoute(
          context.port,
          route('/git/unexpected')
        )
        assert.equal(unknownGitRoute.status, 500, diagnostics(context))

        const invalidStatus = await requestMockRoute(
          context.port,
          route(`/deployments/${deployment.id}/statuses`),
          'POST',
          {environment: 'production', environment_url: 1, state: 'success'}
        )
        assert.equal(invalidStatus.status, 500, diagnostics(context))
        assert.equal(
          invalidStatus.body.includes('expected optional string field'),
          true,
          diagnostics(context)
        )

        const invalidDeploymentBoolean = await requestMockRoute(
          context.port,
          route('/deployments'),
          'POST',
          {
            auto_merge: 'true',
            environment: 'production',
            payload: {},
            production_environment: true,
            ref: 'main',
            required_contexts: []
          }
        )
        assert.equal(invalidDeploymentBoolean.status, 500, diagnostics(context))
        assert.equal(
          invalidDeploymentBoolean.body.includes('expected boolean field'),
          true,
          diagnostics(context)
        )

        const invalidDeploymentPayload = await requestMockRoute(
          context.port,
          route('/deployments'),
          'POST',
          {
            auto_merge: true,
            environment: 'production',
            payload: [],
            production_environment: true,
            ref: 'main',
            required_contexts: []
          }
        )
        assert.equal(invalidDeploymentPayload.status, 500, diagnostics(context))
        assert.equal(
          invalidDeploymentPayload.body.includes(
            'expected object field: payload'
          ),
          true,
          diagnostics(context)
        )

        const unknownDeployment = await requestMockRoute(
          context.port,
          route('/deployments/999/statuses'),
          'POST',
          {environment: 'production', state: 'success'}
        )
        assert.equal(unknownDeployment.status, 500, diagnostics(context))
        assert.equal(
          unknownDeployment.body.includes('unknown deployment id'),
          true,
          diagnostics(context)
        )

        const unknownDeploymentRoute = await getMockRoute(
          context.port,
          route('/deployments/999')
        )
        assert.equal(unknownDeploymentRoute.status, 500, diagnostics(context))
      })
  },
  {
    name: 'runner missing trigger diagnostics',
    run: () =>
      withMockGitHub('runner missing trigger diagnostics', async context => {
        context.state.comments.splice(0, context.state.comments.length)
        await assert.rejects(() => runMain(context), /missing trigger comment/u)
      })
  },
  {
    name: 'scenario failure diagnostics',
    run: async () => {
      await assert.rejects(
        () =>
          withMockGitHub('scenario failure diagnostics', () =>
            Promise.reject(new Error('intentional diagnostics failure'))
          ),
        /scenario failure diagnostics failed/u
      )
    }
  },
  {
    name: 'unknown mock route',
    run: () =>
      withMockGitHub('unknown mock route', async context => {
        const result = await getMockRoute(context.port, '/not-handled')

        assert.equal(result.status, 500, diagnostics(context))
        assert.equal(
          result.body.includes('Unhandled mock GitHub route'),
          true,
          diagnostics(context)
        )
      })
  }
] satisfies readonly Scenario[]

for (const scenario of scenarios) {
  try {
    await scenario.run()
    process.stdout.write(progressDot(true))
    /* node:coverage ignore next 4 */
  } catch (error) {
    process.stdout.write(`${progressDot(false)}\n`)
    throw new Error(`${scenario.name} failed\n${String(error)}`)
  }
}

process.stdout.write(`\nacceptance: ${scenarios.length} scenarios passed\n`)
