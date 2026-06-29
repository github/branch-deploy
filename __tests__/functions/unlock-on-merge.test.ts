import * as core from '../../src/actions-core.ts'
import {beforeEach, expect, test, vi} from 'vitest'
import * as unlockModule from '../../src/functions/unlock.ts'
import type {
  InteractiveUnlockRequest,
  SilentUnlockRequest,
  SilentUnlockResult
} from '../../src/functions/unlock.ts'
import * as checkLockFileModule from '../../src/functions/check-lock-file.ts'
import * as checkBranchModule from '../../src/functions/lock.ts'
import {unlockOnMerge} from '../../src/functions/unlock-on-merge.ts'
import {COLORS} from '../../src/functions/colors.ts'
import {createContext, createOctokit} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  LockData,
  PullRequestContext
} from '../../src/types.ts'

const setOutputMock = vi.spyOn(core, 'setOutput')
const infoMock = vi.spyOn(core, 'info')
const warningMock = vi.spyOn(core, 'warning')
const debugMock = vi.spyOn(core, 'debug')

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

function unlockMock(request: SilentUnlockRequest): Promise<SilentUnlockResult>
function unlockMock(request: InteractiveUnlockRequest): Promise<boolean>
function unlockMock(
  request: InteractiveUnlockRequest | SilentUnlockRequest
): Promise<boolean | SilentUnlockResult> {
  return Promise.resolve(request.mode === 'silent' ? silentUnlockResult : true)
}

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
  vi.clearAllMocks()

  silentUnlockResult = 'removed lock - silent'
  vi.spyOn(unlockModule, 'unlock').mockImplementation(unlockMock)
  vi.spyOn(checkLockFileModule, 'checkLockFile').mockResolvedValue(matchingLock)
  vi.spyOn(checkBranchModule, 'checkBranch').mockResolvedValue(true)

  context = pullRequestContext('closed', true)
  octokit = createOctokit()
})

test('successfully unlocks all environments on a pull request merge', async () => {
  expect(
    await unlockOnMerge(octokit, context, environmentTargets)
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}development${COLORS.reset}`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}production${COLORS.reset}`
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'production,development,staging'
  )
})

test('finds that no deployment lock is set so none are removed', async () => {
  silentUnlockResult = 'no deployment lock currently set - silent'

  expect(
    await unlockOnMerge(octokit, context, environmentTargets)
  ).toStrictEqual(true)
  expect(debugMock).toHaveBeenCalledWith(
    'unlock result for unlock-on-merge: no deployment lock currently set - silent'
  )
  expect(setOutputMock).toHaveBeenCalledWith('unlocked_environments', '')
})

test('only unlocks one environment when another belongs to a different pull request and one has no lock file', async () => {
  vi.mocked(checkLockFileModule.checkLockFile)
    .mockResolvedValueOnce({
      ...matchingLock,
      link: 'https://github.com/corp/test/pull/111#issuecomment-123456789'
    })
    .mockResolvedValueOnce(false)

  expect(
    await unlockOnMerge(octokit, context, environmentTargets)
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ lock for PR ${COLORS.info}111${COLORS.reset} (env: ${COLORS.highlight}production${COLORS.reset}) is not associated with PR ${COLORS.info}123${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ no lock file found for environment ${COLORS.highlight}development${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
  )
})

test('preserves legacy truthiness for malformed falsy lock data', async () => {
  vi.mocked(checkLockFileModule.checkLockFile).mockResolvedValueOnce(
    unsafeInvalidValue<LockData>(null)
  )

  expect(
    await unlockOnMerge(octokit, context, environmentTargets)
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ no lock file found for environment ${COLORS.highlight}production${COLORS.reset} - skipping...`
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'unlocked_environments',
    'development,staging'
  )
})

test('only unlocks one environment when another belongs to a different pull request and one has no lock branch', async () => {
  vi.mocked(checkLockFileModule.checkLockFile).mockResolvedValueOnce({
    ...matchingLock,
    link: 'https://github.com/corp/test/pull/111#issuecomment-123456789'
  })
  vi.mocked(checkBranchModule.checkBranch)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false)

  expect(
    await unlockOnMerge(octokit, context, environmentTargets)
  ).toStrictEqual(true)
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ lock for PR ${COLORS.info}111${COLORS.reset} (env: ${COLORS.highlight}production${COLORS.reset}) is not associated with PR ${COLORS.info}123${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ no lock branch found for environment ${COLORS.highlight}development${COLORS.reset} - skipping...`
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🔓 removed lock - environment: ${COLORS.highlight}staging${COLORS.reset}`
  )
})

test('fails when the context is not a pull request merge', async () => {
  context = pullRequestContext('opened', false)

  expect(
    await unlockOnMerge(octokit, context, environmentTargets)
  ).toStrictEqual(false)
  expect(infoMock).toHaveBeenCalledWith(
    'event name: pull_request, action: opened, merged: false'
  )
  expect(warningMock).toHaveBeenCalledWith(
    `this workflow can only run in the context of a ${COLORS.highlight}merged${COLORS.reset} pull request`
  )
})

test('fails for a pull request closed without being merged', async () => {
  context = pullRequestContext('closed', false)

  expect(
    await unlockOnMerge(octokit, context, environmentTargets)
  ).toStrictEqual(false)
  expect(warningMock).toHaveBeenCalledWith(
    `this workflow can only run in the context of a ${COLORS.highlight}merged${COLORS.reset} pull request`
  )
  expect(infoMock).toHaveBeenCalledWith(
    'event name: pull_request, action: closed, merged: false'
  )
  expect(infoMock).toHaveBeenCalledWith(
    'pull request was closed but not merged so this workflow will not run - OK'
  )
})

test.each([null, undefined])(
  'safe-exits when the webhook payload is %s',
  async payload => {
    const malformedContext = unsafeInvalidValue<BranchDeployContext>({
      ...context,
      payload
    })
    await expect(
      unlockOnMerge(octokit, malformedContext, environmentTargets)
    ).resolves.toBe(false)
    expect(infoMock).toHaveBeenCalledWith(
      'event name: pull_request, action: undefined, merged: undefined'
    )
    expect(vi.mocked(checkBranchModule.checkBranch)).not.toHaveBeenCalled()
  }
)
