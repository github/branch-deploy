import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {COLORS} from '../../src/functions/colors.ts'
import type {PostDeployOctokit} from '../../src/functions/post-deploy.ts'
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
type TrustedDeploymentTemplate =
  typeof import('../../src/functions/trusted-deployment-template.ts')
type UnlockIfUnchanged =
  typeof import('../../src/functions/unlock-if-unchanged.ts')

const actualCore = await import('../../src/actions-core.ts')

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
const loadTrustedDeploymentTemplateMock =
  createMock<TrustedDeploymentTemplate['loadTrustedDeploymentTemplate']>()
const unlockIfUnchangedMock =
  createMock<UnlockIfUnchanged['unlockIfUnchanged']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  ...actualCore,
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
  new URL(
    '../../src/functions/trusted-deployment-template.ts',
    import.meta.url
  ),
  {loadTrustedDeploymentTemplate: loadTrustedDeploymentTemplateMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/unlock-if-unchanged.ts', import.meta.url),
  {unlockIfUnchanged: unlockIfUnchangedMock}
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
    loadTrustedDeploymentTemplateMock,
    unlockIfUnchangedMock
  ]) {
    mockFunction.mock.resetCalls()
  }

  actionStatusMock.mock.mockImplementation(() => Promise.resolve(undefined))
  labelMock.mock.mockImplementation(() =>
    Promise.resolve({added: [], removed: []})
  )
  postDeployMessageMock.mock.mockImplementation(() => 'Updated 1 server')
  loadTrustedDeploymentTemplateMock.mock.mockImplementation(() =>
    Promise.resolve(null)
  )
  delete process.env['INPUT_DEPLOY_MESSAGE_PATH']
  lockMock.mock.mockImplementation(() =>
    Promise.resolve(createLockResponse(true))
  )
  createDeploymentStatusMock.mock.mockImplementation(() =>
    Promise.resolve({
      url: 'https://api.github.com/deployment-status/1',
      id: 1
    })
  )
  unlockIfUnchangedMock.mock.mockImplementation(() => Promise.resolve(true))

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
    deployment_start_time: '2024-01-01T00:00:00Z',
    disable_lock: false,
    lock_ref_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    trusted_sha: '0123456789abcdef0123456789abcdef01234567'
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

test('loads the configured template at the trusted workflow SHA', async () => {
  process.env['INPUT_DEPLOY_MESSAGE_PATH'] = '.github/deployment_message.md'
  loadTrustedDeploymentTemplateMock.mock.mockImplementation(() =>
    Promise.resolve('trusted template')
  )

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')
  assertCalledWith(
    loadTrustedDeploymentTemplateMock,
    octokit,
    context,
    '.github/deployment_message.md',
    '0123456789abcdef0123456789abcdef01234567'
  )
  const messageCall = postDeployMessageMock.mock.calls[0]
  assert.ok(messageCall)
  assert.strictEqual(messageCall.arguments[2], 'trusted template')
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
  assertCalledWith(
    unlockIfUnchangedMock,
    octokit,
    context,
    'production',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )
})

test('successfully completes a noop branch deployment and removes a non-sticky lock', async () => {
  lockMock.mock.mockImplementation(() =>
    Promise.resolve(createLockResponse(false))
  )
  data.noop = true

  assert.strictEqual(await postDeploy(context, octokit, data), 'success - noop')

  assertCalledTimes(lockMock, 1)
  assertCalledWith(lockMock, {
    octokit,
    context,
    ref: null,
    reactionId: null,
    sticky: false,
    environment: 'production',
    mode: {type: 'details', postDeployStep: true},
    leaveComment: true
  })
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
  assertCalledWith(
    unlockIfUnchangedMock,
    octokit,
    context,
    'production',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )
})

for (const lockRefSha of [undefined, null, '']) {
  test(`leaves a non-sticky lock in place when the saved ref SHA is ${String(lockRefSha)}`, async () => {
    lockMock.mock.mockImplementation(() =>
      Promise.resolve(createLockResponse(false))
    )
    data.lock_ref_sha = lockRefSha

    assert.strictEqual(await postDeploy(context, octokit, data), 'success')
    assertNotCalled(unlockIfUnchangedMock)
    assertCalledWith(
      warningMock,
      'could not remove the deployment lock because its original ref SHA was not saved; leaving the current lock in place'
    )
  })
}

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
    assertNotCalled(unlockIfUnchangedMock)
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

