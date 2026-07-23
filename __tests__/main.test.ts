import assert from 'node:assert/strict'
import {afterEach, beforeEach, mock, test, type Mock} from 'node:test'
import {isDeepStrictEqual} from 'node:util'
import {COLORS} from '../src/functions/colors.ts'
import type {BranchDeployOctokit, OperationResultV1} from '../src/types.ts'
import {decodedJsonValue} from '../src/trust-boundaries.ts'
import {unsafeInvalidValue} from './unsafe-fixtures.ts'
import {
  assertCalledTimes,
  assertCalledWith,
  assertNotCalled,
  createMock,
  installModuleMock
} from './node-test-helpers.ts'

type ActionsCore = typeof import('../src/actions-core.ts')
type ActionStatusModule = typeof import('../src/functions/action-status.ts')
type BranchRulesetChecksModule =
  typeof import('../src/functions/branch-ruleset-checks.ts')
type CommitSafetyChecksModule =
  typeof import('../src/functions/commit-safety-checks.ts')
type ContextCheckModule = typeof import('../src/functions/context-check.ts')
type DeploymentConfirmationModule =
  typeof import('../src/functions/deployment-confirmation.ts')
type DeprecatedChecksModule =
  typeof import('../src/functions/deprecated-checks.ts')
type HelpModule = typeof import('../src/functions/help.ts')
type IdenticalCommitCheckModule =
  typeof import('../src/functions/identical-commit-check.ts')
type LockModule = typeof import('../src/functions/lock.ts')
type NakedCommandCheckModule =
  typeof import('../src/functions/naked-command-check.ts')
type PrechecksModule = typeof import('../src/functions/prechecks.ts')
type ReactEmoteModule = typeof import('../src/functions/react-emote.ts')
type TimestampModule = typeof import('../src/functions/timestamp.ts')
type UnlockModule = typeof import('../src/functions/unlock.ts')
type UnlockIfUnchangedModule =
  typeof import('../src/functions/unlock-if-unchanged.ts')
type InteractiveUnlockRequest =
  import('../src/functions/unlock.ts').InteractiveUnlockRequest
type SilentUnlockRequest =
  import('../src/functions/unlock.ts').SilentUnlockRequest
type SilentUnlockResult =
  import('../src/functions/unlock.ts').SilentUnlockResult
type UnlockOnMergeModule = typeof import('../src/functions/unlock-on-merge.ts')
type ValidDeploymentOrderModule =
  typeof import('../src/functions/valid-deployment-order.ts')
type ValidPermissionsModule =
  typeof import('../src/functions/valid-permissions.ts')

const actualCore = await import('../src/actions-core.ts')
const actualGithub = await import('@actions/github')
const githubContext = actualGithub.context

const setOutputMock = createMock<ActionsCore['setOutput']>()
const saveStateMock = createMock<ActionsCore['saveState']>()
const setFailedMock = createMock<ActionsCore['setFailed']>()
const infoMock = createMock<ActionsCore['info']>()
const debugMock = createMock<ActionsCore['debug']>()
const warningMock = createMock<ActionsCore['warning']>()
const errorMock = createMock<ActionsCore['error']>()
const actionStatusMock = createMock<ActionStatusModule['actionStatus']>()
const branchRulesetChecksMock =
  createMock<BranchRulesetChecksModule['branchRulesetChecks']>()
const commitSafetyChecksMock =
  createMock<CommitSafetyChecksModule['commitSafetyChecks']>()
const contextCheckMock = createMock<ContextCheckModule['contextCheck']>()
const deploymentConfirmationMock =
  createMock<DeploymentConfirmationModule['deploymentConfirmation']>()
const isDeprecatedMock = createMock<DeprecatedChecksModule['isDeprecated']>()
const helpMock = createMock<HelpModule['help']>()
const identicalCommitCheckMock =
  createMock<IdenticalCommitCheckModule['identicalCommitCheck']>()
const lockMock = createMock<LockModule['lock']>()
const nakedCommandCheckMock =
  createMock<NakedCommandCheckModule['nakedCommandCheck']>()
const prechecksMock = createMock<PrechecksModule['prechecks']>()
const reactEmoteMock = createMock<ReactEmoteModule['reactEmote']>()
const timestampMock = createMock<TimestampModule['timestamp']>()
const unlockMock = createMock<UnlockModule['unlock']>()
const unlockIfUnchangedMock =
  createMock<UnlockIfUnchangedModule['unlockIfUnchanged']>()
const unlockOnMergeMock = createMock<UnlockOnMergeModule['unlockOnMerge']>()
const validDeploymentOrderMock =
  createMock<ValidDeploymentOrderModule['validDeploymentOrder']>()
const validPermissionsMock =
  createMock<ValidPermissionsModule['validPermissions']>()

let octokit: BranchDeployOctokit = actualGithub.getOctokit('test-token')
const getOctokitMock = createMock<typeof actualGithub.getOctokit>(() => octokit)

