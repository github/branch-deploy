import {prechecks} from '../../src/functions/prechecks'
import {COLORS} from '../../src/functions/colors'
import * as isAdmin from '../../src/functions/admin'
import * as core from '@actions/core'

// Globals for testing
const infoMock = jest.spyOn(core, 'info')
const warningMock = jest.spyOn(core, 'warning')
const debugMock = jest.spyOn(core, 'debug')
const setOutputMock = jest.spyOn(core, 'setOutput')

var context
var getCollabOK
var getPullsOK
var graphQLOK
var octokit
var data

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  process.env.INPUT_PERMISSIONS = 'admin,write,maintain'

  data = {
    environment: 'production',
    environmentObj: {
      target: 'production',
      stable_branch_used: false,
      noop: false,
      params: null,
      sha: null
    },
    inputs: {
      allow_sha_deployments: false,
      update_branch: 'disabled',
      stable_branch: 'main',
      trigger: '.deploy',
      issue_number: '123',
      allowForks: true,
      skipCi: '',
      skipReviews: '',
      draft_permitted_targets: ''
    }
  }

  context = {
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 123
    }
  }

  getCollabOK = jest
    .fn()
    .mockReturnValue({data: {permission: 'write'}, status: 200})
  getPullsOK = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'base-ref'
      }
    },
    status: 200
  })

  graphQLOK = jest.fn().mockReturnValue({
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

  octokit = {
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
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment', async () => {
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a rollback deployment', async () => {
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})

  data.environmentObj.stable_branch_used = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ deployment to the ${COLORS.highlight}stable${COLORS.reset} branch requested`,
    noopMode: false,
    ref: 'main',
    status: true,
    sha: 'deadbeef'
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a noop deployment', async () => {
  data.environmentObj.noop = true
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps command is valid without defined CI checks', async () => {
  octokit.graphql = jest.fn().mockReturnValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED'
      }
    }
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ CI checks have not been defined but the PR has been approved',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(debugMock).toHaveBeenCalledWith(
    `could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading 'nodes') - Handled: ${COLORS.success}OK`
  )
  expect(debugMock).toHaveBeenCalledWith(
    'this repo may not have any CI checks defined'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'skipping commit status check and proceeding...'
  )
})

test('runs prechecks and fails due to bad user permissions', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'read'}, status: 200})
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '👋 __monalisa__, seems as if you have not admin/write/maintain permissions in this repo, permissions: read',
    status: false
  })
})

test('runs prechecks and fails due to a bad pull request', async () => {
  octokit.rest.pulls.get = jest.fn().mockReturnValueOnce({status: 500})
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: 'Could not retrieve PR info: 500',
    status: false
  })
})

// Review checks and CI checks

test('runs prechecks and finds that reviews and CI checks have not been defined', async () => {
  octokit.graphql = jest.fn().mockReturnValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: null
      }
    }
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '🎛️ CI checks have not been defined and required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(debugMock).toHaveBeenCalledWith(
    `could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading 'nodes') - Handled: ${COLORS.success}OK`
  )
  expect(debugMock).toHaveBeenCalledWith(
    'this repo may not have any CI checks defined'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'skipping commit status check and proceeding...'
  )
  expect(infoMock).toHaveBeenCalledWith(
    '🎛️ CI checks have not been defined and required reviewers have not been defined'
  )
})

test('runs prechecks and finds CI checks pass but reviews are not defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '🎛️ CI checks have been defined but required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '🎛️ CI checks have been defined but required reviewers have not been defined'
  )
})

test('runs prechecks and finds CI is passing and the PR has not been reviewed BUT it is a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`,
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment and is from a forked repository', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        sha: 'abcde12345',
        ref: 'test-ref',
        label: 'test-repo:test-ref',
        repo: {
          fork: true
        }
      },
      base: {
        ref: 'base-ref'
      }
    },
    status: 200
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    status: true,
    noopMode: false,
    ref: 'abcde12345',
    sha: 'abcde12345'
  })
})

test('runs prechecks and finds that the IssueOps command is on a PR from a forked repo and is not allowed', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        sha: 'abcde12345',
        ref: 'test-ref',
        repo: {
          fork: true
        }
      },
      base: {
        ref: 'base-ref'
      }
    },
    status: 200
  })

  data.inputs.allowForks = false

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\nThis Action has been explicity configured to prevent deployments from forks. You can change this via this Action's inputs if needed`,
    status: false
  })
})

test('runs prechecks and finds CI is pending and the PR has not been reviewed BUT it is a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> Reviews are not required for a noop deployment but CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI checks are pending, the PR has not been reviewed, and it is not a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing and the PR must be reviewed in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is pending and reviewers have not been defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `null`\n- commitStatus: `PENDING`\n\n> CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI checked have not been defined, the PR has not been reviewed, and it IS a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED'
      }
    }
  })

  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ CI checks have not been defined and ${COLORS.highlight}noop${COLORS.reset} requested`,
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123'
  })
})

test('runs prechecks and deploys to the stable branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: null
      }
    }
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})

  data.environmentObj.stable_branch_used = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ deployment to the ${COLORS.highlight}stable${COLORS.reset} branch requested`,
    status: true,
    noopMode: false,
    ref: 'main',
    sha: 'deadbeef'
  })
})

