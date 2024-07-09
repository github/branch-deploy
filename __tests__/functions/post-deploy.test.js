import {postDeploy} from '../../src/functions/post-deploy'
import {COLORS} from '../../src/functions/colors'
import * as actionStatus from '../../src/functions/action-status'
import * as lock from '../../src/functions/lock'
import * as unlock from '../../src/functions/unlock'
import * as createDeploymentStatus from '../../src/functions/deployment'
import * as postDeployMessage from '../../src/functions/post-deploy-message'
import * as core from '@actions/core'
import * as label from '../../src/functions/label'

const infoMock = jest.spyOn(core, 'info')
const debugMock = jest.spyOn(core, 'debug')
const warningMock = jest.spyOn(core, 'warning')

const review_decision = 'APPROVED'

var octokit
var context
var labels

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(label, 'label').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(postDeployMessage, 'postDeployMessage').mockImplementation(() => {
    return 'Updated 1 server'
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {lockData: {sticky: true}}
  })
  jest
    .spyOn(createDeploymentStatus, 'createDeploymentStatus')
    .mockImplementation(() => {
      return undefined
    })

  context = {
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

  octokit = {
    rest: {
      repos: {
        createDeploymentStatus: jest.fn().mockReturnValue({
          data: {}
        })
      }
    }
  }

  labels = {
    successful_deploy: [],
    successful_noop: [],
    failed_deploy: [],
    failed_noop: [],
    skip_successful_noop_labels_if_approved: false,
    skip_successful_deploy_labels_if_approved: false
  }
})

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
      'test-ref',
      false, // noop
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
    'Updated 1 server',
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
    'production',
    null // environment_url
  )
})

test('successfully completes a production branch deployment that fails', async () => {
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
      'failure',
      'test-ref',
      false, // noop
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
    'Updated 1 server',
    false
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
    'failure',
    456,
    'production',
    null // environment_url
  )
})

test('successfully completes a production branch deployment with an environment url', async () => {
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
      'test-ref',
      false, // noop
      456,
      'production',
      'https://example.com', // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
    'Updated 1 server',
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
    'production',
    'https://example.com' // environment_url
  )
})

test('successfully completes a production branch deployment and removes a non-sticky lock', async () => {
  const lockSpy = jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {lockData: {sticky: false}}
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
      'test-ref',
      false, // noop
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
    'Updated 1 server',
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
    'production',
    null // environment_url
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🧹 ${COLORS.highlight}non-sticky${COLORS.reset} lock detected, will remove lock`
  )
})

test('successfully completes a noop branch deployment and removes a non-sticky lock', async () => {
  const lockSpy = jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {lockData: {sticky: false}}
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
      'test-ref',
      true,
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
    'Updated 1 server',
    true
  )
  expect(infoMock).toHaveBeenCalledWith(
    `🧹 ${COLORS.highlight}non-sticky${COLORS.reset} lock detected, will remove lock`
  )
})

test('successfully completes a noop branch deployment but does not get any lock data', async () => {
  const lockSpy = jest.spyOn(lock, 'lock').mockImplementation(() => {
    return {lockData: null}
  })
  const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus')
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'test-ref',
      true,
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
    'Updated 1 server',
    true
  )
  expect(warningMock).toHaveBeenCalledWith(
    '💡 a request to obtain the lock data returned null or undefined - the lock may have been removed by another process while this Action was running'
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
      'test-ref',
      false, // noop
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
    'Updated 1 server',
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
      'test-ref',
      true,
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
    )
  ).toBe('success - noop')
})

test('successfully completes a noop branch deployment and applies success labels', async () => {
  labels.successful_noop = ['ready-for-review', 'noop-success']

  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'test-ref',
      true,
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
    )
  ).toBe('success - noop')
})

test('successfully completes a noop branch deployment and does not apply labels due to skip config', async () => {
  labels.successful_noop = ['ready-for-review', 'noop-success']
  labels.skip_successful_noop_labels_if_approved = true

  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'test-ref',
      true,
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
    )
  ).toBe('success - noop')

  expect(infoMock).toHaveBeenCalledWith(
    `⏩ skipping noop labels since the pull request is ${COLORS.success}approved${COLORS.reset} (based on your configuration)`
  )
})

test('successfully completes a branch deployment and does not apply labels due to skip config', async () => {
  labels.successful_deploy = ['ready-to-merge', 'deploy-success']
  labels.skip_successful_deploy_labels_if_approved = true

  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'success',
      'test-ref',
      false, // noop
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
    )
  ).toBe('success')

  expect(infoMock).toHaveBeenCalledWith(
    `⏩ skipping deploy labels since the pull request is ${COLORS.success}approved${COLORS.reset} (based on your configuration)`
  )
})

test('successfully completes a noop branch deployment that fails and applies failure labels', async () => {
  labels.failed_noop = ['help', 'oh-no']

  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'failure',
      'test-ref',
      true, // noop
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
    )
  ).toBe('success - noop')

  expect(debugMock).toHaveBeenCalledWith('deploymentStatus: failure')
  expect(debugMock).toHaveBeenCalledWith('deployment mode: noop')
})

test('updates with a failure for a production branch deployment', async () => {
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      12345,
      'failure',
      'test-ref',
      false, // noop
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
      'test-ref',
      false, // noop
      456,
      'production',
      null, // environment_url
      1, // approved_reviews_count
      labels,
      review_decision
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
      12345,
      'success',
      null // ref
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
      'test-ref',
      false, // noop
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
      'test-ref',
      false, // noop
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
    await postDeploy(context, octokit, 123, 12345, 'success', 'test-ref', null)
  } catch (e) {
    expect(e.message).toBe('no noop value provided')
  }
})
