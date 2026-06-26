import {
  filterChecks,
  prechecks,
  type PrechecksBranchResponse,
  type PrechecksOctokit
} from '../../src/functions/prechecks.ts'
import {vi, expect, test, beforeEach, type Mock} from 'vitest'
import {COLORS} from '../../src/functions/colors.ts'
import * as isAdmin from '../../src/functions/admin.ts'
import * as isOutdated from '../../src/functions/outdated-check.ts'
import * as core from '@actions/core'
import type {
  BranchDeployContext,
  PrecheckData,
  PrechecksGraphqlResult,
  RawCheckResult
} from '../../src/types.ts'
import {
  createActionInputs,
  createContext,
  type DeepMutable
} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

// Globals for testing
const infoMock = vi.spyOn(core, 'info')
const warningMock = vi.spyOn(core, 'warning')
const debugMock = vi.spyOn(core, 'debug')
const setOutputMock = vi.spyOn(core, 'setOutput')

type PrechecksOctokitFixture = DeepMutable<PrechecksOctokit>

type TestCommitCollection = NonNullable<
  PrechecksGraphqlResult['repository']['pullRequest']['commits']
>
type TestCommitNode = NonNullable<TestCommitCollection['nodes']>[number]
type TestStatusCheckRollup = Exclude<
  TestCommitNode['commit']['statusCheckRollup'],
  undefined
>

let context: BranchDeployContext
let getCollabOK: Mock<
  PrechecksOctokit['rest']['repos']['getCollaboratorPermissionLevel']
>
let getPullsOK: Mock<PrechecksOctokit['rest']['pulls']['get']>
let graphQLOK: Mock<PrechecksOctokit['graphql']>
let octokit: PrechecksOctokitFixture
let data: DeepMutable<PrecheckData>
let baseCommitWithOid: TestCommitCollection

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('INPUT_PERMISSIONS', 'admin,write')

  baseCommitWithOid = {
    nodes: [
      {
        commit: {
          oid: 'abc123',
          statusCheckRollup: null
        }
      }
    ]
  }

  data = {
    environment: 'production',
    environmentObj: {
      target: 'production',
      stable_branch_used: false,
      noop: false,
      params: null,
      parsed_params: null,
      sha: null
    },
    issue_number: '123',
    inputs: createActionInputs({
      allow_sha_deployments: false,
      update_branch: 'disabled',
      stable_branch: 'main',
      trigger: '.deploy',
      allowForks: true,
      skipCi: '',
      skipReviews: '',
      draft_permitted_targets: '',
      checks: 'all',
      permissions: ['admin', 'write'],
      commit_verification: false,
      ignored_checks: [],
      use_security_warnings: true,
      allow_non_default_target_branch_deployments: false
    })
  }

  context = createContext({
    actor: 'monalisa',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    issue: {
      number: 123
    }
  })

  getCollabOK = vi
    .fn<PrechecksOctokit['rest']['repos']['getCollaboratorPermissionLevel']>()
    .mockResolvedValue({data: {permission: 'write'}, status: 200})
  getPullsOK = vi
    .fn<PrechecksOctokit['rest']['pulls']['get']>()
    .mockResolvedValue({
      data: {
        head: {
          ref: 'test-ref',
          sha: 'abc123',
          label: 'corp:test-ref',
          repo: {fork: false, full_name: 'corp/test'}
        },
        base: {
          ref: 'main'
        }
      },
      status: 200
    })

  graphQLOK = vi.fn<PrechecksOctokit['graphql']>().mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'SUCCESS',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'SUCCESS',
                        name: 'build'
                      }
                    ]
                  }
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
        compareCommits: vi
          .fn<PrechecksOctokit['rest']['repos']['compareCommits']>()
          .mockResolvedValue({data: {behind_by: 0}}),
        getBranch: vi
          .fn<PrechecksOctokit['rest']['repos']['getBranch']>()
          .mockResolvedValue({
            data: {
              commit: {
                sha: 'deadbeef',
                commit: {tree: {sha: 'beefdead'}}
              },
              name: 'test-branch'
            }
          }),
        getCollaboratorPermissionLevel: getCollabOK
      },
      pulls: {
        get: getPullsOK,
        updateBranch: vi
          .fn<PrechecksOctokit['rest']['pulls']['updateBranch']>()
          .mockResolvedValue({status: 202})
      }
    },
    graphql: graphQLOK
  }

  vi.spyOn(isOutdated, 'isOutdated').mockResolvedValue({
    outdated: false,
    branch: 'test-branch'
  })

  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(false)
})

function mockApprovedCi(
  statusCheckRollup: TestStatusCheckRollup,
  checkSuiteCount?: number
) {
  void checkSuiteCount
  const commit = {
    oid: 'abc123',
    statusCheckRollup
  }

  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {totalCount: 1},
        commits: {nodes: [{commit}]}
      }
    }
  })
}