test('runs prechecks and finds the PR has been approved but CI checks are pending and it is not a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is passing but the PR is missing an approval', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `SUCCESS`\n\n> CI checks are passing but an approval is required before you can proceed with deployment',
    status: false
  })
})

test('runs prechecks and finds the PR is approved but CI is failing', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR does not require approval but CI is failing', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `null`\n- commitStatus: `FAILURE`\n\n> Your pull request does not require approvals but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR is NOT reviewed and CI checks have NOT been defined and NOT a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED'
      }
    }
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `null`\n\n> Your pull request is missing required approvals',
    status: false
  })
})

test('runs prechecks and finds the PR is approved and CI checks have NOT been defined and NOT a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED'
      }
    }
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ CI checks have not been defined but the PR has been approved',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a noop deploy and force updates the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  data.inputs.update_branch = 'force'
  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and finds the PR is un-mergable and a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.environmentObj.noop = true
  data.inputs.update_branch = 'warn'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n- mergeStateStatus: `DIRTY`\n\n> A merge commit cannot be cleanly created',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it fails to update the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'merge conflict between base and head',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 422
  })

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: `422`\n- update_branch: `force`\n\n> Failed to update pull request branch with `main`',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it hits an error when force updating the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue(null)

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      "### ⚠️ Cannot proceed with deployment\n\n```text\nCannot read properties of null (reading 'status')\n```",
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and update_branch is set to warn', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.environmentObj.noop = true
  data.inputs.update_branch = 'warn'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` branch and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is a DRAFT PR and a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BLOCKED',
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
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      },
      draft: true
    },
    status: 200
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 0}, status: 200})

  data.environmentObj.noop = true
  data.inputs.update_branch = 'warn'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state',
    status: false
  })
  expect(warningMock).toHaveBeenCalledWith(
    'deployment requested on a draft PR from a non-allowed environment'
  )
})

test('runs prechecks and finds the PR is a DRAFT PR and from an allowed environment for draft deployments', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
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
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      },
      draft: true // telling the test suite that our PR is in a draft state
    },
    status: 200
  })

  data.environment = 'staging'
  data.inputs.update_branch = 'warn'
  data.inputs.draft_permitted_targets = 'sandbox,staging'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and the commit status is null', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.environmentObj.noop = true
  data.inputs.update_branch = 'warn'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILED`\n\n> This is usually caused by missing PR approvals or CI checks failing',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a full deploy and update_branch is set to warn', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.inputs.update_branch = 'warn'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` branch and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a full deploy and force updates the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  data.inputs.update_branch = 'force'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and fails with a non 200 permissionRes.status', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = jest
    .fn()
    .mockReturnValueOnce({data: {permission: 'admin'}, status: 500})

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: 'Permission check returns non-200 status: 500',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid and from a defined admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ CI is passing and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.environmentObj.params = 'something something something'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ CI is passing and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.environmentObj.noop = true
  data.environmentObj.params = 'something something something'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`,
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin when CI is not defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks have not been defined and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenLastCalledWith(
    '✅ CI checks have not been defined and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that no CI checks exist and reviews are not defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '🎛️ CI checks have not been defined and required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '🎛️ CI checks have not been defined and required reviewers have not been defined'
  )
})

test('runs prechecks and finds that no CI checks exist but reviews are defined and it is from an admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks have not been defined and approval is bypassed due to admin rights',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '✅ CI checks have not been defined and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that no CI checks exist and the PR is not approved, but it is from an admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks have not been defined and approval is bypassed due to admin rights',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '✅ CI checks have not been defined and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that skip_ci is set and the PR has been approved', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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

  data.environment = 'development'
  data.inputs.skipCi = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI requirements have been disabled for this environment and the PR has been approved',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123'
  })
  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and the PR has been approved'
  )
})

test('runs prechecks and finds that the commit status is success and skip_reviews is set for the environment', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
    return false
  })

  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.inputs.skipCi = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks passed and required reviewers have been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI checks passed and required reviewers have been disabled for this environment'
  )
})

test('runs prechecks and finds that no ci checks are defined and skip_reviews is set for the environment', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return false
  })

  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.inputs.skipCi = 'development'
  data.inputs.draft_permitted_targets = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks have not been defined and required reviewers have been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI checks have not been defined and required reviewers have been disabled for this environment'
  )
})

