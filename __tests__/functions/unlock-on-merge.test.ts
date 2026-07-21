import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import type {
  SilentUnlockRequest,
  SilentUnlockResult
} from '../../src/functions/unlock.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  LockData,
  PullRequestContext
} from '../../src/types.ts'
import {createContext, createOctokit} from '../test-helpers.ts'
import {
  assertCalledWith,
  assertNotCalled,
  createMock,
  queueMockImplementation,
  installModuleMock
} from '../node-test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type CheckLockFile = typeof import('../../src/functions/check-lock-file.ts')
type Lock = typeof import('../../src/functions/lock.ts')

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const setOutputMock = createMock<ActionsCore['setOutput']>()
const warningMock = createMock<ActionsCore['warning']>()
const checkBranchMock = createMock<Lock['checkBranch']>()
const checkLockFileMock = createMock<CheckLockFile['checkLockFile']>()
const unlockMock =
  createMock<(request: SilentUnlockRequest) => Promise<SilentUnlockResult>>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  info: infoMock,
  setOutput: setOutputMock,
  warning: warningMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/check-lock-file.ts', import.meta.url),
  {checkLockFile: checkLockFileMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/lock.ts', import.meta.url),
  {checkBranch: checkBranchMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/unlock.ts', import.meta.url),
  {unlock: unlockMock}
)

const {unlockOnMerge} = await import('../../src/functions/unlock-on-merge.ts')

const environmentTargets = 'production,development,staging'
const matchingLock = {
  branch: 'acceptance-branch',
  created_at: '2025-01-01T00:00:00Z',
  created_by: 'octocat',
  environment: 'production',
  global: false,
  link: 'https://github.com/corp/test/pull/123#issuecomment-123456789',
  reason: null,
  sticky: true,
  unlock_command: '.unlock production'
} satisfies LockData

let context: PullRequestContext
let octokit: BranchDeployOctokit
let silentUnlockResult: SilentUnlockResult

function pullRequestContext(
  action: string,
  merged: boolean
): PullRequestContext {
  return {
    ...createContext({
      eventName: 'pull_request',
      issue: {number: 123},
      repo: {owner: 'corp', repo: 'test'}
    }),
    payload: {
      action,
      pull_request: {merged, number: 123}
    }
  }
}

beforeEach(() => {
  for (const mockFunction of [
    debugMock,
    infoMock,
    setOutputMock,
    warningMock,
    checkBranchMock,
    checkLockFileMock,
    unlockMock
  ]) {
    mockFunction.mock.resetCalls()
  }

  silentUnlockResult = 'removed lock - silent'
  unlockMock.mock.mockImplementation(() => Promise.resolve(silentUnlockResult))
  checkLockFileMock.mock.mockImplementation(() => Promise.resolve(matchingLock))
  checkBranchMock.mock.mockImplementation(() => Promise.resolve(true))

  context = pullRequestContext('closed', true)
  octokit = createOctokit()
})

test('successfully unlocks all environments on a pull request merge', async () => {
  assert.strictEqual(
    await unlockOnMerge(octokit, context, environmentTargets),
    true
  )
  assertCalledWith(
    infoMock,
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🔓 removed lock - environment: ${COLORS.highlight}development${COLORS.reset}`
  )
  assertCalledWith(
    infoMock,
    `🔓 removed lock - environment: ${COLORS.highlight}production${COLORS.reset}`
  )
  assertCalledWith(
    setOutputMock,
    'unlocked_environments',
    'production,development,staging'
  )
})

test('trims whitespace around environment targets before unlocking', async () => {
  assert.strictEqual(
    await unlockOnMerge(
      octokit,
      context,
      ' production ,\tdevelopment, staging '
    ),
    true
  )

  for (const environment of ['production', 'development', 'staging']) {
    assertCalledWith(
      checkBranchMock,
      octokit,
      context,
      `${environment}-branch-deploy-lock`
    )
    assertCalledWith(unlockMock, {
      octokit,
      context,
      reactionId: null,
      target: {type: 'environment', environment},
      mode: 'silent'
    })
  }

  assertCalledWith(
    setOutputMock,
    'unlocked_environments',
    'production,development,staging'
  )
})

test('finds that no deployment lock is set so none are removed', async () => {
  silentUnlockResult = 'no deployment lock currently set - silent'

  assert.strictEqual(
    await unlockOnMerge(octokit, context, environmentTargets),
    true
  )
  assertCalledWith(
    debugMock,
    'unlock result for unlock-on-merge: no deployment lock currently set - silent'
  )
  assertCalledWith(setOutputMock, 'unlocked_environments', '')
})

test('only unlocks one environment when another belongs to a different pull request and one has no lock file', async () => {
  queueMockImplementation(
    checkLockFileMock,
    () =>
      Promise.resolve({
        ...matchingLock,
        link: 'https://github.com/corp/test/pull/111#issuecomment-123456789'
      }),
    () => Promise.resolve(false)
  )

  assert.strictEqual(
    await unlockOnMerge(octokit, context, environmentTargets),
    true
  )
  assertCalledWith(
    infoMock,
    `⏩ lock for PR ${COLORS.info}111${COLORS.reset} (env: ${COLORS.highlight}production${COLORS.reset}) is not associated with PR ${COLORS.info}123${COLORS.reset} - skipping...`
  )
  assertCalledWith(
    infoMock,
    `⏩ no lock file found for environment ${COLORS.highlight}development${COLORS.reset} - skipping...`
  )
  assertCalledWith(
    infoMock,
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
  )
})

test('preserves legacy truthiness for malformed falsy lock data', async () => {
  queueMockImplementation(checkLockFileMock, () =>
    Promise.resolve(unsafeInvalidValue<LockData>(null))
  )

  assert.strictEqual(
    await unlockOnMerge(octokit, context, environmentTargets),
    true
  )
  assertCalledWith(
    infoMock,
    `⏩ no lock file found for environment ${COLORS.highlight}production${COLORS.reset} - skipping...`
  )
  assertCalledWith(
    setOutputMock,
    'unlocked_environments',
    'development,staging'
  )
})

test('only unlocks one environment when another belongs to a different pull request and one has no lock branch', async () => {
  queueMockImplementation(checkLockFileMock, () =>
    Promise.resolve({
      ...matchingLock,
      link: 'https://github.com/corp/test/pull/111#issuecomment-123456789'
    })
  )
  queueMockImplementation(
    checkBranchMock,
    () => Promise.resolve(true),
    () => Promise.resolve(false)
  )

  assert.strictEqual(
    await unlockOnMerge(octokit, context, environmentTargets),
    true
  )
  assertCalledWith(
    infoMock,
    `⏩ lock for PR ${COLORS.info}111${COLORS.reset} (env: ${COLORS.highlight}production${COLORS.reset}) is not associated with PR ${COLORS.info}123${COLORS.reset} - skipping...`
  )
  assertCalledWith(
    infoMock,
    `⏩ no lock branch found for environment ${COLORS.highlight}development${COLORS.reset} - skipping...`
  )
  assertCalledWith(
    infoMock,
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
  )
})

test('fails when the context is not a pull request merge', async () => {
  context = pullRequestContext('opened', false)

  assert.strictEqual(
    await unlockOnMerge(octokit, context, environmentTargets),
    false
  )
  assertCalledWith(
    infoMock,
    'event name: pull_request, action: opened, merged: false'
  )
  assertCalledWith(
    warningMock,
    `this workflow can only run in the context of a ${COLORS.highlight}merged${COLORS.reset} pull request`
  )
})

test('fails for a pull request closed without being merged', async () => {
  context = pullRequestContext('closed', false)

  assert.strictEqual(
    await unlockOnMerge(octokit, context, environmentTargets),
    false
  )
  assertCalledWith(
    warningMock,
    `this workflow can only run in the context of a ${COLORS.highlight}merged${COLORS.reset} pull request`
  )
  assertCalledWith(
    infoMock,
    'event name: pull_request, action: closed, merged: false'
  )
  assertCalledWith(
    infoMock,
    'pull request was closed but not merged so this workflow will not run - OK'
  )
})

for (const payload of [null, undefined]) {
  test(`safe-exits when the webhook payload is ${String(payload)}`, async () => {
    const malformedContext = unsafeInvalidValue<BranchDeployContext>({
      ...context,
      payload
    })
    assert.strictEqual(
      await unlockOnMerge(octokit, malformedContext, environmentTargets),
      false
    )
    assertCalledWith(
      infoMock,
      'event name: pull_request, action: undefined, merged: undefined'
    )
    assertNotCalled(checkBranchMock)
  })
}
