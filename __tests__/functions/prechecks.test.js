import {prechecks} from '../../src/functions/prechecks'
import * as core from '@actions/core'
import dedent from 'dedent-js'

beforeEach(() => {
  // jest.resetAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
})

// Globals for testing
const infoMock = jest.spyOn(core, 'info')
const context = {
  actor: 'monalisa',
  repo: {
    owner: 'corp',
    repo: 'test'
  },
  issue: {
    number: 123
  }
}
const createComment = jest.fn().mockReturnValue({data: {}})
const getCollabOK = jest
  .fn()
  .mockReturnValue({data: {permission: 'admin'}, status: 200})
const getPullsOK = jest
  .fn()
  .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
const graphQLOK = jest.fn().mockReturnValue({
  repository: {
    pullRequest: {
      reviewDecision: 'APPROVED',
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                state: 'SUCCESS'
              }
            }
          }
        ]
      }
    }
  }
})

const octokit = {
  rest: {
    issues: {
      createComment: createComment
    },
    repos: {
      getCollaboratorPermissionLevel: getCollabOK
    },
    pulls: {
      get: getPullsOK
    }
  },
  graphql: graphQLOK
}

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment', async () => {
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a rollback deployment', async () => {
  expect(
    await prechecks(
      '.deploy main',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ Deployment to the **stable** branch requested - OK',
    noopMode: false,
    ref: 'main',
    status: true
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a noop deployment', async () => {
  expect(
    await prechecks(
      '.deploy noop',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octokit
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    noopMode: true,
    ref: 'test-ref',
    status: true
  })
})

test('runs prechecks and does not find any matching command', async () => {
  expect(
    await prechecks(
      'I have questions about this PR',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octokit
    )
  ).toStrictEqual({
    message: dedent(`### ⚠️ Invalid command

    Please use one of the following:
    
    - \`.deploy\` - deploy **this** branch (\`test-ref\`)
    - \`.deploy noop\` - deploy **this** branch in **noop** mode (\`test-ref\`)
    - \`.deploy main\` - deploy the \`main\` branch
    > Note: \`.deploy main\` is often used for rolling back a change or getting back to a known working state`),
    status: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid without defined CI checks', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED'
      }
    }
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `null`\n\n> This is usually caused by missing PR approvals or CI checks failing',
    status: false
  })
  expect(infoMock).toHaveBeenCalledWith(
    "Could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading 'nodes') - Handled: OK"
  )
  expect(infoMock).toHaveBeenCalledWith(
    'Skipping commit status check and proceeding...'
  )
})

test('runs prechecks and fails with a non 200 permissionRes.status', async () => {
  var octobadres = octokit
  octobadres['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 500})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octobadres
    )
  ).toStrictEqual({
    message: 'Permission check returns non-200 status: 500',
    status: false
  })
})

test('runs prechecks and fails due to bad user permissions', async () => {
  var octobadperms = octokit
  octobadperms['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'read'}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octobadperms
    )
  ).toStrictEqual({
    message:
      '👋  __monalisa__, seems as if you have not admin/write permission to branch-deploy this PR, permissions: read',
    status: false
  })
})

test('runs prechecks and fails due to a bad pull request', async () => {
  var octobadpull = octokit
  octobadpull['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValueOnce({status: 500})
  octobadpull['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octobadpull
    )
  ).toStrictEqual({
    message: 'Could not retrieve PR info: 500',
    status: false
  })
})

// Review checks and CI checks

test('runs prechecks and finds that reviews and CI checks have not been defined', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: null
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '⚠️ CI checks have not been defined and required reviewers have not been defined... proceeding - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref'
  })
  expect(infoMock).toHaveBeenCalledWith(
    "Could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading 'nodes') - Handled: OK"
  )
  expect(infoMock).toHaveBeenCalledWith(
    'Skipping commit status check and proceeding...'
  )
  expect(infoMock).toHaveBeenCalledWith(
    '⚠️ CI checks have not been defined and required reviewers have not been defined... proceeding - OK'
  )
})

test('runs prechecks and finds CI checks pass but reviews are not defined', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '⚠️ CI checks have been defined but required reviewers have not been defined... proceeding - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref'
  })
  expect(infoMock).toHaveBeenCalledWith(
    "Could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading 'nodes') - Handled: OK"
  )
  expect(infoMock).toHaveBeenCalledWith(
    'Skipping commit status check and proceeding...'
  )
  expect(infoMock).toHaveBeenCalledWith(
    '⚠️ CI checks have been defined but required reviewers have not been defined... proceeding - OK'
  )
})

test('runs prechecks and finds CI is passing and the PR has not been reviewed BUT it is a noop deploy', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy noop',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message: '✔️ All CI checks passed and **noop** requested - OK',
    status: true,
    noopMode: true,
    ref: 'test-ref'
  })
})

test('runs prechecks and finds CI is pending and the PR has not been reviewed BUT it is a noop deploy', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy noop',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> Reviews are not required for a noop deployment but CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI checks are pending, the PR has not been reviewed, and it is not a noop deploy', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing and the PR must be reviewed in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is pending and reviewers have not been defined', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `null`\n- commitStatus: `PENDING`\n\n> CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI checked have not been defined, the PR has not been reviewed, and it IS a noop deploy', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED'
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy noop',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message: '✔️ CI checks have not been defined and **noop** requested - OK',
    status: true,
    noopMode: true,
    ref: 'test-ref'
  })
})

test('runs prechecks and deploys to the stable branch', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy main',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message: '✔️ Deployment to the **stable** branch requested - OK',
    status: true,
    noopMode: false,
    ref: 'main'
  })
})

test('runs prechecks and finds the PR has been approved but CI checks are pending and it is not a noop deploy', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is passing but the PR is missing an approval', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'SUCCESS'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `SUCCESS`\n\n> CI checks are passing but an approval is required before you can proceed with deployment',
    status: false
  })
})

test('runs prechecks and finds the PR is approved but CI is failing', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'FAILURE'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR does not require approval but CI is failing', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'FAILURE'
                }
              }
            }
          ]
        }
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `null`\n- commitStatus: `FAILURE`\n\n> Your pull request does not require approvals but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR is NOT reviewed and CI checks have NOT been defined and NOT a noop deploy', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED'
      }
    }
  })
  octonocommitchecks['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octonocommitchecks['rest']['pulls']['get'] = jest
    .fn()
    .mockReturnValue({data: {head: {ref: 'test-ref'}}, status: 200})
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'main',
      '123',
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `null`\n\n> Your pull request is missing required approvals',
    status: false
  })
})