test('treats an unfinished check run without a conclusion as unhealthy', () => {
  expect(
    filterChecks(
      'all',
      [{conclusion: null, isRequired: true, name: 'queued-check'}],
      [],
      false
    )
  ).toStrictEqual({
    message: 'one or more checks did not pass',
    status: 'FAILURE'
  })
})

test('preserves nullish fallbacks for a malformed hybrid check node', () => {
  const hybridCheck = unsafeInvalidValue<RawCheckResult>({
    conclusion: undefined,
    context: 'legacy-ci',
    isRequired: true,
    name: null,
    state: 'SUCCESS'
  })
  expect(filterChecks(['legacy-ci'], [hybridCheck], [], false)).toStrictEqual({
    message: 'all checks passed',
    status: 'SUCCESS'
  })
})

test('preserves the optional commit lookup for a malformed GraphQL node', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue(
    unsafeInvalidValue<PrechecksGraphqlResult>({
      repository: {
        pullRequest: {
          commits: {nodes: [{}]},
          mergeStateStatus: 'CLEAN',
          reviewDecision: 'APPROVED',
          reviews: {totalCount: 1}
        }
      }
    })
  )

  await expect(prechecks(context, octokit, data)).resolves.toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe commit sha from the PR head does not match the commit sha from the graphql query\n\n- sha: `abc123`\n- commit_oid: `undefined`\n\nThis is unexpected and could be caused by a commit being pushed to the branch after the initial rest call was made. Please review your PR timeline and try again.',
    status: false
  })
})

test('preserves the missing GraphQL nodes error', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue(
    unsafeInvalidValue<PrechecksGraphqlResult>({
      repository: {
        pullRequest: {
          commits: {},
          mergeStateStatus: 'CLEAN',
          reviewDecision: 'APPROVED',
          reviews: {totalCount: 1}
        }
      }
    })
  )

  await expect(prechecks(context, octokit, data)).rejects.toThrow(
    "Cannot read properties of undefined (reading '0')"
  )
})

test('preserves the caught error text for a missing GraphQL commit collection', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        mergeStateStatus: 'CLEAN',
        reviewDecision: 'APPROVED',
        reviews: {totalCount: 1}
      }
    }
  })

  await expect(prechecks(context, octokit, data)).resolves.toMatchObject({
    status: false
  })
  expect(debugMock).toHaveBeenCalledWith(
    `could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading 'nodes') - Handled: ${COLORS.success}OK`
  )
})

