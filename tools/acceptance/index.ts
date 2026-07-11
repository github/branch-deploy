import assert from 'node:assert/strict'
import {
  ACCEPTANCE_REPOSITORY,
  ACCEPTANCE_SHAS,
  createMockState,
  mockErrorMessage,
  mockHeaderValue,
  mockLockContents,
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
  MockDeployment,
  MockDeploymentStatus,
  MockGitHubState,
  MockRouteLog,
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
  sha = ACCEPTANCE_SHAS.default
): void {
  state.branches.set(name, {
    name,
    sha,
    treeSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
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
  actor = 'GrantBirki'
): Promise<AcceptanceRunResult> {
  return runAction({
    actor,
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
  status: 'failure' | 'success' = 'success',
  actor = 'GrantBirki'
): Promise<AcceptanceRunResult> {
  return runAction({
    actor,
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
        assert.equal(
          context.state.branches.has(lockBranch('production')),
          true,
          diagnostics(context, mainResult)
        )
        assertCommentIncludes(context, '### Deployment Triggered 🚀')

        const postResult = await runPost(context, mainResult, inputs)

        assertExit(context, postResult, 0)
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
        assert.equal(lock['created_by'], 'GrantBirki')
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
        assertCommentIncludes(context, 'currently claimed by __GrantBirki__')
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
        seedLock(context.state, 'production', 'feature-branch', 'GrantBirki', 1)
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
        assertCommentIncludes(context, '- __Created By__: `GrantBirki`')
      })
  },
  {
    name: '.wcid',
    run: () =>
      withMockGitHub('.wcid', async context => {
        seedLock(context.state, 'production', 'feature-branch', 'GrantBirki', 1)
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
        seedLock(context.state, 'production', 'feature-branch', 'GrantBirki', 1)
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
    name: 'unlock on merge',
    run: () =>
      withMockGitHub('unlock on merge', async context => {
        seedLock(context.state, 'production', 'feature-branch', 'GrantBirki', 1)
        seedLock(context.state, 'staging', 'other-branch', 'GrantBirki', 99)

        const result = await runMain(context, {
          environment_targets: 'production,staging',
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
      })
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
        assertCommentIncludes(context, 'Deployment confirmed by __GrantBirki__')
        assert.equal(context.state.deployments.length, 1)
      })
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
        assertCommentIncludes(context, 'Deployment rejected by __GrantBirki__')
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
          'fork_full_name',
          'fork-owner/actions-sandbox'
        )
        assertOutput(context, result, 'ref', ACCEPTANCE_SHAS.fork)
        assertOutput(context, result, 'sha', ACCEPTANCE_SHAS.fork)
      })
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
    name: 'CI failure rejection',
    run: () =>
      withMockGitHub('CI failure rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupState = 'FAILURE'

        const result = await runMain(context)

        assertExit(context, result, 1)
        assertReason(context, result, 'prechecks_failed')
        assertOutput(context, result, 'commit_status', 'FAILURE')
        assertNoDeployment(context, result)
        assertCommentIncludes(context, 'CI checks are failing')
      })
  },
  {
    name: 'CI pending rejection',
    run: () =>
      withMockGitHub('CI pending rejection', async context => {
        setTriggerComment(context.state, '.deploy')
        context.state.rollupState = 'PENDING'

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

        const result = await runMain(context, {admins: 'GrantBirki'})

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
          environment: 'production',
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

        const missingPart = await getMockRoute(context.port, '/repos')
        assert.equal(missingPart.status, 500, diagnostics(context))
        assert.equal(
          missingPart.body.includes('missing path segment 1'),
          true,
          diagnostics(context)
        )

        const wrongRepository = await getMockRoute(
          context.port,
          '/repos/Other/actions-sandbox'
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