installModuleMock(mock, '@actions/github', {
  context: githubContext,
  getOctokit: getOctokitMock
})
installModuleMock(mock, new URL('../src/actions-core.ts', import.meta.url), {
  ...actualCore,
  debug: debugMock,
  error: errorMock,
  info: infoMock,
  saveState: saveStateMock,
  setFailed: setFailedMock,
  setOutput: setOutputMock,
  warning: warningMock
})
installModuleMock(
  mock,
  new URL('../src/functions/action-status.ts', import.meta.url),
  {actionStatus: actionStatusMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/branch-ruleset-checks.ts', import.meta.url),
  {branchRulesetChecks: branchRulesetChecksMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/commit-safety-checks.ts', import.meta.url),
  {commitSafetyChecks: commitSafetyChecksMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/context-check.ts', import.meta.url),
  {contextCheck: contextCheckMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/deployment-confirmation.ts', import.meta.url),
  {deploymentConfirmation: deploymentConfirmationMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/deprecated-checks.ts', import.meta.url),
  {isDeprecated: isDeprecatedMock}
)
installModuleMock(mock, new URL('../src/functions/help.ts', import.meta.url), {
  help: helpMock
})
installModuleMock(
  mock,
  new URL('../src/functions/identical-commit-check.ts', import.meta.url),
  {identicalCommitCheck: identicalCommitCheckMock}
)
installModuleMock(mock, new URL('../src/functions/lock.ts', import.meta.url), {
  lock: lockMock
})
installModuleMock(
  mock,
  new URL('../src/functions/naked-command-check.ts', import.meta.url),
  {nakedCommandCheck: nakedCommandCheckMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/prechecks.ts', import.meta.url),
  {prechecks: prechecksMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/react-emote.ts', import.meta.url),
  {reactEmote: reactEmoteMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/timestamp.ts', import.meta.url),
  {timestamp: timestampMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/unlock.ts', import.meta.url),
  {unlock: unlockMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/unlock-if-unchanged.ts', import.meta.url),
  {unlockIfUnchanged: unlockIfUnchangedMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/unlock-on-merge.ts', import.meta.url),
  {unlockOnMerge: unlockOnMergeMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/valid-deployment-order.ts', import.meta.url),
  {validDeploymentOrder: validDeploymentOrderMock}
)
installModuleMock(
  mock,
  new URL('../src/functions/valid-permissions.ts', import.meta.url),
  {validPermissions: validPermissionsMock}
)

const {run} = await import('../src/main.ts')

type CreateDeployment = BranchDeployOctokit['rest']['repos']['createDeployment']
let createDeploymentMock: Mock<CreateDeployment> = mock.method(
  octokit.rest.repos,
  'createDeployment'
)

const permissionsMsg =
  '👋 __monalisa__, seems as if you have not admin/write permissions in this repo, permissions: read'

const mock_sha = 'abc123'
let selectedSha = mock_sha
let liveRefSha: string | null = null
let lateLiveRefSha: string | null = null
let pullRefReads = 0
let createdDeploymentSha: string | null = null
let deploymentStatusError: Error | null = null
let commentError: Error | null = null
let deploymentStatusRequests: unknown[] = []
let commitLogin: string | null = 'monalisa'
let deploymentMessage: string | null = null

const no_verification = {
  verified: false,
  reason: 'unsigned',
  signature: null,
  payload: null,
  verified_at: null
}

function setCommentBody(body: string): void {
  const comment = githubContext.payload.comment
  if (comment === undefined) throw new Error('missing test comment')
  comment['body'] = body
}

const environmentDefaults = {
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_RUN_ID: '12345',
  INPUT_GITHUB_TOKEN: 'faketoken',
  INPUT_TRIGGER: '.deploy',
  INPUT_REACTION: 'eyes',
  INPUT_UPDATE_BRANCH: 'warn',
  INPUT_ENVIRONMENT: 'production',
  INPUT_ENVIRONMENT_TARGETS: 'production,development,staging',
  INPUT_ENVIRONMENT_URLS: '',
  INPUT_PARAM_SEPARATOR: '|',
  INPUT_PRODUCTION_ENVIRONMENTS: 'production',
  INPUT_STABLE_BRANCH: 'main',
  INPUT_NOOP_TRIGGER: '.noop',
  INPUT_LOCK_TRIGGER: '.lock',
  INPUT_UNLOCK_TRIGGER: '.unlock',
  INPUT_HELP_TRIGGER: '.help',
  INPUT_LOCK_INFO_ALIAS: '.wcid',
  INPUT_REQUIRED_CONTEXTS: 'false',
  INPUT_ALLOW_FORKS: 'false',
  GITHUB_REPOSITORY: 'corp/test',
  INPUT_GLOBAL_LOCK_FLAG: '--global',
  INPUT_MERGE_DEPLOY_MODE: 'false',
  INPUT_UNLOCK_ON_MERGE_MODE: 'false',
  INPUT_STICKY_LOCKS: 'false',
  INPUT_STICKY_LOCKS_FOR_NOOP: 'false',
  INPUT_DISABLE_LOCK: 'false',
  INPUT_ALLOW_SHA_DEPLOYMENTS: 'false',
  INPUT_DISABLE_NAKED_COMMANDS: 'false',
  INPUT_OUTDATED_MODE: 'default_branch',
  INPUT_CHECKS: 'all',
  INPUT_ENFORCED_DEPLOYMENT_ORDER: '',
  INPUT_COMMIT_VERIFICATION: 'false',
  INPUT_IGNORED_CHECKS: '',
  INPUT_USE_SECURITY_WARNINGS: 'true',
  INPUT_ALLOW_NON_DEFAULT_TARGET_BRANCH_DEPLOYMENTS: 'false',
  INPUT_DEPLOYMENT_CONFIRMATION: 'false',
  INPUT_DEPLOYMENT_CONFIRMATION_TIMEOUT: '60'
} as const

const originalEnvironment = new Map(
  Object.keys(environmentDefaults).map(name => [name, process.env[name]])
)

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

function assertNotCalledWith<
  FunctionType extends (...arguments_: never[]) => unknown
>(mockFunction: Mock<FunctionType>, ...expected: readonly unknown[]): void {
  assert.ok(
    !mockFunction.mock.calls.some(call =>
      assertPartialArguments(call.arguments, expected)
    ),
    'expected mock not to have been called with the supplied arguments'
  )
}

function assertPartialArguments(
  actual: readonly unknown[],
  expected: readonly unknown[]
): boolean {
  return expected.every((value, index) => {
    if (value === String) return typeof actual[index] === 'string'
    return isDeepStrictEqual(actual[index], value)
  })
}

function setLockResult(result: Awaited<ReturnType<LockModule['lock']>>): void {
  lockMock.mock.mockImplementation(() => Promise.resolve(result))
}

function setPrechecksResult(
  result: Awaited<ReturnType<PrechecksModule['prechecks']>>
): void {
  if (result.status) selectedSha = result.sha
  prechecksMock.mock.mockImplementation(() => Promise.resolve(result))
}

function setValidPermissionsResult(
  result: Awaited<ReturnType<ValidPermissionsModule['validPermissions']>>
): void {
  validPermissionsMock.mock.mockImplementation(() => Promise.resolve(result))
}

function successfulUnlock(
  request: SilentUnlockRequest
): Promise<SilentUnlockResult>
function successfulUnlock(request: InteractiveUnlockRequest): Promise<boolean>
function successfulUnlock(
  request: InteractiveUnlockRequest | SilentUnlockRequest
): Promise<boolean | SilentUnlockResult> {
  return Promise.resolve(
    request.mode === 'silent' ? 'removed lock - silent' : true
  )
}

function failedUnlock(request: SilentUnlockRequest): Promise<SilentUnlockResult>
function failedUnlock(request: InteractiveUnlockRequest): Promise<boolean>
function failedUnlock(
  request: InteractiveUnlockRequest | SilentUnlockRequest
): Promise<boolean | SilentUnlockResult> {
  return Promise.resolve(
    request.mode === 'silent'
      ? 'failed to delete lock (bad status code) - silent'
      : false
  )
}

type ExpectedOperationResult = Pick<
  OperationResultV1,
  'decision' | 'operation' | 'reason_code'
> &
  Partial<
    Pick<
      OperationResultV1,
      'deployment_id' | 'deployment_type' | 'environment' | 'ref' | 'sha'
    >
  >

function assertOperationResult(expected: ExpectedOperationResult): void {
  const resultCalls = setOutputMock.mock.calls.filter(
    call => call.arguments[0] === 'result'
  )
  assert.strictEqual(resultCalls.length, 1)
  const serialized = String(resultCalls[0]?.arguments[1])
  const result = unsafeInvalidValue<OperationResultV1>(
    decodedJsonValue(serialized)
  )
  assert.deepStrictEqual(result, {
    schema_version: 1,
    decision: expected.decision,
    reason_code: expected.reason_code,
    operation: expected.operation,
    deployment_type: expected.deployment_type ?? null,
    environment: expected.environment ?? null,
    ref: expected.ref ?? null,
    sha: expected.sha ?? null,
    deployment_id: expected.deployment_id ?? null
  })
  assertCalledWith(setOutputMock, 'decision', result.decision)
  assertCalledWith(setOutputMock, 'reason_code', result.reason_code)
}

beforeEach(() => {
  commitLogin = 'monalisa'
  selectedSha = mock_sha
  liveRefSha = null
  lateLiveRefSha = null
  pullRefReads = 0
  createdDeploymentSha = null
  deploymentStatusError = null
  commentError = null
  deploymentStatusRequests = []
  deploymentMessage = null
  for (const [name, value] of Object.entries(environmentDefaults)) {
    process.env[name] = value
  }

  for (const mockFunction of [
    setOutputMock,
    setFailedMock,
    saveStateMock,
    infoMock,
    debugMock,
    warningMock,
    errorMock,
    actionStatusMock,
    branchRulesetChecksMock,
    commitSafetyChecksMock,
    contextCheckMock,
    deploymentConfirmationMock,
    isDeprecatedMock,
    helpMock,
    identicalCommitCheckMock,
    lockMock,
    nakedCommandCheckMock,
    prechecksMock,
    reactEmoteMock,
    timestampMock,
    unlockMock,
    unlockIfUnchangedMock,
    unlockOnMergeMock,
    validDeploymentOrderMock,
    validPermissionsMock,
    getOctokitMock
  ]) {
    mockFunction.mock.resetCalls()
  }

  githubContext.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy',
      id: 123,
      user: {
        login: 'monalisa'
      },
      created_at: '2024-10-21T19:11:18Z',
      updated_at: '2024-10-21T19:11:18Z',
      html_url: 'https://github.com/corp/test/pull/123#issuecomment-1231231231'
    }
  }

  githubContext.actor = 'monalisa'

  octokit = actualGithub.getOctokit('test-token')
  octokit.hook.wrap('request', (_request, options) => {
    let data: unknown = {}
    if (options.url.endsWith('/issues/{issue_number}/comments')) {
      if (commentError !== null) throw commentError
      data = {id: 123456}
    } else if (options.url.endsWith('/deployments')) {
      data =
        deploymentMessage === null
          ? {
              created_at: '2025-01-01T00:00:00Z',
              id: 123,
              sha: createdDeploymentSha ?? selectedSha,
              statuses_url: 'https://api.github.com/deployments/123/statuses',
              updated_at: '2025-01-01T00:00:00Z',
              url: 'https://api.github.com/deployments/123'
            }
          : {message: deploymentMessage}
    } else if (options.url.endsWith('/commits/{ref}')) {
      data = {
        sha: mock_sha,
        html_url: `https://github.com/corp/test/commit/${mock_sha}`,
        commit: {
          author: {date: '2024-10-15T12:00:00Z'},
          verification: no_verification
        },
        committer: commitLogin === null ? {} : {login: commitLogin}
      }
    } else if (options.url.endsWith('/pulls/{pull_number}')) {
      pullRefReads += 1
      data = {
        head: {
          ref: 'test-ref',
          sha:
            pullRefReads > 1 && lateLiveRefSha !== null
              ? lateLiveRefSha
              : (liveRefSha ?? selectedSha)
        }
      }
    } else if (options.url.endsWith('/branches/{branch}')) {
      data = {commit: {sha: liveRefSha ?? selectedSha}}
    } else if (options.url.endsWith('/deployments/{deployment_id}/statuses')) {
      if (deploymentStatusError !== null) throw deploymentStatusError
      deploymentStatusRequests.push(options)
      data = {id: 456, url: 'https://api.github.com/statuses/456'}
    }

    return {data, headers: {}, status: 200, url: options.url}
  })
  createDeploymentMock = mock.method(octokit.rest.repos, 'createDeployment')
  getOctokitMock.mock.mockImplementation(() => octokit)
  isDeprecatedMock.mock.mockImplementation(() => Promise.resolve(false))
  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.resolve('confirmed')
  )
  lockMock.mock.mockImplementation(() =>
    Promise.resolve({
      environment: 'production',
      global: false,
      globalFlag: '',
      lockData: null,
      status: true,
      lockRefSha: 'lock-commit-sha'
    })
  )
  contextCheckMock.mock.mockImplementation(() => true)
  reactEmoteMock.mock.mockImplementation(() => Promise.resolve(123))
  timestampMock.mock.mockImplementation(() => '2025-01-01T00:00:00.000Z')
  prechecksMock.mock.mockImplementation(() =>
    Promise.resolve({
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false,
      sha: mock_sha,
      isFork: false
    })
  )
  branchRulesetChecksMock.mock.mockImplementation(() =>
    Promise.resolve({success: true})
  )
  commitSafetyChecksMock.mock.mockImplementation(() => ({
    status: true,
    message: 'success',
    isVerified: true
  }))
  actionStatusMock.mock.mockImplementation(() => Promise.resolve())
  helpMock.mock.mockImplementation(() => Promise.resolve())
  identicalCommitCheckMock.mock.mockImplementation(() => Promise.resolve(true))
  nakedCommandCheckMock.mock.mockImplementation(() => Promise.resolve(false))
  unlockOnMergeMock.mock.mockImplementation(() => Promise.resolve(true))
  unlockMock.mock.mockImplementation(successfulUnlock)
  unlockIfUnchangedMock.mock.mockImplementation(() => Promise.resolve(true))
  validDeploymentOrderMock.mock.mockImplementation(() =>
    Promise.resolve({valid: true, results: []})
  )
  validPermissionsMock.mock.mockImplementation(() => Promise.resolve(true))
})

afterEach(() => {
  for (const [name, value] of originalEnvironment) setEnv(name, value)
})

test('successfully runs the action', async () => {
  assert.strictEqual(await run(), 'success')
  assertOperationResult({
    decision: 'continue',
    reason_code: 'deployment_ready',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: 'abc123',
    deployment_id: 123
  })
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'deployment_id', 123)
  assertCalledWith(saveStateMock, 'sha', 'abc123')
  assertCalledWith(debugMock, 'production_environment: true')
  assertNotCalledWith(saveStateMock, 'environment_url', String)
  assertNotCalledWith(setOutputMock, 'environment_url', String)
  assertCalledWith(
    infoMock,
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('successfully deploys without acquiring a lock when locking is disabled', async () => {
  setEnv('INPUT_DISABLE_LOCK', 'true')

  assert.strictEqual(await run(), 'success')
  assertOperationResult({
    decision: 'continue',
    reason_code: 'deployment_ready',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: 'abc123',
    deployment_id: 123
  })
  assertNotCalled(lockMock)
  assertNotCalled(unlockIfUnchangedMock)
  assertCalledWith(saveStateMock, 'disable_lock', true)
  assertCalledWith(
    infoMock,
    '🔓 deployment locking is disabled; skipping lock acquisition'
  )
})

test('rejects a moved ref without lock cleanup when locking is disabled', async () => {
  setEnv('INPUT_DISABLE_LOCK', 'true')
  liveRefSha = 'new-commit'

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'ref_changed',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: mock_sha
  })
  assertNotCalled(lockMock)
  assertNotCalled(unlockIfUnchangedMock)
  assertNotCalled(createDeploymentMock)
})

test('rejects a mutable PR ref that moves after prechecks', async () => {
  liveRefSha = 'new-commit'

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'ref_changed',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: mock_sha
  })
  assertCalledWith(
    unlockIfUnchangedMock,
    octokit,
    githubContext,
    'production',
    'lock-commit-sha'
  )
  assertNotCalled(createDeploymentMock)
  assertCalledWith(
    setFailedMock,
    'the selected deployment ref changed after prechecks'
  )
})

test('retains a sticky lock when a mutable ref moves', async () => {
  setEnv('INPUT_STICKY_LOCKS', 'true')
  liveRefSha = 'new-commit'

  assert.strictEqual(await run(), 'failure')
  assertNotCalled(unlockIfUnchangedMock)
})

test('rejects a mutable PR ref that moves after the started comment', async () => {
  lateLiveRefSha = 'new-commit'

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'ref_changed',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: mock_sha
  })
  assertNotCalled(createDeploymentMock)
  assertCalledTimes(unlockIfUnchangedMock, 1)
})

test('keeps ref_changed stable when reporting the failure is unavailable', async () => {
  liveRefSha = 'new-commit'
  actionStatusMock.mock.mockImplementation(() =>
    Promise.reject(new Error('comment unavailable'))
  )

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'ref_changed',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: mock_sha
  })
  assertCalledTimes(unlockIfUnchangedMock, 1)
  assertCalledWith(
    warningMock,
    'failed to report the changed deployment ref: comment unavailable'
  )
})

test('marks a deployment as error when GitHub resolves it to another SHA', async () => {
  createdDeploymentSha = 'unexpected-commit'

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'deployment_sha_mismatch',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: mock_sha,
    deployment_id: 123
  })
  const statusRequest = deploymentStatusRequests.at(-1)
  assert.ok(typeof statusRequest === 'object' && statusRequest !== null)
  assert.strictEqual(Reflect.get(statusRequest, 'state'), 'error')
  assertCalledWith(
    setFailedMock,
    'the created deployment SHA did not match the checked SHA'
  )
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('keeps deployment_sha_mismatch stable when failure reporting is unavailable', async () => {
  createdDeploymentSha = 'unexpected-commit'
  deploymentStatusError = new Error('status unavailable')
  actionStatusMock.mock.mockImplementation(() =>
    Promise.reject(new Error('comment unavailable'))
  )

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'deployment_sha_mismatch',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: mock_sha,
    deployment_id: 123
  })
  assertCalledTimes(unlockIfUnchangedMock, 1)
  assertCalledWith(
    warningMock,
    'failed to mark the mismatched deployment as an error: status unavailable'
  )
  assertCalledWith(
    warningMock,
    'failed to report the mismatched deployment: comment unavailable'
  )
})

test('cleans a non-sticky lock when deployment orchestration throws', async () => {
  commentError = new Error('comment unavailable')

  assert.strictEqual(await run(), undefined)
  assertOperationResult({
    decision: 'failure',
    reason_code: 'unexpected_error',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: mock_sha
  })
  assertCalledTimes(unlockIfUnchangedMock, 1)
})

test('preserves the missing run id fallback in the deployment payload', async () => {
  setEnv('GITHUB_RUN_ID', undefined)

  assert.strictEqual(await run(), 'success')
  const request = createDeploymentMock.mock.calls.at(-1)?.arguments[0]
  assert.ok(request !== undefined)
  assert.ok(typeof request.payload === 'object' && request.payload !== null)
  assert.ok(Number.isNaN(request.payload['github_run_id']))
})

for (const value of [
  'not-an-int',
  '10abc',
  '0',
  '-1',
  '9007199254740992'
] as const) {
  test(`fails the action early when deployment_confirmation_timeout is ${value}`, async () => {
    setEnv('INPUT_DEPLOYMENT_CONFIRMATION_TIMEOUT', value)

    assert.strictEqual(await run(), undefined)
    assertCalledWith(
      setFailedMock,
      'Invalid value for deployment_confirmation_timeout: must be a positive integer'
    )
    assertCalledWith(saveStateMock, 'bypass', 'true')
    assertNotCalledWith(
      infoMock,
      `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
    )
    assertNotCalledWith(
      infoMock,
      `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
    )
  })
}

test('successfully runs the action with deployment confirmation', async () => {
  setEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')

  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.resolve('confirmed')
  )

  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'deployment_id', 123)
  assertCalledWith(saveStateMock, 'sha', 'abc123')
  assertCalledWith(debugMock, 'production_environment: true')
  assertCalledWith(
    debugMock,
    'deploymentConfirmation() was successful - continuing with the deployment'
  )
  assertNotCalledWith(saveStateMock, 'environment_url', String)
  assertNotCalledWith(setOutputMock, 'environment_url', String)
  assertCalledWith(
    infoMock,
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('successfully runs the action with deployment confirmation and when the committer is not set', async () => {
  setEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')

  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.resolve('confirmed')
  )
  commitLogin = null

  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'deployment_id', 123)
  assertCalledWith(saveStateMock, 'sha', 'abc123')
  assertCalledWith(debugMock, 'production_environment: true')
  assertCalledWith(
    debugMock,
    'deploymentConfirmation() was successful - continuing with the deployment'
  )
  assertCalledWith(
    warningMock,
    '⚠️ could not find the login of the committer - https://github.com/github/branch-deploy/issues/379'
  )
  assertNotCalledWith(saveStateMock, 'environment_url', String)
  assertNotCalledWith(setOutputMock, 'environment_url', String)
  assertCalledWith(
    infoMock,
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('rejects the deployment when deployment confirmation is set, but does not succeed', async () => {
  setEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')

  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.resolve('rejected')
  )

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'confirmation_rejected',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: 'abc123'
  })
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertNotCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertNotCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'sha', 'abc123')
  assertNotCalledWith(debugMock, 'production_environment: true')
  assertCalledWith(debugMock, '❌ deployment not confirmed - exiting')
  assertNotCalledWith(saveStateMock, 'environment_url', String)
  assertNotCalledWith(setOutputMock, 'environment_url', String)
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertNotCalledWith(
    infoMock,
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
})