test('runs prechecks on a custom deploy comment with a custom variable at the end', async () => {
  data.environment = 'dev'
  data.environmentObj.params = 'something'
  data.inputs.skipCi = 'dev'
  data.inputs.skipReviews = 'dev'

  expect(
    await prechecks(
      context, // event context
      octokit, // octokit instance
      data // data object
    )
  ).toStrictEqual({
    message:
      '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment'
  )
})

test('runs prechecks when an exact sha is set, but the sha deployment feature is not enabled', async () => {
  data.inputs.allow_sha_deployments = false
  data.environmentObj.sha = '82c238c277ca3df56fe9418a5913d9188eafe3bc'

  expect(
    await prechecks(
      context, // event context
      octokit, // octokit instance
      data // data object
    )
  ).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- allow_sha_deployments: \`${data.inputs.allow_sha_deployments}\`\n\n> sha deployments have not been enabled`,
    status: false
  })
})

test('runs prechecks when an exact sha is set, and the sha deployment feature is enabled', async () => {
  data.inputs.allow_sha_deployments = true
  data.environmentObj.sha = '82c238c277ca3df56fe9418a5913d9188eafe3bc'

  expect(
    await prechecks(
      context, // event context
      octokit, // octokit instance
      data // data object
    )
  ).toStrictEqual({
    message: `✅ deployment requested using an exact ${COLORS.highlight}sha${COLORS.reset}`,
    noopMode: false,
    ref: data.environmentObj.sha,
    status: true,
    sha: data.environmentObj.sha
  })

  expect(infoMock).toHaveBeenCalledWith(
    `✅ deployment requested using an exact ${COLORS.highlight}sha${COLORS.reset}`
  )

  expect(warningMock).toHaveBeenCalledWith(
    `⚠️ sha deployments are ${COLORS.warning}unsafe${COLORS.reset} as they bypass all checks - read more here: https://github.com/github/branch-deploy/blob/main/docs/sha-deployments.md`
  )

  expect(setOutputMock).toHaveBeenCalledWith(
    'sha_deployment',
    data.environmentObj.sha
  )
})

test('runs prechecks and finds that skip_ci is set and now reviews are defined', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return false
  })

  data.environment = 'development'
  data.inputs.skipCi = 'development'
  data.inputs.skipReviews = 'staging'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '🎛️ CI requirements have been disabled for this environment and required reviewers have not been defined',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '🎛️ CI requirements have been disabled for this environment and required reviewers have not been defined'
  )
})

test('runs prechecks and finds that skip_ci is set, reviews are required, and its a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
    return false
  })

  data.environment = 'development'
  data.environmentObj.noop = true
  data.inputs.skipCi = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI requirements have been disabled for this environment and **noop** requested',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and **noop** requested'
  )
})

test('runs prechecks and finds that skip_ci is set and skip_reviews is set', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
                  state: 'FAILURE'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return false
  })

  data.environment = 'development'
  data.inputs.skipCi = 'development'
  data.inputs.skipReviews = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment'
  )
})

test('runs prechecks and finds that skip_ci is set and the deployer is an admin', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
                  state: 'FAILURE'
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

  data.environment = 'development'
  data.inputs.skipCi = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI requirements have been disabled for this environment and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123'
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that CI is pending and reviewers have not been defined and it IS a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
                  state: 'PENDING'
                }
              }
            }
          ]
        }
      }
    }
  })
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return false
  })

  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`null\`\n- commitStatus: \`PENDING\`\n\n> CI checks must be passing in order to continue`,
    status: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    'note: even noop deploys require CI to finish and be in a passing state'
  )
})

test('runs prechecks and finds that the PR is NOT reviewed and CI checks have been disabled and it is NOT a noop deploy', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
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
  jest.spyOn(isAdmin, 'isAdmin').mockImplementation(() => {
    return false
  })

  data.environment = 'staging'
  data.inputs.skipCi = 'staging'
  data.inputs.skipReviews = 'production'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`REVIEW_REQUIRED\`\n- commitStatus: \`skip_ci\`\n\n> Your pull request is missing required approvals`,
    status: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    'note: CI checks are disabled for this environment so they will not be evaluated'
  )
})

test('runs prechecks and finds the PR is behind the stable branch (BLOCKED) and a noop deploy and force updates the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BLOCKED',
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
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      }
    },
    status: 200
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 1}, status: 200})
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BLOCKED`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and finds the PR is NOT behind the stable branch (BLOCKED) and a noop deploy and does not update the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BLOCKED',
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
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      }
    },
    status: 200
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 0}, status: 200})
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123'
  })
})

test('runs prechecks and finds the PR is NOT behind the stable branch (HAS_HOOKS) and a noop deploy and does not update the branch', async () => {
  octokit.graphql = jest.fn().mockReturnValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'HAS_HOOKS',
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
  octokit.rest.pulls.get = jest.fn().mockReturnValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123'
      },
      base: {
        ref: 'main'
      }
    },
    status: 200
  })
  octokit.rest.repos.getBranch = jest
    .fn()
    .mockReturnValueOnce({data: {commit: {sha: 'deadbeef'}}, status: 200})
  octokit.rest.repos.compareCommits = jest
    .fn()
    .mockReturnValueOnce({data: {behind_by: 0}, status: 200})
  octokit.rest.pulls.updateBranch = jest.fn().mockReturnValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123'
  })
})
