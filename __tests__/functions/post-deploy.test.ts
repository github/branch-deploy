import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import type {PostDeployOctokit} from '../../src/functions/post-deploy.ts'
import type {
  SilentUnlockRequest,
  SilentUnlockResult
} from '../../src/functions/unlock.ts'
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
import {
  assertCalledTimes,
  assertCalledWith,
  assertNotCalled,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type ActionStatus = typeof import('../../src/functions/action-status.ts')
type CreateDeploymentStatus = typeof import('../../src/functions/deployment.ts')
type Label = typeof import('../../src/functions/label.ts')
type Lock = typeof import('../../src/functions/lock.ts')
type PostDeployMessage =
  typeof import('../../src/functions/post-deploy-message.ts')

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const warningMock = createMock<ActionsCore['warning']>()
const setOutputMock = createMock<ActionsCore['setOutput']>()
const actionStatusMock = createMock<ActionStatus['actionStatus']>()
const createDeploymentStatusMock =
  createMock<CreateDeploymentStatus['createDeploymentStatus']>()
const labelMock = createMock<Label['label']>()
const lockMock = createMock<Lock['lock']>()
const postDeployMessageMock =
  createMock<PostDeployMessage['postDeployMessage']>()
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
  new URL('../../src/functions/action-status.ts', import.meta.url),
  {actionStatus: actionStatusMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/deployment.ts', import.meta.url),
  {createDeploymentStatus: createDeploymentStatusMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/label.ts', import.meta.url),
  {label: labelMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/lock.ts', import.meta.url),
  {lock: lockMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/post-deploy-message.ts', import.meta.url),
  {postDeployMessage: postDeployMessageMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/unlock.ts', import.meta.url),
  {unlock: unlockMock}
)

const {postDeploy} = await import('../../src/functions/post-deploy.ts')

const review_decision = 'APPROVED'

function createLockResponse(
  sticky: boolean
): Awaited<ReturnType<Lock['lock']>> {
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
  for (const mockFunction of [
    debugMock,
    infoMock,
    warningMock,
    setOutputMock,
    actionStatusMock,
    createDeploymentStatusMock,
    labelMock,
    lockMock,
    postDeployMessageMock,
    unlockMock
  ]) {
    mockFunction.mock.resetCalls()
  }

  actionStatusMock.mock.mockImplementation(() => Promise.resolve(undefined))
  labelMock.mock.mockImplementation(() =>
    Promise.resolve({added: [], removed: []})
  )
  postDeployMessageMock.mock.mockImplementation(() => 'Updated 1 server')
  lockMock.mock.mockImplementation(() =>
    Promise.resolve(createLockResponse(true))
  )
  createDeploymentStatusMock.mock.mockImplementation(() =>
    Promise.resolve({
      url: 'https://api.github.com/deployment-status/1',
      id: 1
    })
  )
  unlockMock.mock.mockImplementation(() =>
    Promise.resolve('removed lock - silent')
  )

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
    labels,
    review_decision,
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
  assert.strictEqual(await postDeploy(context, octokit, data), 'success')

  assertCalledWith(actionStatusMock, {
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  assertCalledWith(
    createDeploymentStatusMock,
    octokit,
    context,
    'test-ref',
    'success',
    '456',
    'production',
    null
  )
})

test('successfully completes a production branch deployment that fails', async () => {
  data.status = 'failure'

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')

  assertCalledWith(actionStatusMock, {
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'failure'
  })
  assertCalledWith(
    createDeploymentStatusMock,
    octokit,
    context,
    'test-ref',
    'failure',
    '456',
    'production',
    null
  )
})

test('successfully completes a production branch deployment with an environment url', async () => {
  data.environment_url = 'https://example.com'

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')
  assertCalledWith(actionStatusMock, {
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  assertCalledWith(
    createDeploymentStatusMock,
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
  lockMock.mock.mockImplementation(() =>
    Promise.resolve(createLockResponse(false))
  )

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')

  assertCalledTimes(lockMock, 1)
  assertCalledWith(actionStatusMock, {
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  assertCalledWith(
    createDeploymentStatusMock,
    octokit,
    context,
    'test-ref',
    'success',
    '456',
    'production',
    null
  )
  assertCalledWith(
    infoMock,
    `🧹 ${COLORS.highlight}non-sticky${COLORS.reset} lock detected, will remove lock`
  )
})

test('successfully completes a noop branch deployment and removes a non-sticky lock', async () => {
  lockMock.mock.mockImplementation(() =>
    Promise.resolve(createLockResponse(false))
  )
  data.noop = true

  assert.strictEqual(await postDeploy(context, octokit, data), 'success - noop')

  assertCalledTimes(lockMock, 1)
  assertCalledWith(actionStatusMock, {
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  assertCalledWith(
    infoMock,
    `🧹 ${COLORS.highlight}non-sticky${COLORS.reset} lock detected, will remove lock`
  )
})

test('successfully completes a noop branch deployment but does not get any lock data', async () => {
  lockMock.mock.mockImplementation(() =>
    Promise.resolve({
      environment: 'production',
      global: false,
      globalFlag: '',
      lockData: null,
      status: null
    })
  )
  data.noop = true

  assert.strictEqual(await postDeploy(context, octokit, data), 'success - noop')

  assertCalledTimes(lockMock, 1)
  assertCalledWith(actionStatusMock, {
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
  assertCalledWith(
    warningMock,
    '💡 a request to obtain the lock data returned null or undefined - the lock may have been removed by another process while this Action was running'
  )
})

for (const noop of [false, true]) {
  test(`stops ${noop ? 'noop' : 'deployment'} post processing for an ambiguous lock`, async () => {
    lockMock.mock.mockImplementation(() =>
      Promise.resolve({
        environment: 'production',
        global: false,
        globalFlag: '',
        lockData: null,
        status: 'ambiguous'
      })
    )
    data.noop = noop

    assert.strictEqual(await postDeploy(context, octokit, data), undefined)
    assertNotCalled(unlockMock)
    assertNotCalled(labelMock)
    assert.ok(
      !infoMock.mock.calls.some(call =>
        String(call.arguments[0]).includes('post deploy completed')
      )
    )
  })
}

test('successfully completes a production branch deployment with no custom message', async () => {
  assert.strictEqual(await postDeploy(context, octokit, data), 'success')
  assertCalledWith(actionStatusMock, {
    context,
    octokit,
    reactionId: 12345,
    message: 'Updated 1 server',
    result: 'success'
  })
})

test('successfully completes a noop branch deployment', async () => {
  data.noop = true
  assert.strictEqual(await postDeploy(context, octokit, data), 'success - noop')
})

test('successfully completes a noop branch deployment and applies success labels', async () => {
  data.labels.successful_noop = ['ready-for-review', 'noop-success']
  data.noop = true
  assert.strictEqual(await postDeploy(context, octokit, data), 'success - noop')
})

test('successfully completes a noop branch deployment and does not apply labels due to skip config', async () => {
  data.labels.successful_noop = ['ready-for-review', 'noop-success']
  data.labels.skip_successful_noop_labels_if_approved = true
  data.noop = true

  assert.strictEqual(await postDeploy(context, octokit, data), 'success - noop')

  assertCalledWith(
    infoMock,
    `⏩ skipping noop labels since the pull request is ${COLORS.success}approved${COLORS.reset} (based on your configuration)`
  )
})

test('successfully completes a branch deployment and does not apply labels due to skip config', async () => {
  data.labels.successful_deploy = ['ready-to-merge', 'deploy-success']
  data.labels.skip_successful_deploy_labels_if_approved = true

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')

  assertCalledWith(
    infoMock,
    `⏩ skipping deploy labels since the pull request is ${COLORS.success}approved${COLORS.reset} (based on your configuration)`
  )
})

test('successfully completes a noop branch deployment that fails and applies failure labels', async () => {
  data.labels.failed_noop = ['help', 'oh-no']
  data.noop = true
  data.status = 'failure'

  assert.strictEqual(await postDeploy(context, octokit, data), 'success - noop')

  assertCalledWith(debugMock, 'deploymentStatus: failure')
  assertCalledWith(debugMock, 'deployment mode: noop')
})

test('updates with a failure for a production branch deployment', async () => {
  data.status = 'failure'

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')
})

test('updates with an unknown for a production branch deployment', async () => {
  data.status = 'unknown'

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')
})

test('fails due to no comment_id', async () => {
  data.comment_id = ''

  await assert.rejects(postDeploy(context, octokit, data), {
    message: 'no comment_id provided'
  })
})

test('fails due to no status', async () => {
  data.status = ''
  await assert.rejects(postDeploy(context, octokit, data), {
    message: 'no status provided'
  })
})

test('fails due to no ref', async () => {
  data.ref = ''
  await assert.rejects(postDeploy(context, octokit, data), {
    message: 'no ref provided'
  })
})

test('fails due to no deployment_id', async () => {
  data.deployment_id = ''
  await assert.rejects(postDeploy(context, octokit, data), {
    message: 'no deployment_id provided'
  })
})

test('fails due to no environment', async () => {
  data.environment = ''
  await assert.rejects(postDeploy(context, octokit, data), {
    message: 'no environment provided'
  })
})

test('fails due to no reaction_id', async () => {
  data.reaction_id = ''
  await assert.rejects(postDeploy(context, octokit, data), {
    message: 'no reaction_id provided'
  })
})

test('fails due to no environment (noop)', async () => {
  data.environment = ''
  data.noop = true
  await assert.rejects(postDeploy(context, octokit, data), {
    message: 'no environment provided'
  })
})

test('fails due to no noop', async () => {
  data.noop = unsafeInvalidValue<boolean>(null)
  await assert.rejects(postDeploy(context, octokit, data), {
    message: 'no noop value provided'
  })
})