test('reports a timed-out confirmation and warns if non-sticky lock cleanup throws', async () => {
  setEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')
  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.resolve('timed_out')
  )
  unlockIfUnchangedMock.mock.mockImplementation(() =>
    Promise.reject(new Error('cleanup unavailable'))
  )

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'confirmation_timed_out',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: 'abc123'
  })
  assertCalledWith(
    warningMock,
    'failed to release the non-sticky deployment lock after confirmation did not complete: cleanup unavailable'
  )
})

test('warns when non-sticky confirmation cleanup returns a bad status', async () => {
  setEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')
  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.resolve('rejected')
  )
  unlockIfUnchangedMock.mock.mockImplementation(() => Promise.resolve(false))

  assert.strictEqual(await run(), 'failure')
  assertCalledWith(
    warningMock,
    'failed to release the non-sticky deployment lock after confirmation did not complete'
  )
})

test('leaves a non-sticky lock in place when acquisition returns no ref SHA', async () => {
  setEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')
  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.resolve('rejected')
  )
  setLockResult({
    environment: 'production',
    global: false,
    globalFlag: '',
    lockData: null,
    status: true
  })

  assert.strictEqual(await run(), 'failure')
  assertNotCalled(unlockIfUnchangedMock)
  assertCalledWith(
    warningMock,
    'failed to release the non-sticky deployment lock after confirmation did not complete: the original ref SHA was not returned'
  )
})