test('preserves the optional default-branch tree lookup', async () => {
  vi.mocked(octokit.rest.repos.getBranch).mockResolvedValueOnce(
    unsafeInvalidValue<PrechecksBranchResponse>(null)
  )

  await expect(prechecks(context, octokit, data)).resolves.toMatchObject({
    status: true
  })
  expect(setOutputMock).toHaveBeenCalledWith(
    'default_branch_tree_sha',
    undefined
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment', async () => {
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with required checks', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = 'required'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with required checks and some ignored checks', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE',
                        name: 'markdown-lint'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = 'required'
  data.inputs.ignored_checks = ['markdown-lint']

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with a few explictly requested checks and a few ignored checks', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: false,
                        conclusion: 'SUCCESS',
                        name: 'acceptance-test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE',
                        name: 'markdown-lint'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = ['test', 'acceptance-test', 'lint']
  data.inputs.ignored_checks = ['lint']

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: test'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: acceptance-test'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: lint'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - markdown-lint is not in the explicit list of checks to include (test,acceptance-test,lint)'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: markdown-lint'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with a few explictly requested checks and a few ignored checks but one CI check is missing', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: false,
                        conclusion: 'SUCCESS',
                        name: 'acceptance-test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE',
                        name: 'markdown-lint'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = ['test', 'acceptance-test', 'quality-control', 'lint']
  data.inputs.ignored_checks = ['lint']

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `MISSING`\n\n> The `checks` input option requires that all of the following checks are passing: `test,acceptance-test,quality-control,lint`. However, the following checks are missing: `quality-control`',
    status: false
  })

  expect(warningMock).toHaveBeenCalledWith(
    `the ${COLORS.info}checks${COLORS.reset} input option requires that all of the following checks are passing: ${COLORS.highlight}${data.inputs.checks.join(', ')}${COLORS.reset} - however, the following checks are missing: ${COLORS.highlight}quality-control${COLORS.reset}`
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: test'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: acceptance-test'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: lint'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - markdown-lint is not in the explicit list of checks to include (test,acceptance-test,lint)'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: markdown-lint'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment but checks and ignore checks cancel eachother out', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: false,
                        conclusion: 'SUCCESS',
                        name: 'acceptance-test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE',
                        name: 'markdown-lint'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = [
    'test',
    'acceptance-test',
    'lint',
    'markdown-lint',
    'build'
  ]
  data.inputs.ignored_checks = [
    'markdown-lint',
    'lint',
    'build',
    'test',
    'acceptance-test'
  ]

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: test'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: acceptance-test'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: lint'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: markdown-lint'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: build'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: markdown-lint'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: lint'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: build'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: test'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: acceptance-test'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - after filtering, no checks remain - this will result in a SUCCESS state as it is treated as if no checks are defined'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with ALL checks being required but the user has provided some checks to ignore', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'NEUTRAL',
                        name: 'acceptance-test'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE',
                        name: 'markdown-lint'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = 'all'
  data.inputs.ignored_checks = ['markdown-lint', 'build']

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: build'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with ALL checks being required but the user has provided some checks to ignore', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'NEUTRAL',
                        name: 'acceptance-test'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE',
                        name: 'markdown-lint'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = [] // if the array is empty, this essentially says "include all checks"
  data.inputs.ignored_checks = [] // if the array is empty, this essentially says "don't ignore any checks"

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })

  expect(debugMock).not.toHaveBeenCalledWith(
    'explicitly including ci check: test'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: build'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with ALL checks being required but the user has provided some checks to ignore but none match', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'NEUTRAL',
                        name: 'acceptance-test'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE',
                        name: 'markdown-lint'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = 'all'
  data.inputs.ignored_checks = ['xyz', 'abc']

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })

  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: build'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with ALL checks being required and the user did not provided checks to ignore and some are failing', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS',
                        name: 'test'
                      },
                      {
                        isRequired: true,
                        conclusion: 'SKIPPED',
                        name: 'lint'
                      },
                      {
                        isRequired: false,
                        conclusion: 'NEUTRAL',
                        name: 'acceptance-test'
                      },
                      {
                        isRequired: false,
                        conclusion: 'FAILURE',
                        name: 'build'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE',
                        name: 'markdown-lint'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = 'all'
  data.inputs.ignored_checks = unsafeInvalidValue<string[]>(null)

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })

  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: build'
  )
  expect(debugMock).not.toHaveBeenCalledWith(
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test.each([false, 0, ''])(
  'preserves the empty ignored-check fallback for the malformed value %s',
  async ignoredChecks => {
    data.inputs.ignored_checks = unsafeInvalidValue<string[]>(ignoredChecks)
    await expect(prechecks(context, octokit, data)).resolves.toMatchObject({
      status: true
    })
  }
)

test('runs prechecks and finds that the IssueOps command is valid for a rollback deployment', async () => {
  vi.mocked(octokit.rest.repos.getBranch).mockResolvedValue({
    data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
    status: 200
  })

  data.environmentObj.stable_branch_used = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ deployment to the ${COLORS.highlight}stable${COLORS.reset} branch requested`,
    noopMode: false,
    ref: 'main',
    status: true,
    sha: 'deadbeef',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a noop deployment', async () => {
  data.environmentObj.noop = true
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds the commit fetched via the rest call does not match the commit returned from the graphql call', async () => {
  vi.mocked(octokit.graphql).mockResolvedValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'evilcommit123'
              }
            }
          ]
        }
      }
    }
  })

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe commit sha from the PR head does not match the commit sha from the graphql query\n\n- sha: `abc123`\n- commit_oid: `evilcommit123`\n\nThis is unexpected and could be caused by a commit being pushed to the branch after the initial rest call was made. Please review your PR timeline and try again.',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid without defined CI checks', async () => {
  vi.mocked(octokit.graphql).mockResolvedValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        commits: baseCommitWithOid
      }
    }
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ CI checks have not been defined but the PR has been approved',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  expect(infoMock).toHaveBeenCalledWith(
    '💡 no CI checks have been defined for this pull request'
  )
})

test('runs prechecks and fails due to bad user permissions', async () => {
  vi.mocked(
    octokit.rest.repos.getCollaboratorPermissionLevel
  ).mockResolvedValueOnce({data: {permission: 'read'}, status: 200})
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '👋 @monalisa, that command requires the following permission(s): `admin/write`\n\nYour current permissions: `read`',
    status: false
  })
})

test('runs prechecks and fails due to a bad pull request', async () => {
  vi.mocked(octokit.rest.pulls.get).mockResolvedValueOnce({status: 500})
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: 'Could not retrieve PR info: 500',
    status: false
  })
})

// Review checks and CI checks

test.each([
  [0, 'FAILURE', 'all'],
  [0, 'PENDING', 'all'],
  [1, 'FAILURE', 'all'],
  [0, 'FAILURE', 'required']
] as const)(
  'rejects an approved deployment with %i CheckSuites, aggregate %s, and checks=%s',
  async (checkSuiteCount, aggregateState, checks) => {
    mockApprovedCi(
      {
        state: aggregateState,
        contexts: {
          nodes: [
            {
              isRequired: true,
              state: aggregateState,
              context: 'legacy-ci'
            }
          ]
        }
      },
      checkSuiteCount
    )

    data.inputs.checks = checks
    const commitStatus = checks === 'required' ? 'FAILURE' : aggregateState
    const detail =
      commitStatus === 'PENDING'
        ? 'CI checks must be passing in order to continue'
        : 'Your pull request is approved but CI checks are failing'

    expect(await prechecks(context, octokit, data)).toStrictEqual({
      message: `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`APPROVED\`\n- commitStatus: \`${commitStatus}\`\n\n> ${detail}`,
      status: false
    })
    expect(vi.mocked(octokit.graphql).mock.calls[0]?.[0]).toContain(
      '... on StatusContext'
    )
  }
)

