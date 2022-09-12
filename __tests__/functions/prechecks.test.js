import {prechecks} from '../../src/functions/prechecks'
import * as isAdmin from '../../src/functions/admin'
import * as core from '@actions/core'
import dedent from 'dedent-js'

beforeEach(() => {
  // jest.resetAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
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
      mergeStateStatus: 'CLEAN',
      commits: {
        nodes: [
          {
            commit: {
              checkSuites: {
                totalCount: 3
              },
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
      'disabled',
      'main',
      '123',
      true,
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
      'disabled',
      'main',
      '123',
      true,
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
      'disabled',
      'main',
      '123',
      true,
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
      'disabled',
      'main',
      '123',
      true,
      context,
      octokit
    )
  ).toStrictEqual({
    message: dedent(`### ⚠️ Invalid command

    Please use one of the following:
    
    - \`.deploy\` - deploy **this** branch (\`test-ref\`)
    - \`.deploy noop\` - deploy **this** branch in **noop** mode (\`test-ref\`)
    - \`.deploy main\` - deploy the \`main\` branch
    - \`.deploy to <environment>\` - deploy **this** branch to the specified environment
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
      'disabled',
      'main',
      '123',
      true,
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
      'disabled',
      'main',
      '123',
      true,
      context,
      octobadperms
    )
  ).toStrictEqual({
    message:
      '👋 __monalisa__, seems as if you have not admin/write permissions in this repo, permissions: read',
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
      'disabled',
      'main',
      '123',
      true,
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
      'disabled',
      'main',
      '123',
      true,
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
                checkSuites: {
                  totalCount: 1
                },
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
      'disabled',
      'main',
      '123',
      true,
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
                checkSuites: {
                  totalCount: 1
                },
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
      'disabled',
      'main',
      '123',
      true,
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

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment and is from a forked repository', async () => {
  var pullRequestFromFork = octokit
  pullRequestFromFork['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 8
                },
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
  pullRequestFromFork['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  pullRequestFromFork['rest']['pulls']['get'] = jest.fn().mockReturnValue({
    data: {
      head: {
        sha: 'abcde12345',
        ref: 'test-ref',
        label: 'test-repo:test-ref',
        repo: {
          fork: true
        }
      }
    },
    status: 200
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'disabled',
      'main',
      '123',
      true,
      context,
      pullRequestFromFork
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    status: true,
    noopMode: false,
    ref: 'abcde12345'
  })
})

test('runs prechecks and finds that the IssueOps command is on a PR from a forked repo and is not allowed', async () => {
  var pullRequestFromFork = octokit
  pullRequestFromFork['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
  pullRequestFromFork['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  pullRequestFromFork['rest']['pulls']['get'] = jest.fn().mockReturnValue({
    data: {
      head: {
        sha: 'abcde12345',
        ref: 'test-ref',
        repo: {
          fork: true
        }
      }
    },
    status: 200
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'disabled',
      'main',
      '123',
      false,
      context,
      pullRequestFromFork
    )
  ).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\nThis Action has been explicity configured to prevent deployments from forks. You can change this via this Action's inputs if needed`,
    status: false
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
                checkSuites: {
                  totalCount: 2
                },
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
      'disabled',
      'main',
      '123',
      true,
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
                checkSuites: {
                  totalCount: 1
                },
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
      'disabled',
      'main',
      '123',
      true,
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
                checkSuites: {
                  totalCount: 3
                },
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
      'disabled',
      'main',
      '123',
      true,
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
      'disabled',
      'main',
      '123',
      true,
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
      'disabled',
      'main',
      '123',
      true,
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
                checkSuites: {
                  totalCount: 14
                },
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
      'disabled',
      'main',
      '123',
      true,
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
                checkSuites: {
                  totalCount: 1
                },
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
      'disabled',
      'main',
      '123',
      true,
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
                checkSuites: {
                  totalCount: 1
                },
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
      'disabled',
      'main',
      '123',
      true,
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
                checkSuites: {
                  totalCount: 1
                },
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
      'disabled',
      'main',
      '123',
      true,
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
      'disabled',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `null`\n\n> Your pull request is missing required approvals',
    status: false
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a noop deploy and force updates the branch', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
  octonocommitchecks['rest']['pulls']['updateBranch'] = jest
    .fn()
    .mockReturnValue({
      data: {
        message: 'Updating pull request branch.',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 202
    })
  expect(
    await prechecks(
      '.deploy noop',
      '.deploy',
      'noop',
      'force',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and finds the PR is un-mergable and a noop deploy', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'DIRTY',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
      'warn',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n- mergeStateStatus: `DIRTY`\n\n> A merge commit cannot be cleanly created',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it fails to update the branch', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
  octonocommitchecks['rest']['pulls']['updateBranch'] = jest
    .fn()
    .mockReturnValue({
      data: {
        message: 'merge conflict between base and head',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 422
    })
  expect(
    await prechecks(
      '.deploy noop',
      '.deploy',
      'noop',
      'force',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: `422`\n- update_branch: `force`\n\n> Failed to update pull request branch with `main`',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it hits an error when force updating the branch', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
  octonocommitchecks['rest']['pulls']['updateBranch'] = jest
    .fn()
    .mockReturnValue(null)
  expect(
    await prechecks(
      '.deploy noop',
      '.deploy',
      'noop',
      'force',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      "### ⚠️ Cannot proceed with deployment\n\n```text\nCannot read properties of null (reading 'status')\n```",
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and update_branch is set to warn', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
      'warn',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is a DRAFT PR and a noop deploy', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'DRAFT',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
      'warn',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and the commit status is null', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: 'FAILED'
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
      'warn',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILED`\n\n> This is usually caused by missing PR approvals or CI checks failing',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a full deploy and update_branch is set to warn', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
      'warn',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a full deploy and force updates the branch', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
  octonocommitchecks['rest']['pulls']['updateBranch'] = jest
    .fn()
    .mockReturnValue({
      data: {
        message: 'Updating pull request branch.',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 202
    })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'force',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
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
      'disabled',
      'main',
      '123',
      true,
      context,
      octobadres
    )
  ).toStrictEqual({
    message: 'Permission check returns non-200 status: 500',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid and from a defined admin', async () => {
  var octogoodres = octokit
  octogoodres['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octogoodres['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return true
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'disabled',
      'main',
      '123',
      true,
      context,
      octogoodres
    )
  ).toStrictEqual({
    message:
      '✔️ CI is passing and approval is bypassed due to admin rights - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  var octogoodres = octokit
  octogoodres['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octogoodres['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return true
  })
  expect(
    await prechecks(
      '.deploy to production',
      '.deploy',
      'noop',
      'disabled',
      'main',
      '123',
      true,
      context,
      octogoodres
    )
  ).toStrictEqual({
    message:
      '✔️ CI is passing and approval is bypassed due to admin rights - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true
  })

  expect(infoMock).toHaveBeenCalledWith('issueops command used with parameters')
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  var octogoodres = octokit
  octogoodres['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octogoodres['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
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
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return true
  })
  expect(
    await prechecks(
      '.deploy noop to production',
      '.deploy',
      'noop',
      'disabled',
      'main',
      '123',
      true,
      context,
      octogoodres
    )
  ).toStrictEqual({
    message: '✔️ All CI checks passed and **noop** requested - OK',
    noopMode: true,
    ref: 'test-ref',
    status: true
  })

  expect(infoMock).toHaveBeenCalledWith('issueops command used with parameters')
  expect(infoMock).toHaveBeenCalledWith('noop mode used with parameters')
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin when CI is not defined', async () => {
  var octogoodres = octokit
  octogoodres['rest']['repos']['getCollaboratorPermissionLevel'] = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
  octogoodres['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 1
                },
                statusCheckRollup: {
                  state: null
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return true
  })
  expect(
    await prechecks(
      '.deploy',
      '.deploy',
      'noop',
      'disabled',
      'main',
      '123',
      true,
      context,
      octogoodres
    )
  ).toStrictEqual({
    message:
      '✔️ CI checks have not been defined and approval is bypassed due to admin rights - OK',
    noopMode: false,
    ref: 'test-ref',
    status: true
  })

  expect(infoMock).toHaveBeenCalledWith('issueops command used with parameters')
})

test('runs prechecks and finds that no CI checks exist and reviews are not defined', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 0
                },
                statusCheckRollup: null
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
      'disabled',
      'main',
      '123',
      true,
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
    'No CI checks have been defined for this pull request, proceeding - OK'
  )
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

test('runs prechecks and finds that no CI checks exist but reviews are defined', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 0
                },
                statusCheckRollup: null
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
      'disabled',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message: '✔️ PR is approved and all CI checks passed - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref'
  })
  expect(infoMock).toHaveBeenCalledWith(
    'No CI checks have been defined for this pull request, proceeding - OK'
  )
  expect(infoMock).toHaveBeenCalledWith(
    'Skipping commit status check and proceeding...'
  )
  expect(infoMock).toHaveBeenCalledWith(
    '⚠️ CI checks have been defined but required reviewers have not been defined... proceeding - OK'
  )
})

test('runs prechecks and finds that no CI checks exist and the PR is not approved, but it is from an admin', async () => {
  var octonocommitchecks = octokit
  octonocommitchecks['graphql'] = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {
                  totalCount: 0
                },
                statusCheckRollup: null
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
      'disabled',
      'main',
      '123',
      true,
      context,
      octonocommitchecks
    )
  ).toStrictEqual({
    message:
      '✔️ CI is passing and approval is bypassed due to admin rights - OK',
    status: true,
    noopMode: false,
    ref: 'test-ref'
  })
  expect(infoMock).toHaveBeenCalledWith(
    'No CI checks have been defined for this pull request, proceeding - OK'
  )
  expect(infoMock).toHaveBeenCalledWith(
    'Skipping commit status check and proceeding...'
  )
  expect(infoMock).toHaveBeenCalledWith(
    '⚠️ CI checks have been defined but required reviewers have not been defined... proceeding - OK'
  )
})