test('retains a sticky lock when deployment confirmation is rejected', async () => {
  setEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')
  setEnv('INPUT_STICKY_LOCKS', 'true')
  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.resolve('rejected')
  )

  assert.strictEqual(await run(), 'failure')
  assertNotCalled(unlockIfUnchangedMock)
})

test('cleans a non-sticky lock before propagating a confirmation error', async () => {
  setEnv('INPUT_DEPLOYMENT_CONFIRMATION', 'true')
  deploymentConfirmationMock.mock.mockImplementation(() =>
    Promise.reject(new Error('confirmation unavailable'))
  )

  assert.strictEqual(await run(), undefined)
  assertOperationResult({
    decision: 'failure',
    reason_code: 'unexpected_error',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: 'abc123'
  })
  assertCalledWith(
    unlockIfUnchangedMock,
    octokit,
    githubContext,
    'production',
    'lock-commit-sha'
  )
})

test('successfully runs the action on a deployment to development and with branch updates disabled', async () => {
  setEnv('INPUT_UPDATE_BRANCH', 'disabled')
  setCommentBody('.deploy to development')

  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(setOutputMock, 'comment_body', '.deploy to development')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'development')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'deployment_id', 123)
  assertCalledWith(debugMock, 'production_environment: false')
})

test('successfully runs the action in noop mode', async () => {
  setPrechecksResult({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: true,
    sha: 'deadbeef',
    isFork: false
  })

  setCommentBody('.noop')

  assert.strictEqual(await run(), 'success - noop')
  assertOperationResult({
    decision: 'continue',
    reason_code: 'noop_ready',
    operation: 'noop',
    deployment_type: 'noop',
    environment: 'production',
    ref: 'test-ref',
    sha: 'deadbeef'
  })
  assertCalledWith(setOutputMock, 'comment_body', '.noop')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', true)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', true)
  assertCalledWith(
    infoMock,
    `🧑‍🚀 commit sha to noop: ${COLORS.highlight}deadbeef${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🚀 ${COLORS.success}deployment started!${COLORS.reset} (noop)`
  )
})

