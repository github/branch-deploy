import {
  postDeploy,
  type PostDeployOctokit
} from '../../src/functions/post-deploy.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import {COLORS} from '../../src/functions/colors.ts'
import * as actionStatus from '../../src/functions/action-status.ts'
import * as lock from '../../src/functions/lock.ts'
import * as unlock from '../../src/functions/unlock.ts'
import * as createDeploymentStatus from '../../src/functions/deployment.ts'
import * as postDeployMessage from '../../src/functions/post-deploy-message.ts'
import * as core from '../../src/actions-core.ts'
import * as label from '../../src/functions/label.ts'
import type {
  IssueCommentContext,
  PostDeployLabels,
  RawPostDeployData
} from '../../src/types.ts'
import {
  createIssueCommentContext,
  createOctokit,
  type DeepMutable
} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

const infoMock = vi.spyOn(core, 'info')
const debugMock = vi.spyOn(core, 'debug')
const warningMock = vi.spyOn(core, 'warning')

const review_decision = 'APPROVED'

function createLockResponse(
  sticky: boolean
): Awaited<ReturnType<typeof lock.lock>> {
  return {
    environment: 'production',
    global: false,
    globalFlag: '',
    lockData: {
      branch: 'test-ref',
      created_at: '2024-01-01T00:00:00Z',
      created_by: 'monalisa',
      environment: 'production',
      global: false,
      link: 'https://github.com/corp/test/pull/1',
      reason: 'test',
      sticky,
      unlock_command: '.unlock production'
    },
    status: 'owner'
  }
}

let octokit: PostDeployOctokit
let context: IssueCommentContext & {readonly workflow: string}
let labels: DeepMutable<PostDeployLabels>
let data: DeepMutable<RawPostDeployData>

beforeEach(() => {
  vi.clearAllMocks()

  vi.spyOn(actionStatus, 'actionStatus').mockResolvedValue(undefined)

  vi.spyOn(label, 'label').mockResolvedValue({added: [], removed: []})

  vi.spyOn(postDeployMessage, 'postDeployMessage').mockReturnValue(
    'Updated 1 server'
  )

  vi.spyOn(lock, 'lock').mockResolvedValue(createLockResponse(true))

  vi.spyOn(createDeploymentStatus, 'createDeploymentStatus').mockResolvedValue({
    url: 'https://api.github.com/deployment-status/1',
    id: 1
  })

  context = {
    ...createIssueCommentContext({
      actor: 'monalisa',
      repo: {owner: 'corp', repo: 'test'},
      issue: {number: 1},
      payload: {comment: {id: 1}}
    }),
    workflow: 'test-workflow'
  }

  octokit = createOctokit()

  labels = {
    successful_deploy: [],
    successful_noop: [],
    failed_deploy: [],
    failed_noop: [],
    skip_successful_noop_labels_if_approved: false,
    skip_successful_deploy_labels_if_approved: false
  }

  data = {
    sha: 'abc123',
    ref: 'test-ref',
    comment_id: '123',
    reaction_id: '12345',
    status: 'success',
    noop: false,
    deployment_id: '456',
    environment: 'production',
    environment_url: null,
    approved_reviews_count: '1',
    labels: labels,
    review_decision: review_decision,
    fork: false,
    params: 'LOG_LEVEL=debug --config.db.host=localhost --config.db.port=5432',
    parsed_params: JSON.stringify({
      config: {db: {host: 'localhost', port: 5432}},
      _: ['LOG_LEVEL=debug']
    }),
    commit_verified: false,
    deployment_start_time: '2024-01-01T00:00:00Z'
  }
})

test('successfully completes a production branch deployment', async () => {
  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = vi.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )
  expect(await postDeploy(context, octokit, data)).toBe('success')

  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  expect(createDeploymentStatusSpy).toHaveBeenCalled()
  expect(createDeploymentStatusSpy).toHaveBeenCalledWith(
    octokit,
    context,
    'test-ref',
    'success',
    '456',
    'production',
    null // environment_url
  )
})

test('successfully completes a production branch deployment that fails', async () => {
  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = vi.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )

  data.status = 'failure'

  expect(await postDeploy(context, octokit, data)).toBe('success')

  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'failure'
  })
  expect(createDeploymentStatusSpy).toHaveBeenCalled()
  expect(createDeploymentStatusSpy).toHaveBeenCalledWith(
    octokit,
    context,
    'test-ref',
    'failure',
    '456',
    'production',
    null // environment_url
  )
})

test('successfully completes a production branch deployment with an environment url', async () => {
  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = vi.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )

  data.environment_url = 'https://example.com'

  expect(await postDeploy(context, octokit, data)).toBe('success')
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  expect(createDeploymentStatusSpy).toHaveBeenCalledWith(
    octokit,
    context,
    'test-ref',
    'success',
    '456',
    'production',
    'https://example.com'
  )
})