test('accepts a requested healthy legacy status context without CheckSuites', async () => {
  mockApprovedCi(
    {
      state: 'SUCCESS',
      contexts: {
        nodes: [
          {
            isRequired: true,
            state: 'SUCCESS',
            context: 'legacy-ci'
          }
        ]
      }
    },
    0
  )

  data.inputs.checks = ['legacy-ci']

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - explicitly including ci check: legacy-ci'
  )
})

test('allows checks=required when only an optional CI check is failing', async () => {
  mockApprovedCi({
    state: 'FAILURE',
    contexts: {
      nodes: [
        {
          isRequired: false,
          conclusion: 'FAILURE',
          name: 'optional-ci'
        }
      ]
    }
  })

  data.inputs.checks = 'required'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
  expect(debugMock).toHaveBeenCalledWith(
    'filterChecks() - after filtering, no checks remain - this will result in a SUCCESS state as it is treated as if no checks are defined'
  )
})

test('rejects explicitly requested checks when the combined CI rollup is absent', async () => {
  mockApprovedCi(null)

  data.inputs.checks = ['security']

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `MISSING`\n\n> The `checks` input option requires that all of the following checks are passing: `security`. However, the following checks are missing: `security`',
    status: false
  })
})

test('runs prechecks and finds that reviews and CI checks have not been defined', async () => {
  vi.mocked(octokit.graphql).mockResolvedValueOnce({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: baseCommitWithOid
      }
    }
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '🎛️ CI checks have not been defined and required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  expect(infoMock).toHaveBeenCalledWith(
    '💡 no CI checks have been defined for this pull request'
  )
  expect(infoMock).toHaveBeenCalledWith(
    '🎛️ CI checks have not been defined and required reviewers have not been defined'
  )
})

test('runs prechecks and finds CI checks pass but reviews are not defined', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
    sha: 'abc123',
    isFork: false
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '🎛️ CI checks have been defined but required reviewers have not been defined'
  )
})

test('runs prechecks and finds CI is passing and the PR has not been reviewed BUT it is a noop deploy', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment and is from a forked repository', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
        ref: 'main'
      }
    },
    status: 200
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ PR is approved and all CI checks passed',
    status: true,
    noopMode: false,
    ref: 'abcde12345',
    sha: 'abcde12345',
    isFork: true
  })

  expect(setOutputMock).not.toHaveBeenCalledWith(
    'non_default_target_branch_used',
    'true'
  )
})

test.each([1, '1'])(
  'preserves loose fork detection for the malformed API value %s',
  async fork => {
    vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
      data: {
        head: {
          sha: 'abc123',
          ref: 'test-ref',
          label: 'test-repo:test-ref',
          repo: {
            fork: unsafeInvalidValue<boolean>(fork),
            full_name: 'test-repo/test'
          }
        },
        base: {ref: 'main'}
      },
      status: 200
    })

    await expect(prechecks(context, octokit, data)).resolves.toMatchObject({
      isFork: true,
      ref: 'abc123',
      status: true
    })
  }
)

test('runs prechecks and finds that the PR from a fork is targeting a non-default branch and rejects the deployment', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
        ref: 'some-other-branch'
      }
    },
    status: 200
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\nThis pull request is attempting to merge into the \`some-other-branch\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`). This deployment has been rejected since it could be dangerous to proceed.`,
    status: false
  })

  expect(setOutputMock).toHaveBeenCalledWith(
    'non_default_target_branch_used',
    'true'
  )
})

test('runs prechecks and finds that the PR from a fork is targeting a non-default branch and allows it based on the action config', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
        ref: 'some-other-branch'
      }
    },
    status: 200
  })

  data.inputs.allow_non_default_target_branch_deployments = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ PR is approved and all CI checks passed`,
    status: true,
    noopMode: false,
    ref: 'abcde12345',
    sha: 'abcde12345',
    isFork: true
  })

  expect(setOutputMock).toHaveBeenCalledWith(
    'non_default_target_branch_used',
    'true'
  )
})

