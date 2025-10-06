import {postDeploy} from '../../src/functions/post-deploy.js'
import {vi,expect,test,beforeEach} from 'vitest'
import {COLORS} from '../../src/functions/colors.js'
import * as actionStatus from '../../src/functions/action-status.js'
import * as lock from '../../src/functions/lock.js'
import * as unlock from '../../src/functions/unlock.js'
import * as createDeploymentStatus from '../../src/functions/deployment.js'
import * as postDeployMessage from '../../src/functions/post-deploy-message.js'
import * as core from '@actions/core'
import * as label from '../../src/functions/label.js'

const infoMock = vi.spyOn(core, 'info')
const debugMock = vi.spyOn(core, 'debug')
const warningMock = vi.spyOn(core, 'warning')

const review_decision = 'APPROVED'

var octokit
var context
var labels
var data

beforeEach(() => {
  vi.clearAllMocks()

  vi.spyOn(label, 'label').mockImplementation(() => {
    return undefined
  })

  vi.spyOn(postDeployMessage, 'postDeployMessage').mockImplementation(() => {
    return 'Updated 1 server'
  })

  vi.spyOn(lock, 'lock').mockImplementation(() => {
    return {lockData: {sticky: true}}
  })

  vi.spyOn(createDeploymentStatus, 'createDeploymentStatus').mockImplementation(
    () => {
      return undefined
    }
  )

  context = {
    actor: 'monalisa',
    eventName: 'issue_comment',
    workflow: 'test-workflow',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 1
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
        createDeploymentStatus: vi.fn().mockReturnValue({
          data: {}
        })
      },
      issues: {
        createComment: vi.fn().mockReturnValue({
          data: {}
        })
      },
      reactions: {
        createForIssueComment: vi.fn().mockReturnValue({
          data: {}
        }),
        deleteForIssueComment: vi.fn().mockReturnValue({
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

  data = {
    sha: 'abc123',
    ref: 'test-ref',
    comment_id: 123,
    reaction_id: 12345,
    status: 'success',
    message: 'test-message',
    noop: false,
    deployment_id: 456,
    environment: 'production',
    environment_url: null,
    approved_reviews_count: 1,
    labels: labels,
    review_decision: review_decision,
    fork: 'false',
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
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
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
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
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
  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = vi.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )

  data.status = 'failure'

  expect(await postDeploy(context, octokit, data)).toBe('success')

  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
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
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
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
  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = vi.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )

  data.environment_url = 'https://example.com'

  expect(await postDeploy(context, octokit, data)).toBe('success')

  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
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
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
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
  const lockSpy = vi.spyOn(lock, 'lock').mockImplementation(() => {
    return {lockData: {sticky: false}}
  })

  vi.spyOn(unlock, 'unlock').mockImplementation(() => {
    return true
  })

  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  const createDeploymentStatusSpy = vi.spyOn(
    createDeploymentStatus,
    'createDeploymentStatus'
  )
  expect(await postDeploy(context, octokit, data)).toBe('success')

  expect(lockSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
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
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
        repos: {
          createDeploymentStatus: octokit.rest.repos.createDeploymentStatus
        }
      }
    },
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
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
  const lockSpy = vi.spyOn(lock, 'lock').mockImplementation(() => {
    return {lockData: {sticky: false}}
  })

  vi.spyOn(unlock, 'unlock').mockImplementation(() => {
    return true
  })

  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')

  data.noop = true

  expect(await postDeploy(context, octokit, data)).toBe('success - noop')

  expect(lockSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
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
  const lockSpy = vi.spyOn(lock, 'lock').mockImplementation(() => {
    return {lockData: null}
  })

  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')

  data.noop = true

  expect(await postDeploy(context, octokit, data)).toBe('success - noop')

  expect(lockSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
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
  const actionStatusSpy = vi.spyOn(actionStatus, 'actionStatus')
  expect(await postDeploy(context, octokit, data)).toBe('success')
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith(
    {
      actor: 'monalisa',
      eventName: 'issue_comment',
      issue: {number: 1},
      payload: {comment: {id: '1'}},
      repo: {owner: 'corp', repo: 'test'},
      workflow: 'test-workflow'
    },
    {
      rest: {
        issues: {
          createComment: octokit.rest.issues.createComment
        },
        reactions: {
          createForIssueComment: octokit.rest.reactions.createForIssueComment,
          deleteForIssueComment: octokit.rest.reactions.deleteForIssueComment
        },
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

  try {
    await postDeploy(context, octokit, data)
  } catch (e) {
    expect(e.message).toBe('no comment_id provided')
  }
})

test('fails due to no status', async () => {
  data.status = ''
  try {
    await postDeploy(context, octokit, data)
  } catch (e) {
    expect(e.message).toBe('no status provided')
  }
})

test('fails due to no ref', async () => {
  data.ref = ''
  try {
    await postDeploy(context, octokit, data)
  } catch (e) {
    expect(e.message).toBe('no ref provided')
  }
})

test('fails due to no deployment_id', async () => {
  vi.resetAllMocks()
  data.deployment_id = ''
  try {
    await postDeploy(context, octokit, data)
  } catch (e) {
    expect(e.message).toBe('no deployment_id provided')
  }
})

test('fails due to no environment', async () => {
  vi.resetAllMocks()
  data.environment = ''
  try {
    await postDeploy(context, octokit, data)
  } catch (e) {
    expect(e.message).toBe('no environment provided')
  }
})

test('fails due to no reaction_id', async () => {
  vi.resetAllMocks()
  data.reaction_id = ''
  try {
    await postDeploy(context, octokit, data)
  } catch (e) {
    expect(e.message).toBe('no reaction_id provided')
  }
})

test('fails due to no environment (noop)', async () => {
  vi.resetAllMocks()
  data.environment = ''
  data.noop = true
  try {
    await postDeploy(context, octokit, data)
  } catch (e) {
    expect(e.message).toBe('no environment provided')
  }
})

test('fails due to no noop', async () => {
  vi.resetAllMocks()
  data.noop = null
  try {
    await postDeploy(context, octokit, data)
  } catch (e) {
    expect(e.message).toBe('no noop value provided')
  }
})