test('successfully completes a production branch deployment and removes a non-sticky lock', async () => {
  const lockSpy = vi
    .spyOn(lock, 'lock')
    .mockResolvedValue(createLockResponse(false))

  vi.spyOn(unlock, 'unlock').mockResolvedValue(true)

  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = vi.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )
  expect(await postDeploy(context, octokit, data)).toBe('success')

  expect(lockSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  expect(createDeploymentStatusSpy).toHaveBeenCalled()
  expect(createDeploymentStatusSpy).toHaveBeenCalledWith(
    octokit,
    context,
    'test-ref',
    'success',
    '456',
    'production',
    null // environment_url
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🧹 ${COLORS.highlight}non-sticky${COLORS.reset} lock detected, will remove lock`
  )
})

test('successfully completes a noop branch deployment and removes a non-sticky lock', async () => {
  const lockSpy = vi
    .spyOn(lock, 'lock')
    .mockResolvedValue(createLockResponse(false))

  vi.spyOn(unlock, 'unlock').mockResolvedValue(true)

  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')

  data.noop = true

  expect(await postDeploy(context, octokit, data)).toBe('success - noop')

  expect(lockSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  expect(infoMock).toHaveBeenCalledWith(
    `🧹 ${COLORS.highlight}non-sticky${COLORS.reset} lock detected, will remove lock`
  )
})

test('successfully completes a noop branch deployment but does not get any lock data', async () => {
  const lockSpy = vi.spyOn(lock, 'lock').mockResolvedValue({
    environment: 'production',
    global: false,
    globalFlag: '',
    lockData: null,
    status: null
  })

  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')

  data.noop = true

  expect(await postDeploy(context, octokit, data)).toBe('success - noop')

  expect(lockSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  expect(warningMock).toHaveBeenCalledWith(
    '💡 a request to obtain the lock data returned null or undefined - the lock may have been removed by another process while this Action was running'
  )
})

test('successfully completes a production branch deployment with no custom message', async () => {
  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  expect(await postDeploy(context, octokit, data)).toBe('success')
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith({
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
})

test('successfully completes a noop branch deployment', async () => {
  data.noop = true
  expect(await postDeploy(context, octokit, data)).toBe('success - noop')
})

test('successfully completes a noop branch deployment and applies success labels', async () => {
  data.labels.successful_noop = ['ready-for-review', 'noop-success']
  data.noop = true
  expect(await postDeploy(context, octokit, data)).toBe('success - noop')
})

test('successfully completes a noop branch deployment and does not apply labels due to skip config', async () => {
  data.labels.successful_noop = ['ready-for-review', 'noop-success']
  data.labels.skip_successful_noop_labels_if_approved = true
  data.noop = true

  expect(await postDeploy(context, octokit, data)).toBe('success - noop')

  expect(infoMock).toHaveBeenCalledWith(
    `⏩ skipping noop labels since the pull request is ${COLORS.success}approved${COLORS.reset} (based on your configuration)`
  )
})

test('successfully completes a branch deployment and does not apply labels due to skip config', async () => {
  data.labels.successful_deploy = ['ready-to-merge', 'deploy-success']
  data.labels.skip_successful_deploy_labels_if_approved = true

  expect(await postDeploy(context, octokit, data)).toBe('success')

  expect(infoMock).toHaveBeenCalledWith(
    `⏩ skipping deploy labels since the pull request is ${COLORS.success}approved${COLORS.reset} (based on your configuration)`
  )
})

test('successfully completes a noop branch deployment that fails and applies failure labels', async () => {
  data.labels.failed_noop = ['help', 'oh-no']
  data.noop = true
  data.status = 'failure'

  expect(await postDeploy(context, octokit, data)).toBe('success - noop')

  expect(debugMock).toHaveBeenCalledWith('deploymentStatus: failure')
  expect(debugMock).toHaveBeenCalledWith('deployment mode: noop')
})

test('updates with a failure for a production branch deployment', async () => {
  data.status = 'failure'

  expect(await postDeploy(context, octokit, data)).toBe('success')
})

test('updates with an unknown for a production branch deployment', async () => {
  data.status = 'unknown'

  expect(await postDeploy(context, octokit, data)).toBe('success')
})

test('fails due to no comment_id', async () => {
  data.comment_id = ''

  await expect(postDeploy(context, octokit, data)).rejects.toThrow(
    'no comment_id provided'
  )
})

test('fails due to no status', async () => {
  data.status = ''
  await expect(postDeploy(context, octokit, data)).rejects.toThrow(
    'no status provided'
  )
})

test('fails due to no ref', async () => {
  data.ref = ''
  await expect(postDeploy(context, octokit, data)).rejects.toThrow(
    'no ref provided'
  )
})

test('fails due to no deployment_id', async () => {
  vi.resetAllMocks()
  data.deployment_id = ''
  await expect(postDeploy(context, octokit, data)).rejects.toThrow(
    'no deployment_id provided'
  )
})

test('fails due to no environment', async () => {
  vi.resetAllMocks()
  data.environment = ''
  await expect(postDeploy(context, octokit, data)).rejects.toThrow(
    'no environment provided'
  )
})

test('fails due to no reaction_id', async () => {
  vi.resetAllMocks()
  data.reaction_id = ''
  await expect(postDeploy(context, octokit, data)).rejects.toThrow(
    'no reaction_id provided'
  )
})

test('fails due to no environment (noop)', async () => {
  vi.resetAllMocks()
  data.environment = ''
  data.noop = true
  await expect(postDeploy(context, octokit, data)).rejects.toThrow(
    'no environment provided'
  )
})

test('fails due to no noop', async () => {
  vi.resetAllMocks()
  data.noop = unsafeInvalidValue<boolean>(null)
  await expect(postDeploy(context, octokit, data)).rejects.toThrow(
    'no noop value provided'
  )
})