test('successfully runs a noop without acquiring a lock when locking is disabled', async () => {
  setEnv('INPUT_DISABLE_LOCK', 'true')
  setPrechecksResult({
    ref: 'test-ref',
    status: true,
    message: 'approved',
    noopMode: true,
    sha: 'deadbeef',
    isFork: false
  })
  setCommentBody('.noop')

  assert.strictEqual(await run(), 'success - noop')
  assertOperationResult({
    decision: 'continue',
    reason_code: 'noop_ready',
    operation: 'noop',
    deployment_type: 'noop',
    environment: 'production',
    ref: 'test-ref',
    sha: 'deadbeef'
  })
  assertNotCalled(lockMock)
  assertNotCalled(unlockIfUnchangedMock)
  assertCalledWith(saveStateMock, 'disable_lock', true)
})

test('successfully runs the action in noop mode when using sticky_locks_for_noop set to true', async () => {
  setEnv('INPUT_STICKY_LOCKS_FOR_NOOP', 'true')
  prechecksMock.mock.mockImplementation(() =>
    Promise.resolve({
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true,
      sha: mock_sha,
      isFork: false
    })
  )

  setCommentBody('.noop')

  assert.strictEqual(await run(), 'success - noop')
  assertCalledWith(
    debugMock,
    `🔒 noop mode detected and using stickyLocks: true`
  )
  assertCalledWith(setOutputMock, 'comment_body', '.noop')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', true)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', true)
})

test('successfully runs the action with an environment url used', async () => {
  setEnv('INPUT_ENVIRONMENT_URLS', 'production|https://example.com')
  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'deployment_id', 123)
  assertCalledWith(saveStateMock, 'sha', 'abc123')
  assertCalledWith(saveStateMock, 'environment_url', 'https://example.com')
  assertCalledWith(setOutputMock, 'environment_url', 'https://example.com')
  assertCalledWith(debugMock, 'production_environment: true')
  assertCalledWith(
    infoMock,
    `🧑‍🚀 commit sha to deploy: ${COLORS.highlight}${mock_sha}${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🚀 ${COLORS.success}deployment started!${COLORS.reset}`
  )
})

test('runs the action and fails due to invalid environment deployment order', async () => {
  setEnv('INPUT_ENFORCED_DEPLOYMENT_ORDER', 'development,staging,production')

  validDeploymentOrderMock.mock.mockImplementation(() =>
    Promise.resolve({
      valid: false,
      results: [
        {environment: 'development', active: true},
        {environment: 'staging', active: false}
      ]
    })
  )

  prechecksMock.mock.mockImplementation(() =>
    Promise.resolve({
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false,
      sha: 'deadbeef',
      isFork: false
    })
  )

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'deployment_order_failed',
    operation: 'deploy',
    environment: 'production',
    ref: 'test-ref',
    sha: 'deadbeef'
  })
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'type', 'deploy')

  const deploymentOrderCall = validDeploymentOrderMock.mock.calls.at(-1)
  assert.ok(deploymentOrderCall !== undefined)
  assert.strictEqual(deploymentOrderCall.arguments[0], octokit)
  assert.strictEqual(deploymentOrderCall.arguments[1], githubContext)
  assert.deepStrictEqual(deploymentOrderCall.arguments.slice(2), [
    ['development', 'staging', 'production'],
    'production',
    'deadbeef'
  ])
})

test('runs the action and passes environment deployment order checks', async () => {
  setEnv('INPUT_ENFORCED_DEPLOYMENT_ORDER', 'development,staging,production')

  validDeploymentOrderMock.mock.mockImplementation(() =>
    Promise.resolve({
      valid: true,
      results: [
        {environment: 'development', active: true},
        {environment: 'staging', active: true}
      ]
    })
  )

  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'deployment_id', 123)
  assertCalledWith(debugMock, 'production_environment: true')
})

test('reports invalid deployment order configuration with a stable reason', async () => {
  setEnv('INPUT_ENFORCED_DEPLOYMENT_ORDER', 'production,production')
  validDeploymentOrderMock.mock.mockImplementation(() =>
    Promise.reject(
      new Error('The enforced deployment order contains duplicate environments')
    )
  )

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'deployment_order_failed',
    operation: 'deploy',
    environment: 'production',
    ref: 'test-ref',
    sha: mock_sha
  })
  assertCalledWith(
    setFailedMock,
    'The enforced deployment order contains duplicate environments'
  )
})

test('runs the action in lock mode and fails due to bad permissions', async () => {
  setEnv('INPUT_DISABLE_LOCK', 'true')
  setValidPermissionsResult(permissionsMsg)

  setCommentBody('.lock')

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'permission_denied',
    operation: 'lock'
  })
  assertCalledWith(setOutputMock, 'comment_body', '.lock')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(setFailedMock, permissionsMsg)
})

for (const [body, operation] of [
  ['.lock', 'lock'],
  ['.unlock', 'unlock'],
  ['.wcid', 'lock_info']
] as const) {
  test(`${body} reports that deployment locking is disabled`, async () => {
    setEnv('INPUT_DISABLE_LOCK', 'true')
    setCommentBody(body)

    assert.strictEqual(await run(), 'safe-exit')
    assertOperationResult({
      decision: 'complete',
      reason_code: 'locking_disabled',
      operation,
      environment: 'production'
    })
    assertCalledWith(actionStatusMock, {
      context: githubContext,
      octokit,
      reactionId: 123,
      message:
        '🔓 Deployment locking is disabled for this Action — lock/unlock commands have no effect.',
      result: 'alternate-success'
    })
    assertCalledWith(saveStateMock, 'bypass', 'true')
    assertNotCalled(lockMock)
    assertNotCalled(unlockMock)
  })
}