test('runs prechecks and finds that the PR is targeting a non-default branch and rejects the deployment', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123',
        repo: {fork: false}
      },
      base: {
        ref: 'not-main'
      }
    },
    status: 200
  })

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `### ⚠️ Cannot proceed with deployment\n\nThis pull request is attempting to merge into the \`not-main\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`). This deployment has been rejected since it could be dangerous to proceed.`,
    status: false
  })

  expect(setOutputMock).toHaveBeenCalledWith(
    'non_default_target_branch_used',
    'true'
  )
})

test('runs prechecks and finds that the PR is targeting a non-default branch and allows the deployment based on the action config and logs a warning', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abcde12345',
        repo: {fork: false}
      },
      base: {
        ref: 'not-main'
      }
    },
    status: 200
  })

  data.inputs.allow_non_default_target_branch_deployments = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ PR is approved and all CI checks passed`,
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abcde12345',
    isFork: false
  })

  expect(setOutputMock).toHaveBeenCalledWith(
    'non_default_target_branch_used',
    'true'
  )

  expect(warningMock).toHaveBeenCalledWith(
    `🚨 this pull request is attempting to merge into the \`not-main\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`) - this action is potentially dangerous`
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment and is from a forked repository and the PR is approved but CI is failing and it is a noop', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 4
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
        ref: 'main'
      }
    },
    status: 200
  })

  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps command is a fork and does not require reviews so it proceeds but with a warning', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
        ref: 'main'
      }
    },
    status: 200
  })

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '🎛️ CI checks have been defined but required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'abcde12345',
    sha: 'abcde12345',
    isFork: true
  })

  expect(warningMock).toHaveBeenCalledWith(
    '🚨 pull request reviews are not enforced by this repository and this operation is being performed on a fork - this operation is dangerous! You should require reviews via branch protection settings (or rulesets) to ensure that the changes being deployed are the changes that you reviewed.'
  )
})

test('runs prechecks and rejects a pull request from a forked repository because it does not have completed reviews', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
        ref: 'main'
      }
    },
    status: 200
  })

  // Even admins cannot deploy from a forked repository without reviews
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  // Even with skipReviews set, the PR is from a forked repository and must have reviews out of pure safety
  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n\n> All deployments from forks **must** have the required reviews before they can proceed. Please ensure this PR has been reviewed and approved before trying again.',
    status: false
  })

  expect(debugMock).toHaveBeenCalledWith(
    'rejecting deployment from fork without required reviews - noopMode: false'
  )
})

test('runs prechecks and rejects a pull request from a forked repository because it does not have completed reviews (noop)', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
        ref: 'main'
      }
    },
    status: 200
  })

  // Even admins cannot deploy from a forked repository without reviews
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  // Even with skipReviews set, the PR is from a forked repository and must have reviews out of pure safety
  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n\n> All deployments from forks **must** have the required reviews before they can proceed. Please ensure this PR has been reviewed and approved before trying again.',
    status: false
  })

  expect(debugMock).toHaveBeenCalledWith(
    'rejecting deployment from fork without required reviews - noopMode: true'
  )
})

test('runs prechecks and rejects a pull request from a forked repository because it does not have completed reviews [CHANGES_REQUESTED] (noop)', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'CHANGES_REQUESTED',
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abcde12345',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
        ref: 'main'
      }
    },
    status: 200
  })

  // Even admins cannot deploy from a forked repository without reviews
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  // Even with skipReviews set, the PR is from a forked repository and must have reviews out of pure safety
  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `CHANGES_REQUESTED`\n\n> All deployments from forks **must** have the required reviews before they can proceed. Please ensure this PR has been reviewed and approved before trying again.',
    status: false
  })

  expect(debugMock).toHaveBeenCalledWith(
    'rejecting deployment from fork without required reviews - noopMode: true'
  )
})

test('runs prechecks and finds that the IssueOps command is on a PR from a forked repo and is not allowed', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 4
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
    data: {
      head: {
        sha: 'abcde12345',
        ref: 'test-ref',
        repo: {
          fork: true
        }
      },
      base: {
        ref: 'main'
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing and the PR must be approved in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is pending and reviewers have not been defined', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        reviews: {
          totalCount: 0
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        reviews: {
          totalCount: 0
        },
        commits: baseCommitWithOid
      }
    }
  })

  data.environmentObj.noop = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ CI checks have not been defined and ${COLORS.highlight}noop${COLORS.reset} requested`,
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and deploys to the stable branch', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        reviews: {
          totalCount: 0
        }
      }
    }
  })
  vi.mocked(octokit.rest.repos.getBranch).mockResolvedValue({
    data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
    status: 200
  })

  data.environmentObj.stable_branch_used = true

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ deployment to the ${COLORS.highlight}stable${COLORS.reset} branch requested`,
    status: true,
    noopMode: false,
    ref: 'main',
    sha: 'deadbeef',
    isFork: false
  })
})

test('runs prechecks and finds the PR has been approved but CI checks are pending and it is not a noop deploy', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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

test('runs prechecks and finds CI is passing but the PR is in a CHANGES_REQUESTED state for reviews', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'CHANGES_REQUESTED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `CHANGES_REQUESTED`\n- commitStatus: `SUCCESS`\n\n> CI checks are passing but an approval is required before you can proceed with deployment',
    status: false
  })

  // the same request works for a noop as changes requested is treated the same as no approval and approvals are not required for noops
  data.environmentObj.noop = true
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`,
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds the PR is approved but CI is failing', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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