for (const noop of [false, true]) {
  test(`skips ${noop ? 'noop' : 'deployment'} lock completion when locking is disabled`, async () => {
    data.disable_lock = true
    data.noop = noop

    assert.strictEqual(
      await postDeploy(context, octokit, data),
      noop ? 'success - noop' : 'success'
    )
    assertNotCalled(lockMock)
    assertNotCalled(unlockIfUnchangedMock)
    assertCalledWith(
      infoMock,
      '🔓 deployment locking is disabled; skipping lock completion'
    )
    assertCalledWith(actionStatusMock, {
      context,
      octokit,
      reactionId: 12345,
      message: 'Updated 1 server',
      result: 'success'
    })
    assertCalledTimes(labelMock, 1)
    if (noop) assertNotCalled(createDeploymentStatusMock)
    else assertCalledTimes(createDeploymentStatusMock, 1)
  })
}

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

test('applies failed noop labels even when successful-label skipping is enabled', async () => {
  data.labels.failed_noop = ['noop-failed']
  data.labels.skip_successful_noop_labels_if_approved = true
  data.noop = true
  data.status = 'failure'

  assert.strictEqual(await postDeploy(context, octokit, data), 'success - noop')
  assertCalledWith(labelMock, context, octokit, ['noop-failed'], [])
})

test('applies failed deploy labels even when successful-label skipping is enabled', async () => {
  data.labels.failed_deploy = ['deploy-failed']
  data.labels.skip_successful_deploy_labels_if_approved = true
  data.status = 'failure'

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')
  assertCalledWith(labelMock, context, octokit, ['deploy-failed'], [])
})

test('tolerates an already-removed deployment lock', async () => {
  lockMock.mock.mockImplementation(() =>
    Promise.resolve({
      environment: 'production',
      global: false,
      globalFlag: '',
      lockData: null,
      status: null
    })
  )

  assert.strictEqual(await postDeploy(context, octokit, data), 'success')
  assertNotCalled(unlockIfUnchangedMock)
  assertCalledWith(
    warningMock,
    '💡 a request to obtain the lock data returned null or undefined - the lock may have been removed by another process while this Action was running'
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

for (const noop of [false, true]) {
  for (const status of ['success', 'failure'] as const) {
    for (const failurePoint of ['template', 'render', 'comment'] as const) {
      test(`completes ${status} ${noop ? 'noop' : 'deployment'} cleanup when post ${failurePoint} fails`, async () => {
        const error = new Error(`${failurePoint} unavailable`)
        data.noop = noop
        data.status = status
        data.labels.successful_deploy = ['deploy-success']
        data.labels.failed_deploy = ['deploy-failed']
        data.labels.successful_noop = ['noop-success']
        data.labels.failed_noop = ['noop-failed']
        lockMock.mock.mockImplementation(() =>
          Promise.resolve(createLockResponse(false))
        )

        if (failurePoint === 'template') {
          process.env['INPUT_DEPLOY_MESSAGE_PATH'] =
            '.github/deployment_message.md'
          loadTrustedDeploymentTemplateMock.mock.mockImplementation(() =>
            Promise.reject(error)
          )
        } else if (failurePoint === 'render') {
          postDeployMessageMock.mock.mockImplementation(() => {
            throw error
          })
        } else {
          actionStatusMock.mock.mockImplementation(() => Promise.reject(error))
        }

        await assert.rejects(
          postDeploy(context, octokit, data),
          candidate => candidate === error
        )
        assertCalledWith(
          unlockIfUnchangedMock,
          octokit,
          context,
          'production',
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        )
        assertCalledWith(
          labelMock,
          context,
          octokit,
          [
            noop
              ? status === 'success'
                ? 'noop-success'
                : 'noop-failed'
              : status === 'success'
                ? 'deploy-success'
                : 'deploy-failed'
          ],
          [
            noop
              ? status === 'success'
                ? 'noop-failed'
                : 'noop-success'
              : status === 'success'
                ? 'deploy-failed'
                : 'deploy-success'
          ]
        )
        if (noop) {
          assertNotCalled(createDeploymentStatusMock)
        } else {
          assertCalledWith(
            createDeploymentStatusMock,
            octokit,
            context,
            'test-ref',
            status,
            '456',
            'production',
            null
          )
        }
      })
    }
  }
}

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

test('skips decorative reaction handling when reaction_id is empty', async () => {
  data.reaction_id = ''
  await postDeploy(context, octokit, data)
  const actionStatusRequest = actionStatusMock.mock.calls.at(-1)?.arguments[0]
  assert.strictEqual(actionStatusRequest?.reactionId, null)
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
