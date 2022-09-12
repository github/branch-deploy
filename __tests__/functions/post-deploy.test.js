import {postDeploy} from '../../src/functions/post-deploy'
import * as actionStatus from '../../src/functions/action-status'
import * as lock from '../../src/functions/lock'
import * as unlock from '../../src/functions/unlock'
import * as createDeploymentStatus from '../../src/functions/deployment'
import * as core from '@actions/core'

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {sticky: true}
  })
  jest
    .spyOn(createDeploymentStatus, 'createDeploymentStatus')
    .mockImplementation(() => {
      return undefined
    })
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

const context = {
  actor: 'monalisa',
  eventName: 'issue_comment',
  workflow: 'test-workflow',
  repo: {
    owner: 'corp',
    repo: 'test'
  },
  payload: {
    comment: {
      id: '1'
    }
  }
}

const octokit = {
  rest: {
    repos: {
      createDeploymentStatus: jest.fn().mockReturnValue({
        data: {}
      })
    }
  }
}

test('successfully completes a production branch deployment', async () => {
  const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = jest.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      'false',
      456,
      'production'
    )
  ).toBe('success')

  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    12345,
    '  ### Deployment Results ✅\n\n  **monalisa** successfully deployed branch `test-ref` to **production**\n\n  <details><summary>Show Results</summary>\n\n  Deployment has created 1 new server\n\n  </details>',
    true
  )
  expect(createDeploymentStatusSpy).toHaveBeenCalled()
  expect(createDeploymentStatusSpy).toHaveBeenCalledWith(
    {
      rest: {
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    'test-ref',
    'success',
    456,
    'production'
  )
})

test('successfully completes a production branch deployment and removes a non-sticky lock', async () => {
  const lockSpy = jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {sticky: false}
  })
  jest.spyOn(unlock, 'unlock').mockImplementation(() => {
    return true
  })
  const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = jest.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      'false',
      456,
      'production'
    )
  ).toBe('success')

  expect(lockSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    12345,
    '  ### Deployment Results ✅\n\n  **monalisa** successfully deployed branch `test-ref` to **production**\n\n  <details><summary>Show Results</summary>\n\n  Deployment has created 1 new server\n\n  </details>',
    true
  )
  expect(createDeploymentStatusSpy).toHaveBeenCalled()
  expect(createDeploymentStatusSpy).toHaveBeenCalledWith(
    {
      rest: {
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    'test-ref',
    'success',
    456,
    'production'
  )
})

test('successfully completes a noop branch deployment and removes a non-sticky lock', async () => {
  const lockSpy = jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {sticky: false}
  })
  jest.spyOn(unlock, 'unlock').mockImplementation(() => {
    return true
  })
  const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus')
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      'true',
      456,
      'production'
    )
  ).toBe('success - noop')

  expect(lockSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    12345,
    '  ### Deployment Results ✅\n\n  **monalisa** successfully **noop** deployed branch `test-ref` to **production**\n\n  <details><summary>Show Results</summary>\n\n  Deployment has created 1 new server\n\n  </details>',
    true
  )
})

test('successfully completes a production branch deployment with no custom message', async () => {
  const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus')
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      '',
      'test-ref',
      'false',
      456,
      'production'
    )
  ).toBe('success')
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    12345,
    '  ### Deployment Results ✅\n\n  **monalisa** successfully deployed branch `test-ref` to **production**',
    true
  )
})

test('successfully completes a noop branch deployment', async () => {
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      'true',
      456,
      'production'
    )
  ).toBe('success - noop')
})

test('updates with a failure for a production branch deployment', async () => {
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'failure',
      'Deployment has failed to create 1 new server',
      'test-ref',
      'false',
      456,
      'production'
    )
  ).toBe('success')
})

test('updates with an unknown for a production branch deployment', async () => {
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'unknown',
      'Deployment has failed to create 1 new server',
      'test-ref',
      'false',
      456,
      'production'
    )
  ).toBe('success')
})

test('fails due to no comment_id', async () => {
  try {
    await postDeploy(context, octokit, '')
  } catch (e) {
    expect(e.message).toBe('no comment_id provided')
  }
})

test('fails due to no status', async () => {
  try {
    await postDeploy(context, octokit, 123, '')
  } catch (e) {
    expect(e.message).toBe('no status provided')
  }
})

test('fails due to no ref', async () => {
  try {
    await postDeploy(
      context,
      octokit,
      123,
      'success',
      'Deployment has created 1 new server',
      ''
    )
  } catch (e) {
    expect(e.message).toBe('no ref provided')
  }
})

test('fails due to no deployment_id', async () => {
  jest.resetAllMocks()
  try {
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      'false',
      ''
    )
  } catch (e) {
    expect(e.message).toBe('no deployment_id provided')
  }
})

test('fails due to no environment', async () => {
  jest.resetAllMocks()
  try {
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      'false',
      456,
      ''
    )
  } catch (e) {
    expect(e.message).toBe('no environment provided')
  }
})

test('fails due to no noop', async () => {
  jest.resetAllMocks()
  try {
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      ''
    )
  } catch (e) {
    expect(e.message).toBe('no noop value provided')
  }
})