test('successfully runs the action in lock mode with a reason', async () => {
  setValidPermissionsResult(true)
  setLockResult({
    environment: 'production',
    global: false,
    globalFlag: '',
    lockData: null,
    status: true
  })

  setCommentBody('.lock --reason testing a new feature')

  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'complete',
    reason_code: 'lock_acquired',
    operation: 'lock',
    environment: 'production',
    ref: 'test-ref'
  })
  assertCalledWith(
    setOutputMock,
    'comment_body',
    '.lock --reason testing a new feature'
  )
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('reports an unexpected direct lock failure with collected context', async () => {
  setCommentBody('.lock')
  lockMock.mock.mockImplementation(() =>
    Promise.reject(new Error('lock unavailable'))
  )

  assert.strictEqual(await run(), undefined)
  assertOperationResult({
    decision: 'failure',
    reason_code: 'unexpected_error',
    operation: 'lock',
    environment: 'production',
    ref: 'test-ref'
  })
  assertCalledWith(setFailedMock, 'lock unavailable')
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('reports an already-owned direct lock', async () => {
  setCommentBody('.lock --reason all yours')
  setLockResult({
    status: 'owner',
    lockData: {
      branch: 'test-ref',
      created_at: '2025-01-01T00:00:00.000Z',
      created_by: 'monalisa',
      environment: 'production',
      global: false,
      link: 'https://github.com/corp/test/pull/123',
      reason: 'all yours',
      sticky: true,
      unlock_command: '.unlock production'
    },
    environment: 'production',
    global: false,
    globalFlag: '--global'
  })

  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'complete',
    reason_code: 'lock_already_owned',
    operation: 'lock',
    environment: 'production',
    ref: 'test-ref'
  })
})

test('reports a conflicting direct lock', async () => {
  setCommentBody('.lock')
  setLockResult({
    status: false,
    lockData: null,
    environment: 'production',
    global: false,
    globalFlag: '--global'
  })

  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'stop',
    reason_code: 'lock_conflict',
    operation: 'lock',
    environment: 'production',
    ref: 'test-ref'
  })
})

test('successfully runs the action in lock mode - details only', async () => {
  const infoSpy = infoMock
  const actionStatusSpy = actionStatusMock
  setValidPermissionsResult(true)
  setLockResult({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason:
        'routine `\n\n## Deployment approved\n[continue](https://example.com)',
      sticky: true,
      unlock_command: '.unlock production'
    },
    status: 'details-only',
    global: false,
    globalFlag: '--global',
    environment: 'production'
  })

  setCommentBody('.lock --details')

  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'complete',
    reason_code: 'lock_info_completed',
    operation: 'lock_info',
    environment: 'production'
  })
  assertCalledWith(setOutputMock, 'comment_body', '.lock --details')
  assertCalledWith(
    infoSpy,
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')
  const comment = actionStatusSpy.mock.calls.at(-1)?.arguments[0].message ?? ''
  assert.ok(
    comment.includes(
      '- __Reason__:\n\n      routine `\n      \n      ## Deployment approved\n      [continue](https://example.com)\n\n- __Branch__: `octocats-everywhere`'
    )
  )
  assert.ok(!comment.includes('\n## Deployment approved'))
  assert.ok(!comment.includes('\n[continue](https://example.com)'))
})

test('successfully runs the action in lock mode - details only - for the development environment', async () => {
  const infoSpy = infoMock
  setValidPermissionsResult(true)
  setLockResult({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      global: false,
      environment: 'development',
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock development'
    },
    status: 'details-only',
    global: false,
    globalFlag: '--global',
    environment: 'development'
  })
  setCommentBody('.lock development --details')
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(setOutputMock, 'comment_body', '.lock development --details')
  assertCalledWith(
    infoSpy,
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('successfully runs the action in lock mode - details only - --info flag', async () => {
  const infoSpy = infoMock
  setValidPermissionsResult(true)
  setLockResult({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock production'
    },
    status: 'details-only',
    global: false,
    globalFlag: '--global',
    environment: 'production'
  })
  setCommentBody('.lock --info')
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(setOutputMock, 'comment_body', '.lock --info')
  assertCalledWith(
    infoSpy,
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('successfully runs the action in lock mode - details only - lock alias wcid', async () => {
  const infoSpy = infoMock
  setValidPermissionsResult(true)
  setLockResult({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      environment: 'production',
      global: false,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock production'
    },
    environment: 'production',
    global: false,
    globalFlag: '--global',
    status: 'details-only'
  })

  setCommentBody('.wcid')
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(setOutputMock, 'comment_body', '.wcid')
  assertCalledWith(
    infoSpy,
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock-info-alias')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')

  assertNotCalled(validDeploymentOrderMock)
})

test('successfully runs the action in lock mode - details only - lock alias wcid - and finds a global lock', async () => {
  const infoSpy = infoMock
  setValidPermissionsResult(true)
  setLockResult({
    lockData: {
      branch: 'octocats-everywhere',
      created_at: '2022-06-14T21:12:14.041Z',
      created_by: 'octocat',
      global: true,
      environment: null,
      link: 'https://github.com/test-org/test-repo/pull/2#issuecomment-456',
      reason: 'Testing my new feature with lots of cats',
      sticky: true,
      unlock_command: '.unlock --global'
    },
    status: 'details-only',
    global: true,
    globalFlag: '--global',
    environment: null
  })
  setCommentBody('.wcid production')
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(setOutputMock, 'comment_body', '.wcid production')
  assertCalledWith(
    infoSpy,
    `🌏 there is a ${COLORS.highlight}global${COLORS.reset} deployment lock on this repository`
  )
  assertCalledWith(
    infoSpy,
    `🔒 the deployment lock is currently claimed by ${COLORS.highlight}octocat`
  )
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock-info-alias')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')

  assertNotCalled(validDeploymentOrderMock)
})

test('successfully runs the action in lock mode and finds no lock - details only', async () => {
  const infoSpy = infoMock
  setValidPermissionsResult(true)
  setLockResult({
    status: null,
    lockData: null,
    environment: 'production',
    global: false,
    globalFlag: '--global'
  })
  setCommentBody('.lock --details')
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(setOutputMock, 'comment_body', '.lock --details')
  assertCalledWith(infoSpy, '✅ no active deployment locks found')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')

  assertNotCalled(validDeploymentOrderMock)
})

test('successfully runs the action in lock mode and finds no GLOBAL lock - details only', async () => {
  const infoSpy = infoMock
  setValidPermissionsResult(true)
  setLockResult({
    status: null,
    lockData: null,
    environment: null,
    global: true,
    globalFlag: '--global'
  })
  setCommentBody('.lock --global --details')
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(setOutputMock, 'comment_body', '.lock --global --details')
  assertCalledWith(infoSpy, '✅ no active deployment locks found')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')

  assertNotCalled(validDeploymentOrderMock)
})

test('fails a lock details request when the lock state is ambiguous', async () => {
  setValidPermissionsResult(true)
  setLockResult({
    status: 'ambiguous',
    lockData: null,
    environment: 'production',
    global: false,
    globalFlag: '--global'
  })
  setCommentBody('.wcid')

  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'lock_conflict',
    operation: 'lock_info',
    environment: 'production'
  })
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertNotCalled(validDeploymentOrderMock)
})

test('fails to aquire the lock on a deploy so it exits', async () => {
  setLockResult({
    status: false,
    lockData: null,
    environment: 'production',
    global: false,
    globalFlag: ''
  })
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)

  assertNotCalled(validDeploymentOrderMock)
})

test('runs with the unlock trigger', async () => {
  setCommentBody('.unlock')
  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'complete',
    reason_code: 'unlock_completed',
    operation: 'unlock',
    environment: 'production'
  })
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'unlock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)

  assertNotCalled(validDeploymentOrderMock)
})

test('fails the action when an interactive unlock cannot delete the lock', async () => {
  setCommentBody('.unlock')
  unlockMock.mock.mockImplementation(failedUnlock)

  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'unlock_failed',
    operation: 'unlock',
    environment: 'production'
  })
  assertCalledWith(setFailedMock, 'failed to remove the deployment lock')
})