test('runs prechecks and finds the PR is in a changes requested state and CI is failing', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'CHANGES_REQUESTED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `CHANGES_REQUESTED`\n- commitStatus: `FAILURE`\n\n> Your pull request needs to address the requested changes, get approvals, and have passing CI checks before you can proceed with deployment',
    status: false
  })
})

test('runs prechecks and finds the PR is in a REVIEW_REQUIRED state and CI is failing', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `FAILURE`\n\n> Your pull request needs to get approvals and have passing CI checks before you can proceed with deployment',
    status: false
  })
})

test('runs prechecks and finds the PR is in a changes requested state and has no CI checks defined', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'CHANGES_REQUESTED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `CHANGES_REQUESTED`\n- commitStatus: `null`\n\n> Your pull request is missing required approvals',
    status: false
  })
})

test('runs prechecks and finds the PR is approved but CI is failing', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    nodes: [
                      {
                        isRequired: true,
                        conclusion: 'SUCCESS'
                      },
                      {
                        isRequired: true,
                        conclusion: 'FAILURE'
                      },
                      {
                        isRequired: false,
                        conclusion: 'SUCCESS'
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  })

  data.inputs.checks = 'required'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR does not require approval but CI is failing', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: baseCommitWithOid
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: baseCommitWithOid
      }
    }
  })
  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ CI checks have not been defined but the PR has been approved',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a noop deploy and force updates the branch', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.rest.pulls.updateBranch).mockResolvedValue({
    data: {
      message: 'Updating pull request branch.',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 202
  })

  data.inputs.update_branch = 'force'
  data.environmentObj.noop = true

  vi.spyOn(isOutdated, 'isOutdated').mockResolvedValue({
    outdated: true,
    branch: 'main'
  })

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and finds the PR is un-mergable and a noop deploy', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'DIRTY',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.rest.pulls.updateBranch).mockResolvedValue({
    data: {
      message: 'merge conflict between base and head',
      url: 'https://api.github.com/repos/foo/bar/pulls/123'
    },
    status: 422
  })

  vi.spyOn(isOutdated, 'isOutdated').mockResolvedValue({
    outdated: true,
    branch: 'main'
  })

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: `422`\n- update_branch: `force`\n\n> Failed to update pull request branch with the `main` branch',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it hits an error when force updating the branch', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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

  vi.spyOn(isOutdated, 'isOutdated').mockResolvedValue({
    outdated: true,
    branch: 'main'
  })

  vi.mocked(octokit.rest.pulls.updateBranch).mockResolvedValue(
    unsafeInvalidValue<
      Awaited<ReturnType<PrechecksOctokit['rest']['pulls']['updateBranch']>>
    >(null)
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      "### ⚠️ Cannot proceed with deployment\n\n```text\nCannot read properties of null (reading 'status')\n```",
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and update_branch is set to warn', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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

  vi.spyOn(isOutdated, 'isOutdated').mockResolvedValue({
    outdated: true,
    branch: 'main'
  })

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` branch and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is a DRAFT PR and a noop deploy', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'BLOCKED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
  vi.mocked(octokit.rest.repos.getBranch).mockResolvedValueOnce({
    data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
    status: 200
  })
  vi.mocked(octokit.rest.repos.compareCommits).mockResolvedValueOnce({
    data: {behind_by: 0},
    status: 200
  })

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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'CLEAN',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
    sha: 'abc123',
    isFork: false
  })
})

test('preserves truthy draft handling for a malformed API value', async () => {
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123',
        label: 'corp:test-ref',
        repo: {fork: false, full_name: 'corp/test'}
      },
      base: {ref: 'main'},
      draft: unsafeInvalidValue<boolean>('false')
    },
    status: 200
  })

  await expect(prechecks(context, octokit, data)).resolves.toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and the commit status is null', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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

  vi.spyOn(isOutdated, 'isOutdated').mockResolvedValue({
    outdated: true,
    branch: 'main'
  })

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` branch and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a full deploy and force updates the branch', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        mergeStateStatus: 'BEHIND',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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

  vi.spyOn(isOutdated, 'isOutdated').mockResolvedValue({
    outdated: true,
    branch: 'main'
  })

  vi.mocked(octokit.rest.pulls.updateBranch).mockResolvedValue({
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
  vi.mocked(
    octokit.rest.repos.getCollaboratorPermissionLevel
  ).mockResolvedValueOnce({data: {permission: 'admin'}, status: 500})

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: 'Permission check returns non-200 status: 500',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid and from a defined admin', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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

  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ CI is passing and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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

  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  data.environmentObj.params = 'something something something'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: '✅ CI is passing and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  data.environmentObj.noop = true
  data.environmentObj.params = 'something something something'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message: `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`,
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin when CI is not defined', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: {
                  state: unsafeInvalidValue<string>(null)
                }
              }
            }
          ]
        }
      }
    }
  })

  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks have not been defined and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(infoMock).toHaveBeenLastCalledWith(
    '✅ CI checks have not been defined and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that no CI checks exist and reviews are not defined', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
    sha: 'abc123',
    isFork: false
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '🎛️ CI checks have not been defined and required reviewers have not been defined'
  )
})

test('runs prechecks and finds that no CI checks exist but reviews are defined and it is from an admin', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: null
              }
            }
          ]
        }
      }
    }
  })

  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks have not been defined and approval is bypassed due to admin rights',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '✅ CI checks have not been defined and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that no CI checks exist and the PR is not approved, but it is from an admin', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: null
              }
            }
          ]
        }
      }
    }
  })

  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks have not been defined and approval is bypassed due to admin rights',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  expect(infoMock).toHaveBeenLastCalledWith(
    '✅ CI checks have not been defined and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that skip_ci is set and the PR has been approved', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        reviews: {
          totalCount: 1
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
    sha: 'abc123',
    isFork: false
  })
  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and the PR has been approved'
  )
})

test('runs prechecks and finds that the commit status is success and skip_reviews is set for the environment', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(false)

  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.inputs.skipCi = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI checks passed and required reviewers have been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI checks passed and required reviewers have been disabled for this environment'
  )
})

test('runs prechecks and finds that no ci checks are defined and skip_reviews is set for the environment', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
                statusCheckRollup: null
              }
            }
          ]
        }
      }
    }
  })
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(false)

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
    sha: 'abc123',
    isFork: false
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
    sha: 'abc123',
    isFork: false
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
    sha: data.environmentObj.sha,
    isFork: false
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(false)

  data.environment = 'development'
  data.inputs.skipCi = 'development'
  data.inputs.skipReviews = 'staging'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '🎛️ CI requirements have been disabled for this environment and required reviewers have not been defined',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    '🎛️ CI requirements have been disabled for this environment and required reviewers have not been defined'
  )
})

test('runs prechecks and finds that skip_ci is set, reviews are required, and its a noop deploy', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(false)

  data.environment = 'development'
  data.environmentObj.noop = true
  data.inputs.skipCi = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI requirements have been disabled for this environment and **noop** requested',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and **noop** requested'
  )
})

test('runs prechecks and finds that skip_ci is set and skip_reviews is set', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(false)

  data.environment = 'development'
  data.inputs.skipCi = 'development'
  data.inputs.skipReviews = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment'
  )
})