test('runs with the deprecated noop input', async () => {
  setCommentBody('.deploy noop')
  isDeprecatedMock.mock.mockImplementation(() => Promise.resolve(true))
  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'stop',
    reason_code: 'deprecated_command',
    operation: 'none'
  })
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'bypass', 'true')

  assertNotCalled(validDeploymentOrderMock)
})

test('runs with a naked command when naked commands are NOT allowed', async () => {
  setEnv('INPUT_DISABLE_NAKED_COMMANDS', 'true')
  setCommentBody('.deploy')
  nakedCommandCheckMock.mock.mockImplementation(() => Promise.resolve(true))
  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'stop',
    reason_code: 'naked_command_disabled',
    operation: 'none'
  })
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('successfully runs the action on a deployment to an exact sha in development with params', async () => {
  setEnv('INPUT_ALLOW_SHA_DEPLOYMENTS', 'true')
  setPrechecksResult({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc',
    isFork: false
  })

  setCommentBody(
    '.deploy 82c238c277ca3df56fe9418a5913d9188eafe3bc development | something1 something2 something3'
  )

  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(
    setOutputMock,
    'comment_body',
    '.deploy 82c238c277ca3df56fe9418a5913d9188eafe3bc development | something1 something2 something3'
  )
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'development')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'deployment_id', 123)
  assertCalledWith(debugMock, 'production_environment: false')
})

test('successfully runs the action on a deployment and parse the given parameters', async () => {
  setEnv('INPUT_ALLOW_SHA_DEPLOYMENTS', 'true')
  setPrechecksResult({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc',
    isFork: false
  })

  setCommentBody(
    '.deploy | --cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
  )
  const expectedParams = {
    _: [],
    cpu: 2, // Parser automatically cast to number
    memory: '4G',
    env: 'development',
    port: 8080, // Same here
    name: 'my-app',
    q: 'my-queue'
  }

  assert.strictEqual(await run(), 'success')
  assertCalledWith(
    setOutputMock,
    'params',
    '--cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
  )
  assertCalledWith(setOutputMock, 'parsed_params', expectedParams)
})

test('successfully runs the action after trimming the body', async () => {
  setPrechecksResult({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: true,
    sha: 'deadbeef',
    isFork: false
  })
  setCommentBody('.noop    \n\t\n   ')
  assert.strictEqual(await run(), 'success - noop')
  // other expects are similar to previous tests.
})

test('successfully runs the action with required contexts', async () => {
  setEnv('INPUT_REQUIRED_CONTEXTS', 'lint,test,build')
  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)

  assertNotCalled(validDeploymentOrderMock)
})

test('successfully runs the action with required contexts, explict checks, and some ignored checks', async () => {
  setEnv('INPUT_CHECKS', 'test,build')
  setEnv('INPUT_REQUIRED_CONTEXTS', 'lint,test,build')
  setEnv('INPUT_IGNORED_CHECKS', 'lint,foo')
  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'deployment_id', 123)
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'continue', 'true')
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)

  assertNotCalled(validDeploymentOrderMock)
})

test('detects an out of date branch and exits', async () => {
  deploymentMessage = 'Auto-merged'
  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'stop',
    reason_code: 'base_branch_update_required',
    operation: 'deploy',
    deployment_type: 'branch',
    environment: 'production',
    ref: 'test-ref',
    sha: 'abc123'
  })
  assertCalledWith(setOutputMock, 'comment_body', '.deploy')
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'ref', 'test-ref')
  assertCalledWith(setOutputMock, 'noop', false)
  assertCalledWith(setOutputMock, 'type', 'deploy')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'environment', 'production')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'ref', 'test-ref')
  assertCalledWith(saveStateMock, 'noop', false)
  assertCalledWith(saveStateMock, 'bypass', 'true')

  assertNotCalled(validDeploymentOrderMock)
})

test('fails when GitHub returns a deployment message other than auto-merge', async () => {
  deploymentMessage = 'Deployment could not be created'

  assert.strictEqual(await run(), undefined)
  assertOperationResult({
    decision: 'failure',
    reason_code: 'unexpected_error',
    operation: 'deploy',
    deployment_type: 'branch',
    deployment_id: null,
    environment: 'production',
    ref: 'test-ref',
    sha: 'abc123'
  })
  assertCalledWith(
    setFailedMock,
    'GitHub did not create a deployment: Deployment could not be created'
  )
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('fails due to a bad context', async () => {
  contextCheckMock.mock.mockImplementation(() => false)
  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'stop',
    reason_code: 'unsupported_event',
    operation: 'none'
  })
})

test('fails due to no valid environment targets being found in the comment body', async () => {
  setCommentBody('.deploy to chaos')
  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'stop',
    reason_code: 'invalid_environment',
    operation: 'deploy'
  })
  assertCalledWith(debugMock, 'No valid environment targets found')
})

test('fails due to no trigger being found', async () => {
  setEnv('INPUT_TRIGGER', '.shipit')
  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'stop',
    reason_code: 'no_trigger',
    operation: 'none'
  })
  assertCalledWith(infoMock, '⛔ no trigger detected in comment - exiting')
})

test('fails prechecks', async () => {
  setPrechecksResult({
    status: false,
    message: '### ⚠️ Cannot proceed with deployment... something went wrong'
  })
  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'prechecks_failed',
    operation: 'deploy',
    environment: 'production'
  })
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertCalledWith(
    setFailedMock,
    '### ⚠️ Cannot proceed with deployment... something went wrong'
  )

  assertNotCalled(validDeploymentOrderMock)
})

test('fails commitSafetyChecks', async () => {
  commitSafetyChecksMock.mock.mockImplementation(() => ({
    status: false,
    message:
      '### ⚠️ Cannot proceed with deployment... a scary commit was found',
    isVerified: false
  }))
  assert.strictEqual(await run(), 'failure')
  assertOperationResult({
    decision: 'failure',
    reason_code: 'commit_safety_failed',
    operation: 'deploy',
    environment: 'production',
    ref: 'test-ref',
    sha: 'abc123'
  })
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertCalledWith(
    setFailedMock,
    '### ⚠️ Cannot proceed with deployment... a scary commit was found'
  )

  assertNotCalled(validDeploymentOrderMock)
})

test('fails commitSafetyChecks but proceeds because the operation is on the stable branch', async () => {
  setCommentBody('.deploy main')
  commitSafetyChecksMock.mock.mockImplementation(() => ({
    status: false,
    message:
      '### ⚠️ Cannot proceed with deployment... a scary commit was found',
    isVerified: false
  }))
  assert.strictEqual(await run(), 'success')
  assertCalledWith(
    warningMock,
    'commit safety checks failed but the stable branch is being used so the workflow will continue - you should inspect recent commits on this branch as a precaution'
  )
})

test('runs the .help command successfully', async () => {
  setCommentBody('.help')
  assert.strictEqual(await run(), 'safe-exit')
  assertOperationResult({
    decision: 'complete',
    reason_code: 'help_completed',
    operation: 'help'
  })
  assertCalledWith(debugMock, 'help command detected')

  assertNotCalled(validDeploymentOrderMock)
})

test('runs the .help command successfully', async () => {
  setValidPermissionsResult(permissionsMsg)
  setCommentBody('.help')

  assert.strictEqual(await run(), 'failure')
  assertCalledWith(debugMock, 'help command detected')
  assertCalledWith(setFailedMock, permissionsMsg)
})

test('runs the action in lock mode and fails due to an invalid environment', async () => {
  setValidPermissionsResult(true)
  setCommentBody('.lock --details super-production')
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(
    debugMock,
    'No valid environment targets found for lock/unlock request'
  )
  assertCalledWith(
    setOutputMock,
    'comment_body',
    '.lock --details super-production'
  )
  assertCalledWith(setOutputMock, 'triggered', 'true')
  assertCalledWith(setOutputMock, 'comment_id', 123)
  assertCalledWith(setOutputMock, 'type', 'lock')
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'comment_id', 123)
  assertCalledWith(saveStateMock, 'bypass', 'true')
  setEnv('INPUT_GLOBAL_LOCK_FLAG', '')
})

test('successfully runs in mergeDeployMode', async () => {
  setEnv('INPUT_MERGE_DEPLOY_MODE', 'true')
  assert.strictEqual(await run(), 'success - merge deploy mode')
  assertOperationResult({
    decision: 'stop',
    reason_code: 'merge_deploy_not_required',
    operation: 'merge_deploy',
    environment: 'production'
  })
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertCalledWith(infoMock, `🏃 running in 'merge deploy' mode`)
})

test('continues mergeDeployMode when the default branch needs deployment', async () => {
  setEnv('INPUT_MERGE_DEPLOY_MODE', 'true')
  identicalCommitCheckMock.mock.mockImplementation(() => Promise.resolve(false))

  assert.strictEqual(await run(), 'success - merge deploy mode')
  assertOperationResult({
    decision: 'continue',
    reason_code: 'merge_deploy_required',
    operation: 'merge_deploy',
    environment: 'production'
  })
})

test('successfully runs in unlockOnMergeMode', async () => {
  setEnv('INPUT_UNLOCK_ON_MERGE_MODE', 'true')
  assert.strictEqual(await run(), 'success - unlock on merge mode')
  assertOperationResult({
    decision: 'complete',
    reason_code: 'unlock_on_merge_completed',
    operation: 'unlock_on_merge',
    environment: 'production'
  })
  assertCalledWith(infoMock, `🏃 running in 'unlock on merge' mode`)
  assertCalledWith(saveStateMock, 'bypass', 'true')
  assertNotCalled(validDeploymentOrderMock)
})

test('handles an input validation error and exits', async () => {
  setEnv('INPUT_UPDATE_BRANCH', 'badvalue')
  assert.strictEqual(await run(), undefined)
  assertOperationResult({
    decision: 'failure',
    reason_code: 'unexpected_error',
    operation: 'none'
  })
  assert.ok(setFailedMock.mock.callCount() > 0)
})

test('handles an unexpected error and exits', async () => {
  githubContext.payload = {}
  assert.strictEqual(await run(), undefined)
  assert.ok(setFailedMock.mock.callCount() > 0)
})

test('continues without a decorative reaction when no reaction id is returned', async () => {
  reactEmoteMock.mock.mockImplementation(() => Promise.resolve(null))
  assert.strictEqual(await run(), 'success')
  assertCalledWith(setOutputMock, 'initial_reaction_id', '')
  assertCalledWith(saveStateMock, 'reaction_id', '')
})

test('safe-exits when environment target parsing returns an empty target', async () => {
  setEnv('INPUT_ENVIRONMENT_TARGETS', '')
  assert.strictEqual(await run(), 'safe-exit')
  assertCalledWith(debugMock, 'No valid environment targets found')
  assertNotCalled(prechecksMock)
})

test('stores params and parsed params into context', async () => {
  setCommentBody('.deploy | something1 --foo=bar')
  const params = 'something1 --foo=bar'
  const parsed_params = {
    _: ['something1'],
    foo: 'bar'
  }
  assert.strictEqual(await run(), 'success')
  const request = createDeploymentMock.mock.calls.at(-1)?.arguments[0]
  assert.ok(request !== undefined)
  assert.partialDeepStrictEqual(request, {
    auto_merge: true,
    ref: 'test-ref',
    environment: 'production',
    owner: 'corp',
    repo: 'test',
    production_environment: true,
    required_contexts: [],
    payload: {
      params,
      parsed_params,
      sha: 'abc123',
      type: 'branch-deploy',
      github_run_id: 12345
    }
  })
  assertCalledWith(setOutputMock, 'params', params)
  assertCalledWith(setOutputMock, 'parsed_params', parsed_params)
})

test('stores params and parsed params into context with complex params', async () => {
  setPrechecksResult({
    ref: 'test-ref',
    status: true,
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    sha: 'deadbeef',
    isFork: false
  })

  setCommentBody(
    '.deploy | something1 --foo=bar --env.development=false --env.production=true LOG_LEVEL=debug,CPU_CORES=4 --config.db.host=localhost --config.db.port=5432'
  )
  const params =
    'something1 --foo=bar --env.development=false --env.production=true LOG_LEVEL=debug,CPU_CORES=4 --config.db.host=localhost --config.db.port=5432'
  const parsed_params = {
    _: ['something1', 'LOG_LEVEL=debug,CPU_CORES=4'],
    foo: 'bar',
    env: {
      development: 'false',
      production: 'true'
    },
    config: {
      db: {
        host: 'localhost',
        port: 5432
      }
    }
  }
  assert.strictEqual(await run(), 'success')
  const request = createDeploymentMock.mock.calls.at(-1)?.arguments[0]
  assert.ok(request !== undefined)
  assert.partialDeepStrictEqual(request, {
    auto_merge: true,
    ref: 'test-ref',
    environment: 'production',
    owner: 'corp',
    repo: 'test',
    production_environment: true,
    required_contexts: [],
    payload: {
      params,
      parsed_params,
      sha: 'deadbeef',
      type: 'branch-deploy',
      github_run_id: 12345,
      initial_comment_id: 123,
      initial_reaction_id: 123,
      deployment_started_comment_id: 123456,
      timestamp: '2025-01-01T00:00:00.000Z',
      commit_verified: true,
      actor: 'monalisa',
      stable_branch_used: false
    }
  })
  assertCalledWith(setOutputMock, 'params', params)
  assertCalledWith(setOutputMock, 'parsed_params', parsed_params)
})

test('renders arbitrary pre-deploy values as valid fenced JSON', async testContext => {
  const hostile = 'quote " slash \\ newline\nUnicode 🚀 and `````` backticks'
  const comment = githubContext.payload.comment
  if (comment === undefined) {
    throw new Error('missing test comment')
  }
  comment['created_at'] = hostile
  comment['updated_at'] = hostile
  comment['html_url'] = hostile
  const createCommentSpy = testContext.mock.method(
    octokit.rest.issues,
    'createComment'
  )

  assert.strictEqual(await run(), 'success')
  const request = createCommentSpy.mock.calls[0]?.arguments[0]
  const rendered = String(request?.body)
  const match = rendered.match(
    /<!--- pre-deploy-metadata-start -->\n\n(`{3,})json\n([\s\S]*?)\n\1\n\n<!--- pre-deploy-metadata-end -->/u
  )
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error('expected pre-deploy metadata block')
  }
  assert.ok(match[1].length > 6)
  const metadata = unsafeInvalidValue<{
    readonly context: {
      readonly comment: {
        readonly created_at: string
        readonly html_url: string
        readonly updated_at: string
      }
    }
  }>(decodedJsonValue(match[2]))
  assert.deepStrictEqual(metadata.context.comment, {
    created_at: hostile,
    updated_at: hostile,
    body: '.deploy',
    html_url: hostile
  })
})