test('runs prechecks and finds that skip_ci is set and the deployer is an admin', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(true)

  data.environment = 'development'
  data.inputs.skipCi = 'development'

  expect(await prechecks(context, octokit, data)).toStrictEqual({
    message:
      '✅ CI requirements have been disabled for this environment and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  expect(infoMock).toHaveBeenCalledWith(
    '✅ CI requirements have been disabled for this environment and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that CI is pending and reviewers have not been defined and it IS a noop deploy', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: null,
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(false)

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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'REVIEW_REQUIRED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.spyOn(isAdmin, 'isAdmin').mockResolvedValue(false)

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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BLOCKED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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

  vi.spyOn(isOutdated, 'isOutdated').mockResolvedValue({
    outdated: true,
    branch: 'main'
  })

  vi.mocked(octokit.rest.pulls.updateBranch).mockResolvedValue({
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
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'BLOCKED',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
  vi.mocked(octokit.rest.repos.getBranch).mockResolvedValueOnce({
    data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
    status: 200
  })

  vi.mocked(octokit.rest.pulls.updateBranch).mockResolvedValue({
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
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds the PR is NOT behind the stable branch (HAS_HOOKS) and a noop deploy and does not update the branch', async () => {
  vi.mocked(octokit.graphql).mockResolvedValue({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'HAS_HOOKS',
        commits: {
          nodes: [
            {
              commit: {
                oid: 'abc123',
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
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
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
  vi.mocked(octokit.rest.repos.getBranch).mockResolvedValueOnce({
    data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
    status: 200
  })
  vi.mocked(octokit.rest.pulls.updateBranch).mockResolvedValue({
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
    sha: 'abc123',
    isFork: false
  })

  expect(setOutputMock).toHaveBeenCalledWith(
    'default_branch_tree_sha',
    'beefdead'
  )
})

// Tests for branch existence checks
class NotFoundError extends Error {
  declare status: number

  constructor(message: string) {
    super(message)
    this.status = 404
  }
}

class UnexpectedError extends Error {
  declare status: number

  constructor(message: string) {
    super(message)
    this.status = 500
  }
}

test('fails prechecks when the branch does not exist (deleted branch)', async () => {
  // Mock getBranch to throw a 404 error for the PR branch check
  vi.mocked(octokit.rest.repos.getBranch)
    // First call: stable branch check (succeeds)
    .mockResolvedValueOnce({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
    // Second call: base branch check (succeeds)
    .mockResolvedValueOnce({
      data: {commit: {sha: 'deadbeef'}, name: 'main'},
      status: 200
    })
    // Third call: PR branch check (fails with 404)
    .mockRejectedValueOnce(new NotFoundError('Reference does not exist'))

  const result = await prechecks(context, octokit, data)

  expect(result.status).toBe(false)
  expect(result.message).toContain('Cannot proceed with deployment')
  expect(result.message).toContain('ref: `test-ref`')
  expect(result.message).toContain(
    'The branch for this pull request no longer exists'
  )
  expect(warningMock).toHaveBeenCalledWith('branch does not exist: test-ref')
})

test('passes prechecks when branch exists (normal deployment)', async () => {
  // Mock getBranch to succeed for all calls
  vi.mocked(octokit.rest.repos.getBranch)
    // First call: stable branch check
    .mockResolvedValueOnce({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
    // Second call: base branch check
    .mockResolvedValueOnce({
      data: {commit: {sha: 'deadbeef'}, name: 'main'},
      status: 200
    })
    // Third call: PR branch check (succeeds)
    .mockResolvedValueOnce({
      data: {commit: {sha: 'abc123'}, name: 'test-ref'},
      status: 200
    })

  const result = await prechecks(context, octokit, data)

  expect(result.status).toBe(true)
  expect(result.ref).toBe('test-ref')
  expect(debugMock).toHaveBeenCalledWith('checking if branch exists: test-ref')
  expect(infoMock).toHaveBeenCalledWith('✅ branch exists: test-ref')
})

test('skips branch existence check when deploying to stable branch', async () => {
  data.environmentObj.stable_branch_used = true

  // Mock getBranch - should only be called twice (not three times)
  vi.mocked(octokit.rest.repos.getBranch)
    .mockResolvedValueOnce({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
    .mockResolvedValueOnce({
      data: {commit: {sha: 'deadbeef'}, name: 'main'},
      status: 200
    })

  const result = await prechecks(context, octokit, data)

  expect(result.status).toBe(true)
  // Verify the branch existence check was skipped (only 2 getBranch calls, not 3)
  expect(octokit.rest.repos.getBranch).toHaveBeenCalledTimes(2)
  expect(debugMock).not.toHaveBeenCalledWith(
    'checking if branch exists: test-ref'
  )
})

test('skips branch existence check when deploying an exact SHA', async () => {
  data.environmentObj.sha = 'abc123def456'
  data.inputs.allow_sha_deployments = true

  vi.mocked(octokit.rest.repos.getBranch)
    .mockResolvedValueOnce({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
    .mockResolvedValueOnce({
      data: {commit: {sha: 'deadbeef'}, name: 'main'},
      status: 200
    })

  const result = await prechecks(context, octokit, data)

  expect(result.status).toBe(true)
  // Verify the branch existence check was skipped
  expect(octokit.rest.repos.getBranch).toHaveBeenCalledTimes(2)
  expect(debugMock).not.toHaveBeenCalledWith(
    'checking if branch exists: test-ref'
  )
})

test('skips branch existence check when PR is from a fork', async () => {
  // Mock the PR as a fork
  vi.mocked(octokit.rest.pulls.get).mockResolvedValue({
    data: {
      head: {
        ref: 'test-ref',
        sha: 'abc123',
        repo: {
          fork: true
        },
        label: 'fork:test-ref'
      },
      base: {
        ref: 'main'
      },
      draft: false
    },
    status: 200
  })

  vi.mocked(octokit.rest.repos.getBranch)
    .mockResolvedValueOnce({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
    .mockResolvedValueOnce({
      data: {commit: {sha: 'deadbeef'}, name: 'main'},
      status: 200
    })

  const result = await prechecks(context, octokit, data)

  expect(result).toMatchObject({status: true, isFork: true})
  // Verify the branch existence check was skipped for forks
  expect(octokit.rest.repos.getBranch).toHaveBeenCalledTimes(2)
  expect(debugMock).not.toHaveBeenCalledWith(
    'checking if branch exists: abc123'
  )
})

test('fails prechecks when branch check encounters unexpected error', async () => {
  // Mock getBranch to throw a non-404 error
  vi.mocked(octokit.rest.repos.getBranch)
    .mockResolvedValueOnce({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
    .mockResolvedValueOnce({
      data: {commit: {sha: 'deadbeef'}, name: 'main'},
      status: 200
    })
    .mockRejectedValueOnce(new UnexpectedError('Internal server error'))

  const result = await prechecks(context, octokit, data)

  // Should fail and not continue
  expect(result.status).toBe(false)
  expect(result.message).toContain('Cannot proceed with deployment')
  expect(result.message).toContain('ref: `test-ref`')
  expect(result.message).toContain(
    'An unexpected error occurred while checking if the branch exists'
  )
  expect(result.message).toContain('Internal server error')
})
