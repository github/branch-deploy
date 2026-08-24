import assert from 'node:assert/strict'
import {beforeEach, mock, test, type Mock} from 'node:test'
import {isDeepStrictEqual} from 'node:util'
import type {
  PrechecksBranchResponse,
  PrechecksOctokit
} from '../../src/functions/prechecks.ts'
import type {PrStackSnapshot} from '../../src/functions/pr-stacks.ts'
import type {PrStackRequiredCheck} from '../../src/functions/pr-stack-checks.ts'
import {COLORS} from '../../src/functions/colors.ts'
import type {
  BranchDeployContext,
  PrecheckData,
  PrechecksGraphqlContextsPageResult,
  PrechecksGraphqlResult,
  RawCheckResult
} from '../../src/types.ts'
import {
  createActionInputs,
  createContext,
  type DeepMutable
} from '../test-helpers.ts'
import {
  assertCalledTimes,
  assertCalledWith,
  assertLastCalledWith,
  createMock,
  installModuleMock,
  queueMockImplementation,
  stubEnv
} from '../node-test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'

type ActionsCoreModule = typeof import('../../src/actions-core.ts')
type AdminModule = typeof import('../../src/functions/admin.ts')
type OutdatedModule = typeof import('../../src/functions/outdated-check.ts')
type PrStacksModule = typeof import('../../src/functions/pr-stacks.ts')
type PrStackChecksModule =
  typeof import('../../src/functions/pr-stack-checks.ts')

const infoMock = createMock<ActionsCoreModule['info']>()
const warningMock = createMock<ActionsCoreModule['warning']>()
const debugMock = createMock<ActionsCoreModule['debug']>()
const errorMock = createMock<ActionsCoreModule['error']>()
const setOutputMock = createMock<ActionsCoreModule['setOutput']>()
const saveStateMock = createMock<ActionsCoreModule['saveState']>()
const isAdminMock = createMock<AdminModule['isAdmin']>(() =>
  Promise.resolve(false)
)
const isOutdatedMock = createMock<OutdatedModule['isOutdated']>(() =>
  Promise.resolve({outdated: false, branch: 'test-branch'})
)
const parsePrStackMembershipMock = createMock<
  PrStacksModule['parsePrStackMembership']
>(() => null)
const resolvePrStackMock = createMock<PrStacksModule['resolvePrStack']>(() =>
  Promise.resolve(null)
)
const loadPrStackRequiredChecksMock = createMock<
  PrStackChecksModule['loadPrStackRequiredChecks']
>(() => Promise.resolve([]))

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  error: errorMock,
  info: infoMock,
  saveState: saveStateMock,
  setOutput: setOutputMock,
  warning: warningMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/admin.ts', import.meta.url),
  {
    isAdmin: isAdminMock
  }
)
installModuleMock(
  mock,
  new URL('../../src/functions/outdated-check.ts', import.meta.url),
  {isOutdated: isOutdatedMock}
)
installModuleMock(
  mock,
  new URL('../../src/functions/pr-stacks.ts', import.meta.url),
  {
    parsePrStackMembership: parsePrStackMembershipMock,
    resolvePrStack: resolvePrStackMock
  }
)
installModuleMock(
  mock,
  new URL('../../src/functions/pr-stack-checks.ts', import.meta.url),
  {loadPrStackRequiredChecks: loadPrStackRequiredChecksMock}
)

const {filterChecks, prechecks} =
  await import('../../src/functions/prechecks.ts')

type Callable = (...arguments_: never[]) => unknown

function assertNotCalledWith<FunctionType extends Callable>(
  mockFunction: Mock<FunctionType>,
  ...expected: Parameters<FunctionType>
): void {
  assert.ok(
    !mockFunction.mock.calls.some(call =>
      isDeepStrictEqual(call.arguments, expected)
    ),
    'expected mock not to have been called with the supplied arguments'
  )
}

interface PrechecksOctokitFixture {
  graphql: Mock<PrechecksOctokit['graphql']>
  rest: {
    pulls: {
      get: Mock<PrechecksOctokit['rest']['pulls']['get']>
      updateBranch: Mock<PrechecksOctokit['rest']['pulls']['updateBranch']>
    }
    repos: {
      compareCommits: Mock<PrechecksOctokit['rest']['repos']['compareCommits']>
      getBranch: Mock<PrechecksOctokit['rest']['repos']['getBranch']>
      getBranchRules: Mock<PrechecksOctokit['rest']['repos']['getBranchRules']>
      getCollaboratorPermissionLevel: Mock<
        PrechecksOctokit['rest']['repos']['getCollaboratorPermissionLevel']
      >
    }
  }
}

type TestCommitCollection = NonNullable<
  PrechecksGraphqlResult['repository']['pullRequest']['commits']
>
type TestCommitNode = NonNullable<TestCommitCollection['nodes']>[number]
type TestStatusCheckRollup = Exclude<
  TestCommitNode['commit']['statusCheckRollup'],
  undefined
>

const LAST_PAGE = {endCursor: null, hasNextPage: false} as const

function checkRollup(state: string): TestStatusCheckRollup {
  return {
    state,
    contexts: {
      nodes: [{context: 'legacy-ci', isRequired: true, state}],
      pageInfo: LAST_PAGE
    }
  }
}

let context: BranchDeployContext
let getCollabOK: Mock<
  PrechecksOctokit['rest']['repos']['getCollaboratorPermissionLevel']
>
let getPullsOK: Mock<PrechecksOctokit['rest']['pulls']['get']>
let graphQLOK: Mock<PrechecksOctokit['graphql']>
let compareCommitsMock: Mock<
  PrechecksOctokit['rest']['repos']['compareCommits']
>
let getBranchMock: Mock<PrechecksOctokit['rest']['repos']['getBranch']>
let getBranchRulesMock: Mock<
  PrechecksOctokit['rest']['repos']['getBranchRules']
>
let updateBranchMock: Mock<PrechecksOctokit['rest']['pulls']['updateBranch']>
let octokit: PrechecksOctokitFixture
let data: DeepMutable<PrecheckData>
let baseCommitWithOid: TestCommitCollection

beforeEach(testContext => {
  if (!('after' in testContext)) {
    throw new TypeError('Expected a test context')
  }
  infoMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  debugMock.mock.resetCalls()
  debugMock.mock.mockImplementation(() => undefined)
  errorMock.mock.resetCalls()
  setOutputMock.mock.resetCalls()
  saveStateMock.mock.resetCalls()
  isAdminMock.mock.resetCalls()
  isAdminMock.mock.mockImplementation(() => Promise.resolve(false))
  isOutdatedMock.mock.resetCalls()
  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({outdated: false, branch: 'test-branch'})
  )
  parsePrStackMembershipMock.mock.resetCalls()
  parsePrStackMembershipMock.mock.mockImplementation(() => null)
  resolvePrStackMock.mock.resetCalls()
  resolvePrStackMock.mock.mockImplementation(() => Promise.resolve(null))
  loadPrStackRequiredChecksMock.mock.resetCalls()
  loadPrStackRequiredChecksMock.mock.mockImplementation(() =>
    Promise.resolve([])
  )
  stubEnv(testContext, 'INPUT_PERMISSIONS', 'admin,write')

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

  getCollabOK = createMock<
    PrechecksOctokit['rest']['repos']['getCollaboratorPermissionLevel']
  >(() => Promise.resolve({data: {permission: 'write'}, status: 200}))
  getPullsOK = createMock<PrechecksOctokit['rest']['pulls']['get']>(() =>
    Promise.resolve({
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
  )

  graphQLOK = createMock<PrechecksOctokit['graphql']>(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  compareCommitsMock = createMock<
    PrechecksOctokit['rest']['repos']['compareCommits']
  >(() => Promise.resolve({data: {behind_by: 0}}))
  getBranchMock = createMock<PrechecksOctokit['rest']['repos']['getBranch']>(
    () =>
      Promise.resolve({
        data: {
          commit: {
            sha: 'deadbeef',
            commit: {tree: {sha: 'beefdead'}}
          },
          name: 'test-branch'
        }
      })
  )
  getBranchRulesMock = createMock<
    PrechecksOctokit['rest']['repos']['getBranchRules']
  >(() => Promise.resolve({data: []}))
  updateBranchMock = createMock<
    PrechecksOctokit['rest']['pulls']['updateBranch']
  >(() => Promise.resolve({status: 202}))

  octokit = {
    rest: {
      repos: {
        compareCommits: compareCommitsMock,
        getBranch: getBranchMock,
        getBranchRules: getBranchRulesMock,
        getCollaboratorPermissionLevel: getCollabOK
      },
      pulls: {
        get: getPullsOK,
        updateBranch: updateBranchMock
      }
    },
    graphql: graphQLOK
  }
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

  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN',
          reviews: {totalCount: 1},
          commits: {nodes: [{commit}]}
        }
      }
    })
  )
}

function initialCheckPage(
  nodes: readonly RawCheckResult[],
  pageInfo: {readonly endCursor: string | null; readonly hasNextPage: boolean},
  state = 'FAILURE'
): PrechecksGraphqlResult {
  return {
    repository: {
      pullRequest: {
        commits: {
          nodes: [
            {
              commit: {
                id: 'commit-node',
                oid: 'abc123',
                statusCheckRollup: {contexts: {nodes, pageInfo}, state}
              }
            }
          ]
        },
        mergeStateStatus: 'CLEAN',
        reviewDecision: 'APPROVED',
        reviews: {totalCount: 1}
      }
    }
  }
}

function additionalCheckPage(
  nodes: readonly RawCheckResult[],
  pageInfo: {readonly endCursor: string | null; readonly hasNextPage: boolean},
  overrides: {
    readonly id?: string
    readonly oid?: string
  } = {}
): PrechecksGraphqlContextsPageResult {
  return {
    node: {
      id: overrides.id ?? 'commit-node',
      oid: overrides.oid ?? 'abc123',
      statusCheckRollup: {
        contexts: {nodes, pageInfo},
        state: 'FAILURE'
      }
    }
  }
}

function mockCheckPages(
  first: PrechecksGraphqlResult,
  ...pages: readonly (PrechecksGraphqlContextsPageResult | Error)[]
): void {
  queueMockImplementation(
    graphQLOK,
    () => Promise.resolve(first),
    ...pages.map(page =>
      page instanceof Error
        ? () => Promise.reject(page)
        : () => Promise.resolve(page)
    )
  )
}

async function assertChecksUnavailable(): Promise<void> {
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      "### ⚠️ Cannot proceed with deployment\n\n- commitStatus: `UNAVAILABLE`\n\n> The Action could not verify all CI checks for this pull request, so no deployment was started. Retry the command after GitHub's check data is available, or explicitly configure `skip_ci` for this environment.",
    status: false
  })
  assertCalledWith(setOutputMock, 'commit_status', 'UNAVAILABLE')
}

const STACK_STABLE_SHA = '1'.repeat(40)
const STACK_LOWER_SHA = '2'.repeat(40)
const STACK_MIDDLE_SHA = '3'.repeat(40)
const STACK_SELECTED_SHA = '4'.repeat(40)
const NATIVE_STACK = {
  repositoryId: 'repository-node',
  repository: 'corp/test',
  stackId: 'stack-node',
  stackNumber: 7,
  stableBranch: 'main',
  stableSha: STACK_STABLE_SHA,
  selectedPullNumber: 123,
  selectedPosition: 3,
  selectedHeadSha: STACK_SELECTED_SHA,
  pullRequests: [
    {
      id: 'pull-121',
      number: 121,
      position: 1,
      baseRef: 'main',
      baseSha: STACK_STABLE_SHA,
      headRef: 'feature-1',
      headSha: STACK_LOWER_SHA,
      state: 'OPEN',
      isDraft: false
    },
    {
      id: 'pull-122',
      number: 122,
      position: 2,
      baseRef: 'feature-1',
      baseSha: STACK_LOWER_SHA,
      headRef: 'feature-2',
      headSha: STACK_MIDDLE_SHA,
      state: 'OPEN',
      isDraft: false
    },
    {
      id: 'pull-123',
      number: 123,
      position: 3,
      baseRef: 'feature-2',
      baseSha: STACK_MIDDLE_SHA,
      headRef: 'feature-3',
      headSha: STACK_SELECTED_SHA,
      state: 'OPEN',
      isDraft: false
    }
  ]
} as const satisfies PrStackSnapshot

function stackPolicy({
  headSha,
  reviewDecision = 'APPROVED',
  mergeStateStatus = 'CLEAN',
  rollup = checkRollup('SUCCESS'),
  approvedReviewsCount = 1
}: {
  readonly headSha: string
  readonly reviewDecision?: string | null
  readonly mergeStateStatus?: string
  readonly rollup?: TestStatusCheckRollup
  readonly approvedReviewsCount?: number
}): PrechecksGraphqlResult {
  return {
    repository: {
      pullRequest: {
        reviewDecision,
        mergeStateStatus,
        reviews: {totalCount: approvedReviewsCount},
        commits: {
          nodes: [
            {
              commit: {
                id: 'stack-commit-' + headSha,
                oid: headSha,
                statusCheckRollup: rollup
              }
            }
          ]
        }
      }
    }
  }
}

const STACK_REQUIRED_CHECKS = [
  {context: 'test1', appId: 15368},
  {context: 'security', appId: null}
] as const satisfies readonly PrStackRequiredCheck[]

const STACK_TEST_CHECK = {
  name: 'test1',
  isRequired: true,
  conclusion: 'SUCCESS',
  checkSuite: {app: {databaseId: 15368}}
} as const satisfies RawCheckResult

const STACK_SECURITY_CHECK = {
  context: 'security',
  isRequired: true,
  state: 'SUCCESS'
} as const satisfies RawCheckResult

function stackChecksRollup(
  nodes: readonly RawCheckResult[],
  state = 'SUCCESS'
): NonNullable<TestStatusCheckRollup> {
  return {state, contexts: {nodes, pageInfo: LAST_PAGE}}
}

function mockStackRequiredChecks({
  requiredChecks = STACK_REQUIRED_CHECKS,
  rollups = new Map<number, TestStatusCheckRollup>()
}: {
  readonly requiredChecks?: readonly PrStackRequiredCheck[]
  readonly rollups?: ReadonlyMap<number, TestStatusCheckRollup>
} = {}): void {
  mockNativeStack({
    policies: new Map(
      NATIVE_STACK.pullRequests.map(pull => {
        const rollup = rollups.get(pull.number)
        return [
          pull.number,
          stackPolicy({
            headSha: pull.headSha,
            rollup:
              rollup === undefined
                ? stackChecksRollup([STACK_TEST_CHECK, STACK_SECURITY_CHECK])
                : rollup
          })
        ]
      })
    )
  })
  loadPrStackRequiredChecksMock.mock.mockImplementation(() =>
    Promise.resolve(requiredChecks)
  )
}

function stackWithDraft(pullNumber: number): PrStackSnapshot {
  return {
    ...NATIVE_STACK,
    pullRequests: NATIVE_STACK.pullRequests.map(pull =>
      pull.number === pullNumber ? {...pull, isDraft: true} : pull
    )
  }
}

function mockNativeStack({
  snapshot = NATIVE_STACK,
  policies = new Map<number, unknown>(),
  isFork = false,
  restDraft = false,
  restHeadRef,
  restBaseRef,
  restStack = {
    number: snapshot.stackNumber,
    position: snapshot.selectedPosition,
    base: {ref: snapshot.stableBranch}
  }
}: {
  readonly snapshot?: PrStackSnapshot
  readonly policies?: ReadonlyMap<number, unknown>
  readonly isFork?: boolean
  readonly restDraft?: boolean
  readonly restHeadRef?: string
  readonly restBaseRef?: string
  readonly restStack?: unknown
} = {}): void {
  const selected = snapshot.pullRequests.find(
    pull => pull.number === context.issue.number
  )
  assert.ok(selected !== undefined)
  data.inputs.enable_pr_stacks = true
  parsePrStackMembershipMock.mock.mockImplementation(() => ({
    number: snapshot.stackNumber,
    position: snapshot.selectedPosition,
    baseRef: snapshot.stableBranch
  }))
  resolvePrStackMock.mock.mockImplementation(() => Promise.resolve(snapshot))
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        head: {
          ref: restHeadRef ?? selected.headRef,
          sha: selected.headSha,
          label: 'corp:' + selected.headRef,
          repo: {fork: isFork, full_name: 'corp/test'}
        },
        base: {ref: restBaseRef ?? selected.baseRef},
        draft: restDraft,
        stack: restStack
      },
      status: 200
    })
  )
  getBranchMock.mock.mockImplementation(parameters => {
    const branch = parameters?.branch ?? 'main'
    const member = snapshot.pullRequests.find(pull => pull.headRef === branch)
    return Promise.resolve({
      data: {
        commit: {
          sha: member?.headSha ?? STACK_STABLE_SHA,
          commit: {tree: {sha: 'beefdead'}}
        },
        name: branch
      },
      status: 200
    })
  })
  graphQLOK.mock.mockImplementation((_query, variables) => {
    const pullNumber = variables['number']
    if (typeof pullNumber !== 'number') {
      throw new Error('Expected a pull request policy query')
    }
    if (policies.has(pullNumber)) {
      const policy = policies.get(pullNumber)
      if (policy instanceof Error) return Promise.reject(policy)
      return Promise.resolve(policy)
    }
    const member = snapshot.pullRequests.find(
      pull => pull.number === pullNumber
    )
    if (member === undefined) {
      throw new Error('Unexpected stack policy request: ' + String(pullNumber))
    }
    return Promise.resolve(stackPolicy({headSha: member.headSha}))
  })
}

function mockOrdinaryPrMembership(stack: unknown, draft = false): void {
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        head: {
          ref: 'test-ref',
          sha: 'abc123',
          label: 'corp:test-ref',
          repo: {fork: false, full_name: 'corp/test'}
        },
        base: {ref: 'main'},
        draft,
        ...(stack === undefined ? {} : {stack})
      },
      status: 200
    })
  )
}

async function assertStackUnavailable(): Promise<void> {
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe Action could not verify this pull request stack. Ensure it is a current, linear GitHub stack targeting the configured stable branch, then retry the command.',
    status: false
  })
  assertCalledTimes(updateBranchMock, 0)
}

async function assertLowerStackFailure(
  message: RegExp,
  pullNumber = 121
): Promise<void> {
  const result = await prechecks(context, octokit, data)
  assert.strictEqual(result.status, false)
  assert.match(result.message, message)
  assert.ok(
    result.message.includes(
      'PR #' +
        String(pullNumber) +
        ' in stack #7 did not pass deployment checks'
    )
  )
  assertCalledTimes(updateBranchMock, 0)
}

test('does not resolve PR stacks while the feature is disabled', async () => {
  mockNativeStack()
  data.inputs.enable_pr_stacks = false

  const result = await prechecks(context, octokit, data)

  assert.strictEqual(result.status, false)
  assert.match(result.message, /not the default branch/u)
  assertCalledTimes(parsePrStackMembershipMock, 0)
  assertCalledTimes(resolvePrStackMock, 0)
  assertCalledTimes(loadPrStackRequiredChecksMock, 0)
  assertCalledTimes(graphQLOK, 0)
})

for (const membership of [undefined, null]) {
  for (const noop of [false, true]) {
    test(
      'keeps standalone PR behavior without preview APIs for membership ' +
        String(membership) +
        ' and noop ' +
        String(noop),
      async () => {
        data.inputs.enable_pr_stacks = true
        data.environmentObj.noop = noop
        mockOrdinaryPrMembership(membership)
        resolvePrStackMock.mock.mockImplementation(() =>
          Promise.reject(new Error('Stack preview unavailable'))
        )
        loadPrStackRequiredChecksMock.mock.mockImplementation(() =>
          Promise.reject(new Error('Stack rules unavailable'))
        )

        assert.deepStrictEqual(await prechecks(context, octokit, data), {
          message: '✅ PR is approved and all CI checks passed',
          noopMode: noop,
          ref: 'test-ref',
          status: true,
          sha: 'abc123',
          isFork: false,
          expectNoStack: true
        })
        assertCalledTimes(resolvePrStackMock, 0)
        assertCalledTimes(loadPrStackRequiredChecksMock, 0)
        assertCalledTimes(graphQLOK, 1)
        assertCalledWith(parsePrStackMembershipMock, membership)
      }
    )
  }
}

for (const [description, fullName, requiresRecheck] of [
  ['same repository', 'corp/test', true],
  ['same repository with different case', 'CoRp/TeSt', true],
  ['different owner', 'other/test', false],
  ['different repository', 'corp/other', false],
  ['missing repository name', undefined, true],
  ['null repository name', null, true],
  ['empty repository name', '', true],
  ['incomplete repository name', 'corp', true],
  ['extra repository separator', 'corp/test/extra', true],
  ['whitespace in repository name', 'corp /test', true],
  ['non-string repository name', false, true]
] as const) {
  for (const enabled of [false, true]) {
    test(`preserves fork behavior for ${description} with stacks ${String(enabled)}`, async () => {
      data.inputs.enable_pr_stacks = enabled
      getPullsOK.mock.mockImplementation(() =>
        Promise.resolve({
          data: {
            head: {
              ref: 'test-ref',
              sha: 'abc123',
              label: 'corp:test-ref',
              repo: {
                fork: true,
                ...(fullName === undefined
                  ? {}
                  : {full_name: unsafeInvalidValue<string>(fullName)})
              }
            },
            base: {ref: 'main'}
          },
          status: 200
        })
      )
      resolvePrStackMock.mock.mockImplementation(() =>
        Promise.reject(new Error('Stack preview unavailable'))
      )
      loadPrStackRequiredChecksMock.mock.mockImplementation(() =>
        Promise.reject(new Error('Stack rules unavailable'))
      )

      assert.deepStrictEqual(await prechecks(context, octokit, data), {
        message: '✅ PR is approved and all CI checks passed',
        noopMode: false,
        ref: 'abc123',
        status: true,
        sha: 'abc123',
        isFork: true,
        ...(enabled && requiresRecheck ? {expectNoStack: true} : {})
      })
      assertCalledWith(setOutputMock, 'fork', 'true')
      assertCalledWith(saveStateMock, 'fork', 'true')
      assertCalledWith(setOutputMock, 'fork_ref', 'test-ref')
      assertCalledWith(setOutputMock, 'fork_label', 'corp:test-ref')
      assertCalledWith(setOutputMock, 'fork_checkout', 'corp-test-ref test-ref')
      assertCalledWith(setOutputMock, 'fork_full_name', fullName)
      assertCalledTimes(getPullsOK, 1)
      assertCalledTimes(resolvePrStackMock, 0)
      assertCalledTimes(loadPrStackRequiredChecksMock, 0)
      assertCalledTimes(graphQLOK, 1)
    })
  }
}

for (const membership of [undefined, null]) {
  for (const [scenario, message] of [
    ['failing CI', /CI checks are failing/u],
    ['pending CI', /CI checks must be passing/u],
    ['missing named CI', /MISSING/u],
    ['missing review', /approval is required/u],
    ['draft', /draft state/u],
    ['outdated warning', /branch is behind the base branch/u],
    ['forced update', /went ahead and updated your branch/u],
    ['noop review exception', /all CI checks passed/u]
  ] as const) {
    test(
      'preserves ordinary PR ' +
        scenario +
        ' with stack membership ' +
        String(membership),
      async () => {
        data.inputs.enable_pr_stacks = true
        mockOrdinaryPrMembership(membership, scenario === 'draft')
        resolvePrStackMock.mock.mockImplementation(() =>
          Promise.reject(new Error('Stack preview unavailable'))
        )
        if (scenario === 'failing CI' || scenario === 'pending CI') {
          mockApprovedCi(
            checkRollup(scenario === 'failing CI' ? 'FAILURE' : 'PENDING')
          )
        } else if (scenario === 'missing named CI') {
          data.inputs.checks = ['missing-check']
        } else if (
          scenario === 'missing review' ||
          scenario === 'noop review exception'
        ) {
          data.environmentObj.noop = scenario === 'noop review exception'
          graphQLOK.mock.mockImplementation(() =>
            Promise.resolve(
              stackPolicy({
                headSha: 'abc123',
                reviewDecision: 'REVIEW_REQUIRED'
              })
            )
          )
        } else if (
          scenario === 'outdated warning' ||
          scenario === 'forced update'
        ) {
          data.inputs.update_branch =
            scenario === 'forced update' ? 'force' : 'warn'
          isOutdatedMock.mock.mockImplementation(() =>
            Promise.resolve({outdated: true, branch: 'main'})
          )
        }

        const result = await prechecks(context, octokit, data)

        assert.strictEqual(result.status, scenario === 'noop review exception')
        assert.match(result.message, message)
        assertCalledTimes(resolvePrStackMock, 0)
        assertCalledTimes(loadPrStackRequiredChecksMock, 0)
        assertCalledTimes(
          updateBranchMock,
          scenario === 'forced update' ? 1 : 0
        )
        assertCalledTimes(graphQLOK, 1)
        assertCalledWith(parsePrStackMembershipMock, membership)
      }
    )
  }
}

test('ignores malformed stack metadata when stack support is disabled', async () => {
  mockOrdinaryPrMembership(false)

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
  assertCalledTimes(parsePrStackMembershipMock, 0)
  assertCalledTimes(resolvePrStackMock, 0)
  assertCalledTimes(loadPrStackRequiredChecksMock, 0)
})

for (const allowed of [false, true]) {
  test(
    'keeps the separate non-default override for an unregistered PR: ' +
      String(allowed),
    async () => {
      mockNativeStack({restStack: null})
      parsePrStackMembershipMock.mock.mockImplementation(() => null)
      resolvePrStackMock.mock.mockImplementation(() =>
        Promise.reject(new Error('Stack preview unavailable'))
      )
      data.inputs.allow_non_default_target_branch_deployments = allowed

      const result = await prechecks(context, octokit, data)

      assert.strictEqual(result.status, allowed)
      assert.strictEqual('stack' in result, false)
      assertCalledTimes(resolvePrStackMock, 0)
      assertCalledTimes(loadPrStackRequiredChecksMock, 0)
      assertCalledTimes(graphQLOK, allowed ? 1 : 0)
      if (allowed) {
        assert.ok(
          warningMock.mock.calls.some(
            call =>
              typeof call.arguments[0] === 'string' &&
              call.arguments[0].includes('potentially dangerous')
          )
        )
      }
    }
  )
}

test('checks only the selected native stack prefix', async () => {
  mockNativeStack()
  data.inputs.allow_non_default_target_branch_deployments = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'feature-3',
    status: true,
    sha: STACK_SELECTED_SHA,
    isFork: false,
    stack: NATIVE_STACK
  })
  assertCalledWith(resolvePrStackMock, octokit, {
    owner: 'corp',
    repo: 'test',
    pullNumber: 123,
    expectedHeadSha: STACK_SELECTED_SHA,
    stableBranch: 'main'
  })
  assert.deepStrictEqual(
    graphQLOK.mock.calls.map(call => call.arguments[1]['number']),
    [123, 121, 122]
  )
  assertCalledWith(infoMock, '✅ stack PR #121 passed deployment checks')
  assertCalledWith(infoMock, '✅ stack PR #122 passed deployment checks')
  assertCalledWith(setOutputMock, 'non_default_target_branch_used', 'true')
  assert.strictEqual(
    warningMock.mock.calls.some(
      call =>
        typeof call.arguments[0] === 'string' &&
        call.arguments[0].includes('potentially dangerous')
    ),
    false
  )
  assertCalledTimes(updateBranchMock, 0)
})

for (const [description, position] of [
  ['bottom', 1],
  ['last remaining', 3]
] as const) {
  for (const state of ['SUCCESS', 'FAILURE']) {
    test(
      'validates the ' +
        description +
        ' stack member targeting main with ' +
        state,
      async () => {
        const snapshot: PrStackSnapshot = {
          ...NATIVE_STACK,
          selectedPosition: position,
          pullRequests: [
            {
              ...NATIVE_STACK.pullRequests[2],
              position,
              baseRef: 'main',
              baseSha: STACK_STABLE_SHA
            }
          ]
        }
        mockNativeStack({
          snapshot,
          policies: new Map([
            [
              123,
              stackPolicy({
                headSha: STACK_SELECTED_SHA,
                rollup: checkRollup(state)
              })
            ]
          ])
        })

        const result = await prechecks(context, octokit, data)

        assert.strictEqual(result.status, state === 'SUCCESS')
        if (result.status) assert.deepStrictEqual(result.stack, snapshot)
        else assert.match(result.message, /CI checks are failing/u)
        assertCalledTimes(resolvePrStackMock, 1)
        assertCalledTimes(loadPrStackRequiredChecksMock, 1)
        assertCalledTimes(graphQLOK, 1)
      }
    )
  }
}

for (const [description, restStack] of [
  ['false', false],
  ['zero', 0],
  ['empty string', ''],
  ['array', []],
  ['empty object', {}],
  ['incomplete object', {number: 7, position: 3, base: {}}]
] as const) {
  test(
    'fails closed for malformed REST stack metadata: ' + description,
    async () => {
      mockNativeStack({restStack})
      parsePrStackMembershipMock.mock.mockImplementation(() => {
        throw new Error('Cannot verify pull request stack: invalid membership')
      })

      await assertStackUnavailable()
      assertCalledWith(parsePrStackMembershipMock, restStack)
      assertCalledTimes(resolvePrStackMock, 0)
      assertCalledTimes(loadPrStackRequiredChecksMock, 0)
      assertCalledTimes(graphQLOK, 0)
    }
  )
}

test('rejects a declared REST stack that disappears during discovery', async () => {
  mockNativeStack()
  data.inputs.allow_non_default_target_branch_deployments = true
  resolvePrStackMock.mock.mockImplementation(() => Promise.resolve(null))

  await assertStackUnavailable()
  assertCalledTimes(resolvePrStackMock, 1)
  assertCalledTimes(loadPrStackRequiredChecksMock, 0)
  assertCalledTimes(graphQLOK, 0)
})

for (const [description, membership] of [
  ['number', {number: 8, position: 3, baseRef: 'main'}],
  ['position', {number: 7, position: 2, baseRef: 'main'}],
  ['base ref', {number: 7, position: 3, baseRef: 'release'}]
] as const) {
  test(
    'rejects REST and GraphQL stack membership mismatch: ' + description,
    async () => {
      const restStack = {
        number: membership.number,
        position: membership.position,
        base: {ref: membership.baseRef}
      }
      mockNativeStack({restStack})
      parsePrStackMembershipMock.mock.mockImplementation(() => membership)

      await assertStackUnavailable()
      assertCalledWith(parsePrStackMembershipMock, restStack)
      assertCalledTimes(resolvePrStackMock, 1)
      assertCalledTimes(loadPrStackRequiredChecksMock, 0)
      assertCalledTimes(graphQLOK, 0)
    }
  )
}

for (const reason of [
  'stack metadata is unavailable',
  'stack does not target the configured stable branch',
  'stack is not linear'
]) {
  test('fails closed when the stack resolver rejects: ' + reason, async () => {
    mockNativeStack()
    data.inputs.allow_non_default_target_branch_deployments = true
    resolvePrStackMock.mock.mockImplementation(() =>
      Promise.reject(new Error(reason))
    )

    await assertStackUnavailable()
    assertCalledTimes(graphQLOK, 0)
  })
}

test('rejects a trunk SHA that changed while resolving the stack', async () => {
  mockNativeStack({
    snapshot: {...NATIVE_STACK, stableSha: '5'.repeat(40)}
  })

  await assertStackUnavailable()
  assertCalledTimes(graphQLOK, 0)
  assertCalledWith(
    debugMock,
    'PR stack verification failed: The stack changed during prechecks'
  )
})

for (const [description, restRefs] of [
  ['head ref', {restHeadRef: 'renamed-feature'}],
  ['base ref', {restBaseRef: 'main'}]
] as const) {
  test('rejects a changed selected stack ' + description, async () => {
    mockNativeStack(restRefs)

    await assertStackUnavailable()
    assertCalledTimes(graphQLOK, 0)
  })
}

const selectedStackPolicy = stackPolicy({headSha: STACK_SELECTED_SHA})
for (const [description, policy] of [
  ['missing pull request', {repository: {}}],
  [
    'missing commit',
    {
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN'
        }
      }
    }
  ],
  ['changed head', stackPolicy({headSha: '5'.repeat(40)})],
  [
    'missing review decision',
    {
      repository: {
        pullRequest: {
          ...selectedStackPolicy.repository.pullRequest,
          reviewDecision: undefined
        }
      }
    }
  ],
  [
    'unknown review decision',
    stackPolicy({headSha: STACK_SELECTED_SHA, reviewDecision: 'UNKNOWN'})
  ],
  [
    'missing merge state',
    {
      repository: {
        pullRequest: {
          ...selectedStackPolicy.repository.pullRequest,
          mergeStateStatus: undefined
        }
      }
    }
  ],
  [
    'unknown merge state',
    stackPolicy({headSha: STACK_SELECTED_SHA, mergeStateStatus: 'UNKNOWN'})
  ],
  ['unavailable policy query', new Error('Policy query unavailable')]
] as const) {
  test('rejects incomplete selected stack policy: ' + description, async () => {
    mockNativeStack({policies: new Map([[123, policy]])})

    await assertStackUnavailable()
    assertCalledTimes(graphQLOK, 1)
  })
}

for (const [description, policy] of [
  ['changed head', stackPolicy({headSha: '5'.repeat(40)})],
  [
    'unknown review decision',
    stackPolicy({headSha: STACK_LOWER_SHA, reviewDecision: 'UNKNOWN'})
  ],
  [
    'unknown merge state',
    stackPolicy({headSha: STACK_LOWER_SHA, mergeStateStatus: 'UNKNOWN'})
  ],
  ['unavailable policy query', new Error('Lower policy query unavailable')]
] as const) {
  test('rejects incomplete lower stack policy: ' + description, async () => {
    mockNativeStack({policies: new Map([[121, policy]])})

    await assertStackUnavailable()
    assert.deepStrictEqual(
      graphQLOK.mock.calls.map(call => call.arguments[1]['number']),
      [123, 121]
    )
  })
}

for (const state of ['FAILURE', 'PENDING']) {
  test('rejects ' + state + ' CI on a lower stack PR', async () => {
    mockNativeStack({
      policies: new Map([
        [
          121,
          stackPolicy({
            headSha: STACK_LOWER_SHA,
            rollup: checkRollup(state)
          })
        ]
      ])
    })

    await assertLowerStackFailure(new RegExp(state, 'u'))
    assert.deepStrictEqual(
      graphQLOK.mock.calls.map(call => call.arguments[1]['number']),
      [123, 121]
    )
  })
}

test('requires explicitly named CI checks on each lower stack PR', async () => {
  mockNativeStack({
    policies: new Map([
      [121, stackPolicy({headSha: STACK_LOWER_SHA, rollup: null})]
    ])
  })
  data.inputs.checks = ['legacy-ci']

  await assertLowerStackFailure(/following checks are missing: .legacy-ci./u)
  assertCalledTimes(loadPrStackRequiredChecksMock, 0)
})

const missingStackCheckCases = [
  ['null rollup', null, 'test1'],
  ['empty rollup', stackChecksRollup([]), 'test1'],
  [
    'optional-only checks',
    stackChecksRollup([
      {
        ...STACK_TEST_CHECK,
        name: 'optional-ci',
        isRequired: false
      }
    ]),
    'test1'
  ],
  [
    'partially missing checks',
    stackChecksRollup([STACK_TEST_CHECK]),
    'security'
  ],
  [
    'wrong GitHub App',
    stackChecksRollup([
      {...STACK_TEST_CHECK, checkSuite: {app: {databaseId: 1}}},
      STACK_SECURITY_CHECK
    ]),
    'test1'
  ],
  [
    'missing GitHub App identity',
    stackChecksRollup([
      {...STACK_TEST_CHECK, checkSuite: {app: null}},
      STACK_SECURITY_CHECK
    ]),
    'test1'
  ],
  [
    'app-bound legacy status',
    stackChecksRollup([
      {context: 'test1', isRequired: true, state: 'SUCCESS'},
      STACK_SECURITY_CHECK
    ]),
    'test1'
  ],
  [
    'non-required matching check',
    stackChecksRollup([
      {...STACK_TEST_CHECK, isRequired: false},
      STACK_SECURITY_CHECK
    ]),
    'test1'
  ]
] as const satisfies readonly (readonly [
  string,
  TestStatusCheckRollup,
  string
])[]

for (const mode of ['all', 'required', 'empty list'] as const) {
  for (const pullNumber of [121, 123]) {
    for (const [
      description,
      rollup,
      missingContext
    ] of missingStackCheckCases) {
      test(
        'rejects ' +
          description +
          ' on stack PR #' +
          String(pullNumber) +
          ' with checks ' +
          mode,
        async () => {
          mockStackRequiredChecks({rollups: new Map([[pullNumber, rollup]])})
          data.inputs.checks = mode === 'empty list' ? [] : mode

          const result = await prechecks(context, octokit, data)

          assert.strictEqual(result.status, false)
          assert.match(result.message, /commitStatus: `MISSING`/u)
          assert.ok(result.message.includes(missingContext))
          if (pullNumber === 121) {
            assert.ok(result.message.includes('PR #121 in stack #7'))
          } else {
            assertCalledWith(setOutputMock, 'commit_status', 'MISSING')
          }
          assertCalledTimes(loadPrStackRequiredChecksMock, 1)
          assertCalledTimes(updateBranchMock, 0)
        }
      )
    }
  }

  test('accepts every expected stack check with checks ' + mode, async () => {
    mockStackRequiredChecks()
    data.inputs.checks = mode === 'empty list' ? [] : mode

    assert.strictEqual((await prechecks(context, octokit, data)).status, true)
    assertCalledWith(setOutputMock, 'commit_status', 'SUCCESS')
    assertCalledWith(loadPrStackRequiredChecksMock, octokit, {
      owner: 'corp',
      repo: 'test',
      stableBranch: 'main',
      stableSha: STACK_STABLE_SHA,
      branch: {
        commit: {
          sha: STACK_STABLE_SHA,
          commit: {tree: {sha: 'beefdead'}}
        },
        name: 'main'
      }
    })
    assertCalledTimes(loadPrStackRequiredChecksMock, 1)
  })

  test('honors ignored required stack checks with checks ' + mode, async () => {
    mockStackRequiredChecks({
      rollups: new Map(
        NATIVE_STACK.pullRequests.map(pull => [
          pull.number,
          stackChecksRollup([STACK_TEST_CHECK])
        ])
      )
    })
    data.inputs.checks = mode === 'empty list' ? [] : mode
    data.inputs.ignored_checks = ['security']

    assert.strictEqual((await prechecks(context, octokit, data)).status, true)
    assertCalledTimes(loadPrStackRequiredChecksMock, 1)
  })

  for (const [description, rollup] of [
    ['null', null],
    ['empty', stackChecksRollup([])]
  ] as const) {
    test(
      'accepts a proven empty stack inventory with ' +
        description +
        ' CI and checks ' +
        mode,
      async () => {
        mockStackRequiredChecks({
          requiredChecks: [],
          rollups: new Map(
            NATIVE_STACK.pullRequests.map(pull => [pull.number, rollup])
          )
        })
        data.inputs.checks = mode === 'empty list' ? [] : mode

        assert.strictEqual(
          (await prechecks(context, octokit, data)).status,
          true
        )
        assertCalledWith(
          setOutputMock,
          'commit_status',
          rollup === null ? null : 'SUCCESS'
        )
        assertCalledTimes(loadPrStackRequiredChecksMock, 1)
      }
    )
  }
}

test('allows null stack rollups when every expected check is ignored', async () => {
  mockStackRequiredChecks({
    rollups: new Map(NATIVE_STACK.pullRequests.map(pull => [pull.number, null]))
  })
  data.inputs.checks = 'required'
  data.inputs.ignored_checks = ['test1', 'security']

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
  assertCalledTimes(loadPrStackRequiredChecksMock, 1)
})

test('accepts unbound legacy status contexts from the stack inventory', async () => {
  mockNativeStack()
  data.inputs.checks = 'required'
  loadPrStackRequiredChecksMock.mock.mockImplementation(() =>
    Promise.resolve([{context: 'legacy-ci', appId: null}])
  )

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
  assertCalledTimes(loadPrStackRequiredChecksMock, 1)
})

test('does not use another app to replace a pending required stack rerun', async () => {
  mockStackRequiredChecks({
    rollups: new Map([
      [
        121,
        stackChecksRollup([
          {...STACK_TEST_CHECK, databaseId: 10},
          {...STACK_TEST_CHECK, databaseId: 11, conclusion: null},
          {
            ...STACK_TEST_CHECK,
            checkSuite: {app: {databaseId: 1}},
            isRequired: false
          },
          STACK_SECURITY_CHECK
        ])
      ]
    ])
  })
  data.inputs.checks = 'required'

  await assertLowerStackFailure(/commitStatus: `PENDING`/u)
})

for (const mode of ['all', 'required'] as const) {
  test(
    'rejects ambiguous required stack check sources with checks ' + mode,
    async () => {
      mockStackRequiredChecks({
        rollups: new Map([
          [
            121,
            stackChecksRollup([
              {
                ...STACK_TEST_CHECK,
                checkSuite: {app: null},
                databaseId: 10
              },
              {
                ...STACK_TEST_CHECK,
                checkSuite: {app: null},
                databaseId: 11
              },
              STACK_SECURITY_CHECK
            ])
          ]
        ])
      })
      data.inputs.checks = mode
      data.inputs.ignored_checks = ['unrelated-ci']

      await assertLowerStackFailure(/could not verify all CI checks/u)
    }
  )
}

for (const mode of ['ignored', 'optional'] as const) {
  test(
    'preserves ' + mode + ' ambiguous checks in a stack inventory',
    async () => {
      const ambiguous = {
        ...STACK_TEST_CHECK,
        name: 'optional-ci',
        checkSuite: {app: null},
        isRequired: mode === 'ignored'
      }
      mockStackRequiredChecks({
        rollups: new Map([
          [
            121,
            stackChecksRollup([
              STACK_TEST_CHECK,
              STACK_SECURITY_CHECK,
              {...ambiguous, databaseId: 10},
              {...ambiguous, databaseId: 11}
            ])
          ]
        ])
      })
      data.inputs.checks = mode === 'ignored' ? 'all' : 'required'
      data.inputs.ignored_checks =
        mode === 'ignored' ? ['optional-ci'] : ['unrelated-ci']

      assert.strictEqual((await prechecks(context, octokit, data)).status, true)
    }
  )
}

test('keeps nonempty explicit stack check lists independent of the inventory', async () => {
  mockNativeStack()
  data.inputs.checks = ['legacy-ci']
  loadPrStackRequiredChecksMock.mock.mockImplementation(() =>
    Promise.reject(new Error('Inventory must not be read'))
  )

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
  assertCalledTimes(loadPrStackRequiredChecksMock, 0)
})

test('fails closed when the stack required-check inventory is unavailable', async () => {
  mockNativeStack()
  data.inputs.checks = 'required'
  loadPrStackRequiredChecksMock.mock.mockImplementation(() =>
    Promise.reject(new Error('Required checks are unavailable'))
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe Action could not read the required CI checks for this pull request stack. Make sure its base-branch rules are readable. Required-workflow rules are not yet supported by this preview.',
    status: false
  })
  assertCalledTimes(loadPrStackRequiredChecksMock, 1)
  assertCalledTimes(graphQLOK, 0)
  assertCalledTimes(updateBranchMock, 0)
})

for (const enabled of [false, true]) {
  for (const mode of ['all', 'required', 'empty list'] as const) {
    for (const [description, rollup] of [
      ['null', null],
      ['empty', stackChecksRollup([])]
    ] as const) {
      test(
        'preserves ordinary PR ' +
          description +
          ' CI with checks ' +
          mode +
          ' and stacks ' +
          String(enabled),
        async () => {
          data.inputs.enable_pr_stacks = enabled
          data.inputs.checks = mode === 'empty list' ? [] : mode
          mockApprovedCi(rollup)

          assert.strictEqual(
            (await prechecks(context, octokit, data)).status,
            true
          )
          assertCalledTimes(loadPrStackRequiredChecksMock, 0)
        }
      )
    }
  }
}

test('fails closed when a lower stack PR has incomplete CI data', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        {
          repository: {
            pullRequest: {
              reviewDecision: 'APPROVED',
              mergeStateStatus: 'CLEAN',
              commits: {nodes: [{commit: {oid: STACK_LOWER_SHA}}]}
            }
          }
        }
      ]
    ])
  })

  await assertLowerStackFailure(/could not verify all CI checks/u)
})

test('paginates required checks using the lower stack PR number', async () => {
  mockNativeStack()
  data.inputs.checks = 'required'
  queueMockImplementation(
    graphQLOK,
    () => Promise.resolve(stackPolicy({headSha: STACK_SELECTED_SHA})),
    () =>
      Promise.resolve(
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          rollup: {
            state: 'SUCCESS',
            contexts: {
              nodes: [
                {
                  context: 'legacy-ci',
                  isRequired: true,
                  state: 'SUCCESS'
                }
              ],
              pageInfo: {endCursor: 'next-check-page', hasNextPage: true}
            }
          }
        })
      ),
    (_query, variables) => {
      assert.deepStrictEqual(variables, {
        commitId: 'stack-commit-' + STACK_LOWER_SHA,
        cursor: 'next-check-page',
        number: 121
      })
      return Promise.resolve({
        node: {
          id: 'stack-commit-' + STACK_LOWER_SHA,
          oid: STACK_LOWER_SHA,
          statusCheckRollup: {
            state: 'FAILURE',
            contexts: {
              nodes: [
                {
                  context: 'security',
                  isRequired: true,
                  state: 'FAILURE'
                }
              ],
              pageInfo: LAST_PAGE
            }
          }
        }
      })
    }
  )

  await assertLowerStackFailure(/FAILURE/u)
  assertCalledTimes(graphQLOK, 3)
})

test('applies required-only CI policy to lower stack PRs', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          rollup: {
            state: 'FAILURE',
            contexts: {
              nodes: [
                {context: 'required-ci', isRequired: true, state: 'SUCCESS'},
                {context: 'optional-ci', isRequired: false, state: 'FAILURE'}
              ],
              pageInfo: LAST_PAGE
            }
          }
        })
      ]
    ])
  })
  data.inputs.checks = 'required'

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
})

test('applies ignored CI checks to lower stack PRs', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          rollup: {
            state: 'FAILURE',
            contexts: {
              nodes: [
                {context: 'legacy-ci', isRequired: true, state: 'SUCCESS'},
                {context: 'ignored-ci', isRequired: true, state: 'FAILURE'}
              ],
              pageInfo: LAST_PAGE
            }
          }
        })
      ]
    ])
  })
  data.inputs.ignored_checks = ['ignored-ci']

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
})

for (const reviewDecision of ['REVIEW_REQUIRED', 'CHANGES_REQUESTED']) {
  test('requires lower stack reviews for ' + reviewDecision, async () => {
    mockNativeStack({
      policies: new Map([
        [121, stackPolicy({headSha: STACK_LOWER_SHA, reviewDecision})]
      ])
    })

    await assertLowerStackFailure(/an approval is required/u)
  })
}

test('rejects a lower draft PR in a native stack', async () => {
  mockNativeStack({snapshot: stackWithDraft(121)})
  data.environmentObj.noop = true

  await assertLowerStackFailure(/pull request is in a draft state/u)
})

test('honors draft-permitted environments for lower stack PRs', async () => {
  mockNativeStack({snapshot: stackWithDraft(121)})
  data.inputs.draft_permitted_targets = 'production'

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
})

test('uses the selected stack draft state instead of older REST data', async () => {
  mockNativeStack({snapshot: stackWithDraft(123), restDraft: false})

  const result = await prechecks(context, octokit, data)

  assert.strictEqual(result.status, false)
  assert.match(result.message, /pull request is in a draft state/u)
})

test('accepts a selected stack PR that is no longer a draft', async () => {
  mockNativeStack({restDraft: true})

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
})

test('keeps the usual noop review exception for lower stack PRs', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          reviewDecision: 'REVIEW_REQUIRED'
        })
      ]
    ])
  })
  data.environmentObj.noop = true

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: true,
    noopMode: true,
    stack: NATIVE_STACK
  })
})

test('still requires passing lower stack CI for a noop', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          reviewDecision: 'REVIEW_REQUIRED',
          rollup: checkRollup('PENDING')
        })
      ]
    ])
  })
  data.environmentObj.noop = true

  await assertLowerStackFailure(/CI checks must be passing/u)
})

test('honors skip_reviews for lower same-repository stack PRs', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          reviewDecision: 'CHANGES_REQUESTED'
        })
      ]
    ])
  })
  data.inputs.skipReviews = 'production'

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
  assertCalledWith(setOutputMock, 'review_decision', 'skip_reviews')
})

test('honors skip_ci for lower stack PRs', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          rollup: checkRollup('FAILURE')
        })
      ]
    ])
  })
  data.inputs.skipCi = 'production'
  loadPrStackRequiredChecksMock.mock.mockImplementation(() =>
    Promise.reject(new Error('Inventory must not be read'))
  )

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
  assertCalledWith(setOutputMock, 'commit_status', 'skip_ci')
  assertCalledTimes(loadPrStackRequiredChecksMock, 0)
})

test('keeps the admin review exception for lower stack PRs', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          reviewDecision: 'REVIEW_REQUIRED'
        })
      ]
    ])
  })
  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
})

test('does not let admins bypass failing lower stack CI', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          rollup: checkRollup('FAILURE')
        })
      ]
    ])
  })
  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  await assertLowerStackFailure(/CI checks are failing/u)
})

test('preserves fork review restrictions for lower stack PRs', async () => {
  mockNativeStack({
    isFork: true,
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          reviewDecision: 'REVIEW_REQUIRED'
        })
      ]
    ])
  })
  data.inputs.skipReviews = 'production'
  data.environmentObj.noop = true
  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  await assertLowerStackFailure(/All deployments from forks/u)
})

test('does not require stack merge readiness before creating a required deployment', async () => {
  mockNativeStack({
    policies: new Map(
      NATIVE_STACK.pullRequests.map(pull => [
        pull.number,
        stackPolicy({headSha: pull.headSha, mergeStateStatus: 'BLOCKED'})
      ])
    )
  })

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
  assertCalledWith(setOutputMock, 'merge_state_status', 'BLOCKED')
})

test('does not replace selected PR outputs or state with lower stack policy', async () => {
  mockNativeStack({
    policies: new Map([
      [
        121,
        stackPolicy({
          headSha: STACK_LOWER_SHA,
          reviewDecision: null,
          rollup: null,
          approvedReviewsCount: 0
        })
      ],
      [
        122,
        stackPolicy({
          headSha: STACK_MIDDLE_SHA,
          approvedReviewsCount: 2
        })
      ],
      [
        123,
        stackPolicy({
          headSha: STACK_SELECTED_SHA,
          mergeStateStatus: 'BLOCKED',
          approvedReviewsCount: 9
        })
      ]
    ])
  })

  assert.strictEqual((await prechecks(context, octokit, data)).status, true)
  const selectedOutputKeys = [
    'commit_status',
    'review_decision',
    'merge_state_status',
    'approved_reviews_count'
  ]
  assert.deepStrictEqual(
    setOutputMock.mock.calls
      .filter(call => selectedOutputKeys.includes(call.arguments[0]))
      .map(call => call.arguments),
    [
      ['commit_status', 'SUCCESS'],
      ['review_decision', 'APPROVED'],
      ['merge_state_status', 'BLOCKED'],
      ['approved_reviews_count', 9]
    ]
  )
  assert.deepStrictEqual(
    saveStateMock.mock.calls
      .filter(
        call =>
          call.arguments[0] === 'review_decision' ||
          call.arguments[0] === 'approved_reviews_count'
      )
      .map(call => call.arguments),
    [
      ['review_decision', 'APPROVED'],
      ['approved_reviews_count', 9]
    ]
  )
})

test('refuses automatic branch updates for a stale native stack', async () => {
  mockNativeStack()
  data.inputs.update_branch = 'force'
  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({outdated: true, branch: 'main'})
  )

  const result = await prechecks(context, octokit, data)

  assert.strictEqual(result.status, false)
  assert.match(result.message, /Rebase the stack and rerun its checks/u)
  assertCalledTimes(updateBranchMock, 0)
})

test('does not bypass a stale lower stack PR when branch updates are disabled', async () => {
  mockNativeStack({
    policies: new Map([
      [
        122,
        stackPolicy({
          headSha: STACK_MIDDLE_SHA,
          mergeStateStatus: 'BEHIND'
        })
      ]
    ])
  })
  data.inputs.update_branch = 'disabled'

  await assertLowerStackFailure(/branch is behind the base branch/u, 122)
})

test('keeps stable-branch rollbacks outside stack resolution', async () => {
  data.inputs.enable_pr_stacks = true
  data.environmentObj.stable_branch_used = true
  mockOrdinaryPrMembership(false)
  resolvePrStackMock.mock.mockImplementation(() =>
    Promise.reject(new Error('Stack endpoint unavailable'))
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ deployment to the ' +
      COLORS.highlight +
      'stable' +
      COLORS.reset +
      ' branch requested',
    noopMode: false,
    ref: 'main',
    status: true,
    sha: 'deadbeef',
    isFork: false
  })
  assertCalledTimes(parsePrStackMembershipMock, 0)
  assertCalledTimes(resolvePrStackMock, 0)
  assertCalledTimes(loadPrStackRequiredChecksMock, 0)
})

for (const allowed of [false, true]) {
  test(
    'keeps explicit SHA command behavior with stack support enabled: ' +
      String(allowed),
    async () => {
      data.inputs.enable_pr_stacks = true
      data.inputs.allow_sha_deployments = allowed
      data.environmentObj.sha = STACK_SELECTED_SHA
      mockOrdinaryPrMembership(false)
      resolvePrStackMock.mock.mockImplementation(() =>
        Promise.reject(new Error('Stack endpoint unavailable'))
      )

      const result = await prechecks(context, octokit, data)

      assert.strictEqual(result.status, allowed)
      assert.strictEqual('stack' in result, false)
      if (allowed) {
        assert.partialDeepStrictEqual(result, {
          ref: STACK_SELECTED_SHA,
          sha: STACK_SELECTED_SHA
        })
        assertCalledWith(setOutputMock, 'sha_deployment', STACK_SELECTED_SHA)
      } else {
        assert.match(result.message, /sha deployments have not been enabled/u)
      }
      assertCalledTimes(parsePrStackMembershipMock, 0)
      assertCalledTimes(resolvePrStackMock, 0)
      assertCalledTimes(loadPrStackRequiredChecksMock, 0)
    }
  )
}

for (const membership of [undefined, null]) {
  test(
    'preserves ordinary PR policy-query errors with stack membership ' +
      String(membership),
    async () => {
      data.inputs.enable_pr_stacks = true
      mockOrdinaryPrMembership(membership)
      const failure = new Error('Ordinary policy query unavailable')
      graphQLOK.mock.mockImplementation(() => Promise.reject(failure))
      resolvePrStackMock.mock.mockImplementation(() =>
        Promise.reject(new Error('Stack preview unavailable'))
      )

      await assert.rejects(prechecks(context, octokit, data), failure)
      assertCalledTimes(resolvePrStackMock, 0)
      assertCalledTimes(loadPrStackRequiredChecksMock, 0)
    }
  )
}

test('treats an unfinished check run without a conclusion as unhealthy', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [{conclusion: null, isRequired: true, name: 'queued-check'}],
      [],
      false
    ),
    {
      message: 'one or more checks are pending',
      status: 'PENDING'
    }
  )
})

test('preserves nullish fallbacks for a malformed hybrid check node', () => {
  const hybridCheck = unsafeInvalidValue<RawCheckResult>({
    conclusion: undefined,
    context: 'legacy-ci',
    isRequired: true,
    name: null,
    state: 'SUCCESS'
  })
  assert.deepStrictEqual(
    filterChecks(['legacy-ci'], [hybridCheck], [], false),
    {
      message: 'all checks passed',
      status: 'SUCCESS'
    }
  )
})

test('uses the newest check run after a successful rerun', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [
        {
          checkSuite: {app: {databaseId: 1}},
          completedAt: '2026-01-01T00:00:00Z',
          conclusion: 'FAILURE',
          databaseId: 10,
          id: 'old',
          isRequired: true,
          name: 'test'
        },
        {
          checkSuite: {app: {databaseId: 1}},
          completedAt: '2026-01-01T00:01:00Z',
          conclusion: 'SUCCESS',
          databaseId: 11,
          id: 'new',
          isRequired: true,
          name: 'test'
        }
      ],
      [],
      false
    ),
    {message: 'all checks passed', status: 'SUCCESS'}
  )
})

test('uses the database ID to order check reruns with equal timestamps', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [
        {
          checkSuite: {app: {databaseId: 1}},
          conclusion: 'FAILURE',
          databaseId: 10,
          id: 'old',
          isRequired: true,
          name: 'test',
          startedAt: '2026-01-01T00:00:00Z'
        },
        {
          checkSuite: {app: {databaseId: 1}},
          conclusion: 'SUCCESS',
          databaseId: 11,
          id: 'new',
          isRequired: true,
          name: 'test',
          startedAt: '2026-01-01T00:00:00Z'
        }
      ],
      [],
      false
    ),
    {message: 'all checks passed', status: 'SUCCESS'}
  )
})

test('uses the newer check run even when the older run completes later', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [
        {
          checkSuite: {app: {databaseId: 1}},
          completedAt: '2026-01-01T00:02:00Z',
          conclusion: 'SUCCESS',
          databaseId: 10,
          id: 'old',
          isRequired: true,
          name: 'test',
          startedAt: '2026-01-01T00:00:00Z'
        },
        {
          checkSuite: {app: {databaseId: 1}},
          completedAt: null,
          conclusion: null,
          databaseId: 11,
          id: 'new',
          isRequired: true,
          name: 'test',
          startedAt: '2026-01-01T00:01:00Z'
        }
      ],
      [],
      false
    ),
    {message: 'one or more checks are pending', status: 'PENDING'}
  )
})

test('keeps a newer pending status context blocking', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [
        {
          context: 'ci/test',
          id: 'old',
          isRequired: true,
          state: 'SUCCESS',
          updatedAt: '2026-01-01T00:00:00Z'
        },
        {
          context: 'ci/test',
          id: 'new',
          isRequired: true,
          state: 'PENDING',
          updatedAt: '2026-01-01T00:01:00Z'
        }
      ],
      [],
      false
    ),
    {message: 'one or more checks are pending', status: 'PENDING'}
  )
})

test('keeps a newer status context when an older result appears later', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [
        {
          context: 'ci/test',
          id: 'new',
          isRequired: true,
          state: 'SUCCESS',
          updatedAt: '2026-01-01T00:01:00Z'
        },
        {
          context: 'ci/test',
          id: 'old',
          isRequired: true,
          state: 'FAILURE',
          updatedAt: '2026-01-01T00:00:00Z'
        }
      ],
      [],
      false
    ),
    {message: 'all checks passed', status: 'SUCCESS'}
  )
})

test('rejects duplicate checks without deterministic ordering data', () => {
  assert.throws(
    () =>
      filterChecks(
        'all',
        [
          {
            checkSuite: {app: {databaseId: 1}},
            conclusion: 'FAILURE',
            isRequired: true,
            name: 'test'
          },
          {
            checkSuite: {app: {databaseId: 1}},
            conclusion: 'SUCCESS',
            isRequired: true,
            name: 'test'
          }
        ],
        [],
        false
      ),
    {message: 'A duplicate check result is missing its timestamp'}
  )
})

test('keeps a newer check when an older result appears later', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [
        {
          checkSuite: {app: {databaseId: 1}},
          conclusion: 'SUCCESS',
          databaseId: 11,
          id: 'new',
          isRequired: true,
          name: 'test',
          startedAt: '2026-01-01T00:01:00Z'
        },
        {
          checkSuite: {app: {databaseId: 1}},
          conclusion: 'FAILURE',
          databaseId: 10,
          id: 'old',
          isRequired: true,
          name: 'test',
          startedAt: '2026-01-01T00:00:00Z'
        }
      ],
      [],
      false
    ),
    {message: 'all checks passed', status: 'SUCCESS'}
  )
})

test('keeps the larger check database ID regardless of response order', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [
        {
          checkSuite: {app: {databaseId: 1}},
          conclusion: 'SUCCESS',
          databaseId: 11,
          id: 'new',
          isRequired: true,
          name: 'test',
          startedAt: '2026-01-01T00:00:00Z'
        },
        {
          checkSuite: {app: {databaseId: 1}},
          conclusion: 'FAILURE',
          databaseId: 10,
          id: 'old',
          isRequired: true,
          name: 'test',
          startedAt: '2026-01-01T00:00:00Z'
        }
      ],
      [],
      false
    ),
    {message: 'all checks passed', status: 'SUCCESS'}
  )
})

test('accepts a duplicate status node with the same identity and timestamp', () => {
  const check = {
    context: 'ci/test',
    id: 'same',
    isRequired: true,
    state: 'SUCCESS',
    updatedAt: '2026-01-01T00:00:00Z'
  }
  assert.deepStrictEqual(filterChecks('all', [check, check], [], false), {
    message: 'all checks passed',
    status: 'SUCCESS'
  })
})

test('uses a status context creation time when its update time is null', () => {
  assert.deepStrictEqual(
    filterChecks(
      'all',
      [
        unsafeInvalidValue<RawCheckResult>({
          context: 'ci/test',
          createdAt: '2026-01-01T00:00:00Z',
          id: 'old',
          isRequired: true,
          state: 'FAILURE',
          updatedAt: null
        }),
        {
          context: 'ci/test',
          id: 'new',
          isRequired: true,
          state: 'SUCCESS',
          updatedAt: '2026-01-01T00:01:00Z'
        }
      ],
      [],
      false
    ),
    {message: 'all checks passed', status: 'SUCCESS'}
  )
})

test('accepts duplicate check runs with the same node identity', () => {
  const check = {
    checkSuite: {app: {databaseId: 1}},
    conclusion: 'SUCCESS',
    id: 'same',
    isRequired: true,
    name: 'test',
    startedAt: '2026-01-01T00:00:00Z'
  }
  assert.deepStrictEqual(filterChecks('all', [check, check], [], false), {
    message: 'all checks passed',
    status: 'SUCCESS'
  })
})

test('rejects duplicate check runs without integration identities', () => {
  const check = {
    conclusion: 'SUCCESS',
    id: 'same',
    isRequired: true,
    name: 'test',
    startedAt: '2026-01-01T00:00:00Z'
  }
  assert.throws(() => filterChecks('all', [check, check], [], false), {
    message:
      'A duplicate check result is missing its integration identity: check:null:test'
  })
})

for (const checks of ['all', 'required'] as const) {
  for (const [description, app] of [
    ['a missing GitHub App', null],
    ['a missing GitHub App database ID', {databaseId: null}]
  ] as const) {
    test(`rejects same-name ${checks} check runs from ${description} before comparing database IDs`, () => {
      const olderCheck = {
        checkSuite: {app},
        conclusion: 'FAILURE',
        databaseId: 10,
        id: 'old',
        isRequired: true,
        name: 'test',
        startedAt: '2026-01-01T00:00:00Z'
      }
      const newerCheck = {
        ...olderCheck,
        conclusion: 'SUCCESS',
        databaseId: 11,
        id: 'new'
      }

      assert.throws(
        () =>
          filterChecks(
            checks,
            [olderCheck, newerCheck],
            [],
            checks === 'required'
          ),
        {
          message:
            'A duplicate check result is missing its integration identity: check:null:test'
        }
      )
    })
  }
}

for (const {description, checks, ignoredChecks, required, isRequired} of [
  {
    description: 'an ignored check',
    checks: 'all',
    ignoredChecks: ['excluded-check'],
    required: false,
    isRequired: true
  },
  {
    description: 'a check outside an explicit list',
    checks: ['required-check'],
    ignoredChecks: [],
    required: false,
    isRequired: true
  },
  {
    description: 'an optional check in required mode',
    checks: 'required',
    ignoredChecks: [],
    required: true,
    isRequired: false
  }
] as const) {
  test(`ignores ambiguous GitHub App identities for ${description}`, () => {
    const healthyCheck = {
      checkSuite: {app: {databaseId: 1}},
      conclusion: 'SUCCESS',
      databaseId: 12,
      id: 'healthy',
      isRequired: true,
      name: 'required-check'
    }
    const excludedCheck = {
      checkSuite: {app: null},
      conclusion: 'FAILURE',
      databaseId: 10,
      id: 'old',
      isRequired,
      name: 'excluded-check'
    }
    const rerun = {
      ...excludedCheck,
      conclusion: 'SUCCESS',
      databaseId: 11,
      id: 'new'
    }

    assert.deepStrictEqual(
      filterChecks(
        checks,
        [healthyCheck, excludedCheck, rerun],
        ignoredChecks,
        required
      ),
      {message: 'all checks passed', status: 'SUCCESS'}
    )
  })
}

for (const [description, checks] of [
  ['an explicit check list', ['required-check']],
  ['an empty check list', []]
] as const) {
  test(`rejects ambiguous GitHub App identities selected by ${description}`, () => {
    const check = {
      checkSuite: {app: null},
      conclusion: 'FAILURE',
      databaseId: 10,
      id: 'old',
      isRequired: true,
      name: 'required-check'
    }

    assert.throws(
      () =>
        filterChecks(
          checks,
          [check, {...check, conclusion: 'SUCCESS', databaseId: 11, id: 'new'}],
          [],
          false
        ),
      {
        message:
          'A duplicate check result is missing its integration identity: check:null:required-check'
      }
    )
  })
}

for (const [olderRequired, newerRequired] of [
  [false, true],
  [true, false]
] as const) {
  test(`rejects ambiguous check identities when either duplicate is required (${String(olderRequired)}, ${String(newerRequired)})`, () => {
    const check = {
      checkSuite: {app: null},
      conclusion: 'FAILURE',
      databaseId: 10,
      id: 'old',
      isRequired: olderRequired,
      name: 'required-check'
    }

    assert.throws(
      () =>
        filterChecks(
          'required',
          [
            check,
            {
              ...check,
              conclusion: 'SUCCESS',
              databaseId: 11,
              id: 'new',
              isRequired: newerRequired
            }
          ],
          [],
          true
        ),
      {
        message:
          'A duplicate check result is missing its integration identity: check:null:required-check'
      }
    )
  })
}

test('rejects malformed required-check metadata', () => {
  assert.throws(
    () =>
      filterChecks(
        'required',
        [
          unsafeInvalidValue<RawCheckResult>({
            conclusion: 'SUCCESS',
            isRequired: undefined,
            name: 'test'
          })
        ],
        [],
        true
      ),
    {message: 'A check result has an invalid required-check flag'}
  )
})

for (const check of [
  {conclusion: 'SUCCESS', isRequired: true, name: ''},
  {isRequired: true, state: 'SUCCESS'},
  {context: '', isRequired: true, state: 'SUCCESS'}
] as const) {
  test(`rejects malformed check identity ${JSON.stringify(check)}`, () => {
    assert.throws(() =>
      filterChecks(
        'all',
        [unsafeInvalidValue<RawCheckResult>(check)],
        [],
        false
      )
    )
  })
}

test('rejects a duplicate check with a null timestamp', () => {
  const check = unsafeInvalidValue<RawCheckResult>({
    checkSuite: {app: {databaseId: 1}},
    completedAt: null,
    conclusion: 'SUCCESS',
    id: 'same',
    isRequired: true,
    name: 'test',
    startedAt: null
  })
  assert.throws(() => filterChecks('all', [check, check], [], false), {
    message: 'A duplicate check result is missing its timestamp'
  })
})

test('rejects tied check runs without database or node identities', () => {
  assert.throws(
    () =>
      filterChecks(
        'all',
        [
          {
            checkSuite: {app: {databaseId: 1}},
            conclusion: 'FAILURE',
            isRequired: true,
            name: 'test',
            startedAt: '2026-01-01T00:00:00Z'
          },
          {
            checkSuite: {app: {databaseId: 1}},
            conclusion: 'SUCCESS',
            isRequired: true,
            name: 'test',
            startedAt: '2026-01-01T00:00:00Z'
          }
        ],
        [],
        false
      ),
    {message: 'Check ordering is ambiguous for check:1:test'}
  )
})

test('rejects duplicate malformed status contexts without timestamps', () => {
  const malformed = unsafeInvalidValue<RawCheckResult>({
    context: 'ci/test',
    id: 'same',
    isRequired: true,
    state: 'SUCCESS'
  })
  assert.throws(() => filterChecks('all', [malformed, malformed], [], false), {
    message: 'A duplicate check result is missing its timestamp'
  })
})

test('rejects a duplicate check with an invalid timestamp', () => {
  assert.throws(
    () =>
      filterChecks(
        'all',
        [
          {
            checkSuite: {app: {databaseId: 1}},
            conclusion: 'FAILURE',
            isRequired: true,
            name: 'test',
            startedAt: 'not-a-time'
          },
          {
            checkSuite: {app: {databaseId: 1}},
            conclusion: 'SUCCESS',
            isRequired: true,
            name: 'test',
            startedAt: '2026-01-01T00:00:00Z'
          }
        ],
        [],
        false
      ),
    {message: 'A check result has an invalid timestamp: not-a-time'}
  )
})

test('rejects status reruns with tied timestamps and different identities', () => {
  assert.throws(
    () =>
      filterChecks(
        'all',
        [
          {
            context: 'ci/test',
            id: 'one',
            isRequired: true,
            state: 'FAILURE',
            updatedAt: '2026-01-01T00:00:00Z'
          },
          {
            context: 'ci/test',
            id: 'two',
            isRequired: true,
            state: 'SUCCESS',
            updatedAt: '2026-01-01T00:00:00Z'
          }
        ],
        [],
        false
      ),
    {message: 'Check ordering is ambiguous for status:ci/test'}
  )
})

test('fails closed for a malformed GraphQL commit node', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve(
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
  )

  await assertChecksUnavailable()
})

test('fails closed when GraphQL commit nodes are missing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve(
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
  )

  await assertChecksUnavailable()
})

test('fails closed when the GraphQL commit collection is missing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          mergeStateStatus: 'CLEAN',
          reviewDecision: 'APPROVED',
          reviews: {totalCount: 1}
        }
      }
    })
  )

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: false
  })
  assertCalledWith(
    debugMock,
    'could not retrieve PR commit status: Error: The GraphQL response did not include a commit'
  )
  assertCalledWith(
    warningMock,
    'CI check verification is unavailable; deployment will not proceed'
  )
  assertCalledWith(setOutputMock, 'commit_status', 'UNAVAILABLE')
})

test('preserves the fallback when raw GraphQL debug output throws', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          mergeStateStatus: 'CLEAN',
          reviewDecision: 'APPROVED',
          reviews: {totalCount: 1}
        }
      }
    })
  )
  debugMock.mock.mockImplementation(message => {
    if (typeof message !== 'string') {
      throw new TypeError('debug output must be a string')
    }
  })

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: false
  })
  assertCalledWith(
    debugMock,
    'Could not output raw graphql result for debugging - This is bad'
  )
})

test('preserves the optional default-branch tree lookup', async () => {
  getBranchMock.mock.mockImplementationOnce(() =>
    Promise.resolve(unsafeInvalidValue<PrechecksBranchResponse>(null))
  )

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: true
  })
  assertCalledWith(setOutputMock, 'default_branch_tree_sha', undefined)
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment', async () => {
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with required checks', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  data.inputs.checks = 'required'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with required checks and some ignored checks', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  data.inputs.checks = 'required'
  data.inputs.ignored_checks = ['markdown-lint']

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with a few explictly requested checks and a few ignored checks', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  data.inputs.checks = ['test', 'acceptance-test', 'lint']
  data.inputs.ignored_checks = ['lint']

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: test'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: acceptance-test'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: lint'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - markdown-lint is not in the explicit list of checks to include (test,acceptance-test,lint)'
  )
  assertNotCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: markdown-lint'
  )
  assertCalledWith(debugMock, 'filterChecks() - ignoring ci check: lint')
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with a few explictly requested checks and a few ignored checks but one CI check is missing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  data.inputs.checks = ['test', 'acceptance-test', 'quality-control', 'lint']
  data.inputs.ignored_checks = ['lint']

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `MISSING`\n\n> The `checks` input option requires that all of the following checks are passing: `test,acceptance-test,quality-control,lint`. However, the following checks are missing: `quality-control`',
    status: false
  })

  assertCalledWith(
    warningMock,
    `the ${COLORS.info}checks${COLORS.reset} input option requires that all of the following checks are passing: ${COLORS.highlight}${data.inputs.checks.join(', ')}${COLORS.reset} - however, the following checks are missing: ${COLORS.highlight}quality-control${COLORS.reset}`
  )
  assertNotCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: test'
  )
  assertNotCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: acceptance-test'
  )
  assertNotCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: lint'
  )
  assertNotCalledWith(
    debugMock,
    'filterChecks() - markdown-lint is not in the explicit list of checks to include (test,acceptance-test,lint)'
  )
  assertNotCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: markdown-lint'
  )
  assertNotCalledWith(debugMock, 'filterChecks() - ignoring ci check: lint')
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment but checks and ignore checks cancel eachother out', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

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

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: test'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: acceptance-test'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: lint'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: markdown-lint'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: build'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: markdown-lint'
  )
  assertCalledWith(debugMock, 'filterChecks() - ignoring ci check: lint')
  assertCalledWith(debugMock, 'filterChecks() - ignoring ci check: build')
  assertCalledWith(debugMock, 'filterChecks() - ignoring ci check: test')
  assertCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: acceptance-test'
  )
  assertCalledWith(
    debugMock,
    'filterChecks() - after filtering, no checks remain - this will result in a SUCCESS state as it is treated as if no checks are defined'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with ALL checks being required but the user has provided some checks to ignore', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  data.inputs.checks = 'all'
  data.inputs.ignored_checks = ['markdown-lint', 'build']

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(debugMock, 'filterChecks() - ignoring ci check: build')
  assertCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with ALL checks being required but the user has provided some checks to ignore', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  data.inputs.checks = [] // if the array is empty, this essentially says "include all checks"
  data.inputs.ignored_checks = [] // if the array is empty, this essentially says "don't ignore any checks"

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })

  assertNotCalledWith(debugMock, 'explicitly including ci check: test')
  assertNotCalledWith(debugMock, 'filterChecks() - ignoring ci check: build')
  assertNotCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with ALL checks being required but the user has provided some checks to ignore but none match', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  data.inputs.checks = 'all'
  data.inputs.ignored_checks = ['xyz', 'abc']

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })

  assertNotCalledWith(debugMock, 'filterChecks() - ignoring ci check: build')
  assertNotCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment with ALL checks being required and the user did not provided checks to ignore and some are failing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
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
  )

  data.inputs.checks = 'all'
  data.inputs.ignored_checks = unsafeInvalidValue<string[]>(null)

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })

  assertNotCalledWith(debugMock, 'filterChecks() - ignoring ci check: build')
  assertNotCalledWith(
    debugMock,
    'filterChecks() - ignoring ci check: markdown-lint'
  )
})

for (const ignoredChecks of [false, 0, ''] as const) {
  test(`preserves the empty ignored-check fallback for the malformed value ${String(ignoredChecks)}`, async () => {
    data.inputs.ignored_checks = unsafeInvalidValue<string[]>(ignoredChecks)
    assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
      status: true
    })
  })
}

test('runs prechecks and finds that the IssueOps command is valid for a rollback deployment', async () => {
  getBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
      status: 200
    })
  )

  data.environmentObj.stable_branch_used = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
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
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds the commit fetched via the rest call does not match the commit returned from the graphql call', async () => {
  graphQLOK.mock.mockImplementationOnce(() =>
    Promise.resolve({
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
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\nThe commit sha from the PR head does not match the commit sha from the graphql query\n\n- sha: `abc123`\n- commit_oid: `evilcommit123`\n\nThis is unexpected and could be caused by a commit being pushed to the branch after the initial rest call was made. Please review your PR timeline and try again.',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid without defined CI checks', async () => {
  graphQLOK.mock.mockImplementationOnce(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          commits: baseCommitWithOid
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ CI checks have not been defined but the PR has been approved',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  assertCalledWith(
    infoMock,
    '💡 no CI checks have been defined for this pull request'
  )
})

test('runs prechecks and fails due to bad user permissions', async () => {
  getCollabOK.mock.mockImplementationOnce(() =>
    Promise.resolve({data: {permission: 'read'}, status: 200})
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '👋 @monalisa, that command requires the following permission(s): `admin/write`\n\nYour current permissions: `read`',
    status: false
  })
})

test('runs prechecks and fails due to a bad pull request', async () => {
  getPullsOK.mock.mockImplementationOnce(() => Promise.resolve({status: 500}))
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: 'Could not retrieve PR info: 500',
    status: false
  })
})

// Review checks and CI checks

for (const [checkSuiteCount, aggregateState, checks] of [
  [0, 'FAILURE', 'all'],
  [0, 'PENDING', 'all'],
  [1, 'FAILURE', 'all'],
  [0, 'FAILURE', 'required']
] as const) {
  test(`rejects an approved deployment with ${checkSuiteCount} CheckSuites, aggregate ${aggregateState}, and checks=${checks}`, async () => {
    mockApprovedCi(
      {
        state: aggregateState,
        contexts: {
          pageInfo: LAST_PAGE,
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

    assert.deepStrictEqual(await prechecks(context, octokit, data), {
      message: `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`APPROVED\`\n- commitStatus: \`${commitStatus}\`\n\n> ${detail}`,
      status: false
    })
    assert.ok(
      graphQLOK.mock.calls[0]?.arguments[0].includes('... on StatusContext')
    )
  })
}

test('accepts a requested healthy legacy status context without CheckSuites', async () => {
  mockApprovedCi(
    {
      state: 'SUCCESS',
      contexts: {
        pageInfo: LAST_PAGE,
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

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
  assertCalledWith(
    debugMock,
    'filterChecks() - explicitly including ci check: legacy-ci'
  )
})

test('allows checks=required when only an optional CI check is failing', async () => {
  mockApprovedCi({
    state: 'FAILURE',
    contexts: {
      pageInfo: LAST_PAGE,
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

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
  assertCalledWith(
    debugMock,
    'filterChecks() - after filtering, no checks remain - this will result in a SUCCESS state as it is treated as if no checks are defined'
  )
})

test('rejects a required failing check after the first 100 contexts', async () => {
  const firstPage = Array.from({length: 100}, (_, index) => ({
    conclusion: 'SUCCESS',
    isRequired: true,
    name: `healthy-${String(index)}`
  }))
  mockCheckPages(
    initialCheckPage(firstPage, {
      endCursor: 'cursor-1',
      hasNextPage: true
    }),
    additionalCheckPage(
      [{conclusion: 'FAILURE', isRequired: true, name: 'required-101'}],
      LAST_PAGE
    )
  )
  data.inputs.checks = 'required'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
  assert.deepStrictEqual(graphQLOK.mock.calls[1]?.arguments[1], {
    commitId: 'commit-node',
    cursor: 'cursor-1',
    number: 123
  })
  assert.ok(
    graphQLOK.mock.calls[1]?.arguments[0].includes(
      'contexts(first:100, after:$cursor)'
    )
  )
})

test('rejects a failing legacy status context on a later page', async () => {
  mockCheckPages(
    initialCheckPage(
      [{context: 'first-status', isRequired: true, state: 'SUCCESS'}],
      {endCursor: 'cursor-1', hasNextPage: true}
    ),
    additionalCheckPage(
      [{context: 'legacy-ci', isRequired: true, state: 'FAILURE'}],
      LAST_PAGE
    )
  )
  data.inputs.checks = ['legacy-ci']

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('finds an explicitly requested healthy check on a later page', async () => {
  mockCheckPages(
    initialCheckPage(
      [{conclusion: 'SUCCESS', isRequired: true, name: 'first-check'}],
      {endCursor: 'cursor-1', hasNextPage: true}
    ),
    additionalCheckPage(
      [{conclusion: 'SUCCESS', isRequired: true, name: 'security'}],
      LAST_PAGE
    )
  )
  data.inputs.checks = ['security']

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: true
  })
})

test('ignores a failing check discovered on a later page', async () => {
  mockCheckPages(
    initialCheckPage(
      [{conclusion: 'SUCCESS', isRequired: true, name: 'first-check'}],
      {endCursor: 'cursor-1', hasNextPage: true}
    ),
    additionalCheckPage(
      [{conclusion: 'FAILURE', isRequired: false, name: 'optional-ci'}],
      LAST_PAGE
    )
  )
  data.inputs.ignored_checks = ['optional-ci']

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: true
  })
})

test('accepts healthy required checks spanning several pages', async () => {
  mockCheckPages(
    initialCheckPage(
      [{conclusion: 'SUCCESS', isRequired: true, name: 'first-check'}],
      {endCursor: 'cursor-1', hasNextPage: true}
    ),
    additionalCheckPage(
      [{conclusion: 'SUCCESS', isRequired: true, name: 'second-check'}],
      {endCursor: 'cursor-2', hasNextPage: true}
    ),
    additionalCheckPage(
      [{conclusion: 'SUCCESS', isRequired: true, name: 'third-check'}],
      LAST_PAGE
    )
  )
  data.inputs.checks = 'required'

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: true
  })
  assertCalledTimes(graphQLOK, 3)
})

test('paginates checks=all even when the aggregate state is successful', async () => {
  mockCheckPages(
    initialCheckPage(
      [{conclusion: 'SUCCESS', isRequired: true, name: 'first-check'}],
      {endCursor: 'cursor-1', hasNextPage: true},
      'SUCCESS'
    ),
    additionalCheckPage(
      [{conclusion: 'SUCCESS', isRequired: true, name: 'second-check'}],
      LAST_PAGE
    )
  )

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: true
  })
  assertCalledTimes(graphQLOK, 2)
})

test('skip_ci bypasses malformed paginated check data', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve(
      unsafeInvalidValue<PrechecksGraphqlResult>({
        repository: {
          pullRequest: {
            commits: {nodes: [{commit: {oid: 'abc123'}}]},
            mergeStateStatus: 'CLEAN',
            reviewDecision: 'APPROVED',
            reviews: {totalCount: 1}
          }
        }
      })
    )
  )
  data.inputs.checks = 'required'
  data.inputs.skipCi = 'production'

  assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
    status: true
  })
  assertCalledTimes(graphQLOK, 1)
  assertCalledWith(setOutputMock, 'commit_status', 'skip_ci')
})

for (const [name, pageInfo] of [
  ['missing', {endCursor: null, hasNextPage: true}],
  ['empty', {endCursor: '', hasNextPage: true}]
] as const) {
  test(`fails closed when a next-page cursor is ${name}`, async () => {
    graphQLOK.mock.mockImplementation(() =>
      Promise.resolve(initialCheckPage([], pageInfo))
    )
    data.inputs.checks = 'required'

    await assertChecksUnavailable()
    assertCalledTimes(graphQLOK, 1)
  })
}

test('fails closed when a pagination cursor repeats', async () => {
  mockCheckPages(
    initialCheckPage([], {endCursor: 'cursor-1', hasNextPage: true}),
    additionalCheckPage([], {
      endCursor: 'cursor-1',
      hasNextPage: true
    })
  )
  data.inputs.checks = 'required'

  await assertChecksUnavailable()
  assertCalledTimes(graphQLOK, 2)
})

test('fails closed when a later check page cannot be retrieved', async () => {
  mockCheckPages(
    initialCheckPage([], {endCursor: 'cursor-1', hasNextPage: true}),
    new Error('pagination failed')
  )
  data.inputs.checks = 'required'

  await assertChecksUnavailable()
})

for (const [name, page] of [
  [
    'commit node ID changes',
    additionalCheckPage([], LAST_PAGE, {id: 'different-node'})
  ],
  [
    'commit OID changes',
    additionalCheckPage([], LAST_PAGE, {oid: 'different-oid'})
  ],
  ['the commit node is absent', {node: null}],
  [
    'the check rollup disappears',
    {node: {id: 'commit-node', oid: 'abc123', statusCheckRollup: null}}
  ]
] as const satisfies readonly (readonly [
  string,
  PrechecksGraphqlContextsPageResult
])[]) {
  test(`fails closed when ${name}`, async () => {
    mockCheckPages(
      initialCheckPage([], {endCursor: 'cursor-1', hasNextPage: true}),
      page
    )
    data.inputs.checks = 'required'

    await assertChecksUnavailable()
  })
}

test('fails closed when the initial page omits page information', async () => {
  const result = unsafeInvalidValue<{
    repository: {
      pullRequest: {
        commits: {
          nodes: {
            commit: {statusCheckRollup: {contexts: {pageInfo?: unknown}}}
          }[]
        }
      }
    }
  }>(initialCheckPage([], LAST_PAGE, 'FAILURE'))
  delete result.repository.pullRequest.commits.nodes[0]?.commit
    .statusCheckRollup.contexts.pageInfo
  graphQLOK.mock.mockImplementation(() => Promise.resolve(result))
  data.inputs.checks = 'required'

  await assertChecksUnavailable()
})

test('fails closed when a paginated response omits page information', async () => {
  const page = additionalCheckPage([], LAST_PAGE)
  const malformedPage = unsafeInvalidValue<{
    node: {statusCheckRollup: {contexts: {pageInfo?: unknown}}}
  }>(page)
  delete malformedPage.node.statusCheckRollup.contexts.pageInfo
  mockCheckPages(
    initialCheckPage([], {endCursor: 'cursor-1', hasNextPage: true}),
    unsafeInvalidValue<PrechecksGraphqlContextsPageResult>(malformedPage)
  )
  data.inputs.checks = 'required'

  await assertChecksUnavailable()
})

test('fails closed when pagination is required without a commit node ID', async () => {
  const result = initialCheckPage([], {
    endCursor: 'cursor-1',
    hasNextPage: true
  })
  const mutableResult =
    unsafeInvalidValue<DeepMutable<PrechecksGraphqlResult>>(result)
  delete mutableResult.repository.pullRequest.commits?.nodes?.[0]?.commit.id
  graphQLOK.mock.mockImplementation(() => Promise.resolve(mutableResult))
  data.inputs.checks = 'required'

  await assertChecksUnavailable()
})

test('rejects explicitly requested checks when the combined CI rollup is absent', async () => {
  mockApprovedCi(null)

  data.inputs.checks = ['security']

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `MISSING`\n\n> The `checks` input option requires that all of the following checks are passing: `security`. However, the following checks are missing: `security`',
    status: false
  })
})

test('runs prechecks and finds that reviews and CI checks have not been defined', async () => {
  graphQLOK.mock.mockImplementationOnce(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: null,
          commits: baseCommitWithOid
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '🎛️ CI checks have not been defined and required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  assertCalledWith(
    infoMock,
    '💡 no CI checks have been defined for this pull request'
  )
  assertCalledWith(
    infoMock,
    '🎛️ CI checks have not been defined and required reviewers have not been defined'
  )
})

test('runs prechecks and finds CI checks pass but reviews are not defined', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '🎛️ CI checks have been defined but required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  assertLastCalledWith(
    infoMock,
    '🎛️ CI checks have been defined but required reviewers have not been defined'
  )
})

test('fails closed for an unknown review decision', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'UNKNOWN',
          reviews: {totalCount: 0},
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `UNKNOWN`\n- commitStatus: `SUCCESS`\n\n> This is usually caused by missing PR approvals or CI checks failing',
    status: false
  })
})

test('runs prechecks and finds CI is passing and the PR has not been reviewed BUT it is a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  data.environmentObj.noop = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`,
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment and is from a forked repository', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    status: true,
    noopMode: false,
    ref: 'abcde12345',
    sha: 'abcde12345',
    isFork: true
  })

  assertNotCalledWith(setOutputMock, 'non_default_target_branch_used', 'true')
})

for (const fork of [1, '1'] as const) {
  test(`preserves loose fork detection for the malformed API value ${fork}`, async () => {
    getPullsOK.mock.mockImplementation(() =>
      Promise.resolve({
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
    )

    assert.partialDeepStrictEqual(await prechecks(context, octokit, data), {
      isFork: true,
      ref: 'abc123',
      status: true
    })
  })
}

test('runs prechecks and finds that the PR from a fork is targeting a non-default branch and rejects the deployment', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\nThis pull request is attempting to merge into the \`some-other-branch\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`). This deployment has been rejected since it could be dangerous to proceed.`,
    status: false
  })

  assertCalledWith(setOutputMock, 'non_default_target_branch_used', 'true')
})

test('runs prechecks and finds that the PR from a fork is targeting a non-default branch and allows it based on the action config', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  data.inputs.allow_non_default_target_branch_deployments = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `✅ PR is approved and all CI checks passed`,
    status: true,
    noopMode: false,
    ref: 'abcde12345',
    sha: 'abcde12345',
    isFork: true
  })

  assertCalledWith(setOutputMock, 'non_default_target_branch_used', 'true')
})

test('runs prechecks and finds that the PR is targeting a non-default branch and rejects the deployment', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\nThis pull request is attempting to merge into the \`not-main\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`). This deployment has been rejected since it could be dangerous to proceed.`,
    status: false
  })

  assertCalledWith(setOutputMock, 'non_default_target_branch_used', 'true')
})

test('runs prechecks and finds that the PR is targeting a non-default branch and allows the deployment based on the action config and logs a warning', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  data.inputs.allow_non_default_target_branch_deployments = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `✅ PR is approved and all CI checks passed`,
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abcde12345',
    isFork: false
  })

  assertCalledWith(setOutputMock, 'non_default_target_branch_used', 'true')

  assertCalledWith(
    warningMock,
    `🚨 this pull request is attempting to merge into the \`not-main\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`) - this action is potentially dangerous`
  )
})

test('runs prechecks and finds that the IssueOps command is valid for a branch deployment and is from a forked repository and the PR is approved but CI is failing and it is a noop', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('FAILURE')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  data.environmentObj.noop = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps command is a fork and does not require reviews so it proceeds but with a warning', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '🎛️ CI checks have been defined but required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'abcde12345',
    sha: 'abcde12345',
    isFork: true
  })

  assertCalledWith(
    warningMock,
    '🚨 pull request reviews are not enforced by this repository and this operation is being performed on a fork - this operation is dangerous! You should require reviews via branch protection settings (or rulesets) to ensure that the changes being deployed are the changes that you reviewed.'
  )
})

test('runs prechecks and rejects a pull request from a forked repository because it does not have completed reviews', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  // Even admins cannot deploy from a forked repository without reviews
  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  // Even with skipReviews set, the PR is from a forked repository and must have reviews out of pure safety
  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n\n> All deployments from forks **must** have the required reviews before they can proceed. Please ensure this PR has been reviewed and approved before trying again.',
    status: false
  })

  assertCalledWith(
    debugMock,
    'rejecting deployment from fork without required reviews - noopMode: false'
  )
})

test('runs prechecks and rejects a pull request from a forked repository because it does not have completed reviews (noop)', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  // Even admins cannot deploy from a forked repository without reviews
  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  // Even with skipReviews set, the PR is from a forked repository and must have reviews out of pure safety
  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.environmentObj.noop = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n\n> All deployments from forks **must** have the required reviews before they can proceed. Please ensure this PR has been reviewed and approved before trying again.',
    status: false
  })

  assertCalledWith(
    debugMock,
    'rejecting deployment from fork without required reviews - noopMode: true'
  )
})

test('runs prechecks and rejects a pull request from a forked repository because it does not have completed reviews [CHANGES_REQUESTED] (noop)', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  // Even admins cannot deploy from a forked repository without reviews
  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  // Even with skipReviews set, the PR is from a forked repository and must have reviews out of pure safety
  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.environmentObj.noop = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `CHANGES_REQUESTED`\n\n> All deployments from forks **must** have the required reviews before they can proceed. Please ensure this PR has been reviewed and approved before trying again.',
    status: false
  })

  assertCalledWith(
    debugMock,
    'rejecting deployment from fork without required reviews - noopMode: true'
  )
})

test('runs prechecks and rejects a forked pull request by default', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  data.inputs.allowForks = createActionInputs().allowForks

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\nThis Action has been explicity configured to prevent deployments from forks. You can change this via this Action's inputs if needed`,
    status: false
  })
})

test('runs prechecks and finds CI is pending and the PR has not been reviewed BUT it is a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('PENDING')
                }
              }
            ]
          }
        }
      }
    })
  )

  data.environmentObj.noop = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> Reviews are not required for a noop deployment but CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI checks are pending, the PR has not been reviewed, and it is not a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('PENDING')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing and the PR must be approved in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is pending and reviewers have not been defined', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('PENDING')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `null`\n- commitStatus: `PENDING`\n\n> CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI checked have not been defined, the PR has not been reviewed, and it IS a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  data.environmentObj.noop = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `✅ CI checks have not been defined and ${COLORS.highlight}noop${COLORS.reset} requested`,
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and deploys to the stable branch', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: null,
          reviews: {
            totalCount: 0
          }
        }
      }
    })
  )
  getBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
      status: 200
    })
  )

  data.environmentObj.stable_branch_used = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `✅ deployment to the ${COLORS.highlight}stable${COLORS.reset} branch requested`,
    status: true,
    noopMode: false,
    ref: 'main',
    sha: 'deadbeef',
    isFork: false
  })
})

test('runs prechecks and finds the PR has been approved but CI checks are pending and it is not a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('PENDING')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `PENDING`\n\n> CI checks must be passing in order to continue',
    status: false
  })
})

test('runs prechecks and finds CI is passing but the PR is missing an approval', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `SUCCESS`\n\n> CI checks are passing but an approval is required before you can proceed with deployment',
    status: false
  })
})

test('runs prechecks and finds CI is passing but the PR is in a CHANGES_REQUESTED state for reviews', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'CHANGES_REQUESTED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `CHANGES_REQUESTED`\n- commitStatus: `SUCCESS`\n\n> CI checks are passing but an approval is required before you can proceed with deployment',
    status: false
  })

  // the same request works for a noop as changes requested is treated the same as no approval and approvals are not required for noops
  data.environmentObj.noop = true
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`,
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds the PR is approved but CI is failing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('FAILURE')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR is in a changes requested state and CI is failing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('FAILURE')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `CHANGES_REQUESTED`\n- commitStatus: `FAILURE`\n\n> Your pull request needs to address the requested changes, get approvals, and have passing CI checks before you can proceed with deployment',
    status: false
  })
})

test('runs prechecks and finds the PR is in a REVIEW_REQUIRED state and CI is failing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('FAILURE')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `FAILURE`\n\n> Your pull request needs to get approvals and have passing CI checks before you can proceed with deployment',
    status: false
  })
})

test('runs prechecks and finds the PR is in a changes requested state and has no CI checks defined', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `CHANGES_REQUESTED`\n- commitStatus: `null`\n\n> Your pull request is missing required approvals',
    status: false
  })
})

test('runs prechecks and finds the PR is approved but CI is failing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                      pageInfo: LAST_PAGE,
                      nodes: [
                        {
                          isRequired: true,
                          conclusion: 'SUCCESS',
                          name: 'test-success'
                        },
                        {
                          isRequired: true,
                          conclusion: 'FAILURE',
                          name: 'test-failure'
                        },
                        {
                          isRequired: false,
                          conclusion: 'SUCCESS',
                          name: 'optional-success'
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
  )

  data.inputs.checks = 'required'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `FAILURE`\n\n> Your pull request is approved but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR does not require approval but CI is failing', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: null,
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('FAILURE')
                }
              }
            ]
          }
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `null`\n- commitStatus: `FAILURE`\n\n> Your pull request does not require approvals but CI checks are failing',
    status: false
  })
})

test('runs prechecks and finds the PR is NOT reviewed and CI checks have NOT been defined and NOT a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: baseCommitWithOid
        }
      }
    })
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `REVIEW_REQUIRED`\n- commitStatus: `null`\n\n> Your pull request is missing required approvals',
    status: false
  })
})

test('runs prechecks and finds the PR is approved and CI checks have NOT been defined and NOT a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )
  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ CI checks have not been defined but the PR has been approved',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a noop deploy and force updates the branch', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  updateBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        message: 'Updating pull request branch.',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 202
    })
  )

  data.inputs.update_branch = 'force'
  data.environmentObj.noop = true

  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({
      outdated: true,
      branch: 'main'
    })
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and finds the PR is un-mergable and a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'warn'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n- mergeStateStatus: `DIRTY`\n\n> A merge commit cannot be cleanly created',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it fails to update the branch', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  updateBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        message: 'merge conflict between base and head',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 422
    })
  )

  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({
      outdated: true,
      branch: 'main'
    })
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: `422`\n- update_branch: `force`\n\n> Failed to update pull request branch with the `main` branch',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and it hits an error when force updating the branch', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({
      outdated: true,
      branch: 'main'
    })
  )

  updateBranchMock.mock.mockImplementation(() =>
    Promise.resolve(
      unsafeInvalidValue<
        Awaited<ReturnType<PrechecksOctokit['rest']['pulls']['updateBranch']>>
      >(null)
    )
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      "### ⚠️ Cannot proceed with deployment\n\n```text\nCannot read properties of null (reading 'status')\n```",
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and update_branch is set to warn', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'warn'

  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({
      outdated: true,
      branch: 'main'
    })
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` branch and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is a DRAFT PR and a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )
  getBranchMock.mock.mockImplementationOnce(() =>
    Promise.resolve({
      data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
      status: 200
    })
  )
  compareCommitsMock.mock.mockImplementationOnce(() =>
    Promise.resolve({
      data: {behind_by: 0},
      status: 200
    })
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'warn'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state',
    status: false
  })
  assertCalledWith(
    warningMock,
    'deployment requested on a draft PR from a non-allowed environment'
  )
})

test('runs prechecks and finds the PR is a DRAFT PR and from an allowed environment for draft deployments', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  data.environment = 'staging'
  data.inputs.update_branch = 'warn'
  data.inputs.draft_permitted_targets = 'sandbox,staging'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('preserves truthy draft handling for a malformed API value', async () => {
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state',
    status: false
  })
})

test('runs prechecks and finds the PR is BEHIND and a noop deploy and the commit status is null', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('FAILED')
                }
              }
            ]
          }
        }
      }
    })
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'warn'

  await assertChecksUnavailable()
})

test('runs prechecks and finds the PR is BEHIND and a full deploy and update_branch is set to warn', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  data.inputs.update_branch = 'warn'

  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({
      outdated: true,
      branch: 'main'
    })
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `warn`\n\n> Please ensure your branch is up to date with the `main` branch and try again',
    status: false
  })
})

test('runs prechecks and finds the PR is behind the stable branch and a full deploy and force updates the branch', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({
      outdated: true,
      branch: 'main'
    })
  )

  updateBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        message: 'Updating pull request branch.',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 202
    })
  )

  data.inputs.update_branch = 'force'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BEHIND`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and fails with a non 200 permissionRes.status', async () => {
  getCollabOK.mock.mockImplementationOnce(() =>
    Promise.resolve({data: {permission: 'admin'}, status: 500})
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: 'Permission check returns non-200 status: 500',
    status: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid and from a defined admin', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ CI is passing and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )

  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  data.environmentObj.params = 'something something something'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ CI is passing and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds that the IssueOps commands are valid with parameters and from a defined admin', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  data.environmentObj.noop = true
  data.environmentObj.params = 'something something something'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`,
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })
})

test('fails closed for malformed CI data even when the actor is an admin', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  await assertChecksUnavailable()
})

test('runs prechecks and finds that no CI checks exist and reviews are not defined', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '🎛️ CI checks have not been defined and required reviewers have not been defined',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  assertLastCalledWith(
    infoMock,
    '🎛️ CI checks have not been defined and required reviewers have not been defined'
  )
})

test('runs prechecks and finds that no CI checks exist but reviews are defined and it is from an admin', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ CI checks have not been defined and approval is bypassed due to admin rights',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  assertLastCalledWith(
    infoMock,
    '✅ CI checks have not been defined and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that no CI checks exist and the PR is not approved, but it is from an admin', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ CI checks have not been defined and approval is bypassed due to admin rights',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  assertLastCalledWith(
    infoMock,
    '✅ CI checks have not been defined and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that skip_ci is set and the PR has been approved', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  data.environment = 'development'
  data.inputs.skipCi = 'development'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ CI requirements have been disabled for this environment and the PR has been approved',
    status: true,
    noopMode: false,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
  assertCalledWith(
    infoMock,
    '✅ CI requirements have been disabled for this environment and the PR has been approved'
  )
})

test('runs prechecks and finds that the commit status is success and skip_reviews is set for the environment', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(false))

  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.inputs.skipCi = 'development'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ CI checks passed and required reviewers have been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    infoMock,
    '✅ CI checks passed and required reviewers have been disabled for this environment'
  )
})

test('runs prechecks and finds that no ci checks are defined and skip_reviews is set for the environment', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(false))

  data.environment = 'staging'
  data.inputs.skipReviews = 'staging'
  data.inputs.skipCi = 'development'
  data.inputs.draft_permitted_targets = 'development'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ CI checks have not been defined and required reviewers have been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    infoMock,
    '✅ CI checks have not been defined and required reviewers have been disabled for this environment'
  )
})

test('runs prechecks on a custom deploy comment with a custom variable at the end', async () => {
  data.environment = 'dev'
  data.environmentObj.params = 'something'
  data.inputs.skipCi = 'dev'
  data.inputs.skipReviews = 'dev'

  assert.deepStrictEqual(
    await prechecks(
      context, // event context
      octokit, // octokit instance
      data // data object
    ),
    {
      message:
        '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment',
      noopMode: false,
      ref: 'test-ref',
      status: true,
      sha: 'abc123',
      isFork: false
    }
  )

  assertCalledWith(
    infoMock,
    '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment'
  )
})

test('runs prechecks when an exact sha is set, but the sha deployment feature is not enabled', async () => {
  data.inputs.allow_sha_deployments = false
  data.environmentObj.sha = '82c238c277ca3df56fe9418a5913d9188eafe3bc'

  assert.deepStrictEqual(
    await prechecks(
      context, // event context
      octokit, // octokit instance
      data // data object
    ),
    {
      message: `### ⚠️ Cannot proceed with deployment\n\n- allow_sha_deployments: \`${data.inputs.allow_sha_deployments}\`\n\n> sha deployments have not been enabled`,
      status: false
    }
  )
})

test('runs prechecks when an exact sha is set, and the sha deployment feature is enabled', async () => {
  data.inputs.allow_sha_deployments = true
  data.environmentObj.sha = '82c238c277ca3df56fe9418a5913d9188eafe3bc'

  assert.deepStrictEqual(
    await prechecks(
      context, // event context
      octokit, // octokit instance
      data // data object
    ),
    {
      message: `✅ deployment requested using an exact ${COLORS.highlight}sha${COLORS.reset}`,
      noopMode: false,
      ref: data.environmentObj.sha,
      status: true,
      sha: data.environmentObj.sha,
      isFork: false
    }
  )

  assertCalledWith(
    infoMock,
    `✅ deployment requested using an exact ${COLORS.highlight}sha${COLORS.reset}`
  )

  assertCalledWith(
    warningMock,
    `⚠️ sha deployments are ${COLORS.warning}unsafe${COLORS.reset} as they bypass all checks - read more here: https://github.com/github/branch-deploy/blob/main/docs/sha-deployments.md`
  )

  assertCalledWith(setOutputMock, 'sha_deployment', data.environmentObj.sha)
})

test('runs prechecks and finds that skip_ci is set and now reviews are defined', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: null,
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('FAILURE')
                }
              }
            ]
          }
        }
      }
    })
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(false))

  data.environment = 'development'
  data.inputs.skipCi = 'development'
  data.inputs.skipReviews = 'staging'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '🎛️ CI requirements have been disabled for this environment and required reviewers have not been defined',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    infoMock,
    '🎛️ CI requirements have been disabled for this environment and required reviewers have not been defined'
  )
})

test('runs prechecks and finds that skip_ci is set, reviews are required, and its a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(false))

  data.environment = 'development'
  data.environmentObj.noop = true
  data.inputs.skipCi = 'development'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ CI requirements have been disabled for this environment and **noop** requested',
    noopMode: true,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    infoMock,
    '✅ CI requirements have been disabled for this environment and **noop** requested'
  )
})

test('runs prechecks and finds that skip_ci is set and skip_reviews is set', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('FAILURE')
                }
              }
            ]
          }
        }
      }
    })
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(false))

  data.environment = 'development'
  data.inputs.skipCi = 'development'
  data.inputs.skipReviews = 'development'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    infoMock,
    '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment'
  )
})

test('runs prechecks and finds that skip_ci is set and the deployer is an admin', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('FAILURE')
                }
              }
            ]
          }
        }
      }
    })
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(true))

  data.environment = 'development'
  data.inputs.skipCi = 'development'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '✅ CI requirements have been disabled for this environment and approval is bypassed due to admin rights',
    noopMode: false,
    ref: 'test-ref',
    status: true,
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(
    infoMock,
    '✅ CI requirements have been disabled for this environment and approval is bypassed due to admin rights'
  )
})

test('runs prechecks and finds that CI is pending and reviewers have not been defined and it IS a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: null,
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('PENDING')
                }
              }
            ]
          }
        }
      }
    })
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(false))

  data.environmentObj.noop = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`null\`\n- commitStatus: \`PENDING\`\n\n> CI checks must be passing in order to continue`,
    status: false
  })

  assertCalledWith(
    infoMock,
    'note: even noop deploys require CI to finish and be in a passing state'
  )
})

test('runs prechecks and finds that the PR is NOT reviewed and CI checks have been disabled and it is NOT a noop deploy', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('PENDING')
                }
              }
            ]
          }
        }
      }
    })
  )
  isAdminMock.mock.mockImplementation(() => Promise.resolve(false))

  data.environment = 'staging'
  data.inputs.skipCi = 'staging'
  data.inputs.skipReviews = 'production'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`REVIEW_REQUIRED\`\n- commitStatus: \`skip_ci\`\n\n> Your pull request is missing required approvals`,
    status: false
  })

  assertCalledWith(
    infoMock,
    'note: CI checks are disabled for this environment so they will not be evaluated'
  )
})

test('runs prechecks and finds the PR is behind the stable branch (BLOCKED) and a noop deploy and force updates the branch', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'BLOCKED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  isOutdatedMock.mock.mockImplementation(() =>
    Promise.resolve({
      outdated: true,
      branch: 'main'
    })
  )

  updateBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        message: 'Updating pull request branch.',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 202
    })
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message:
      '### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: `BLOCKED`\n- update_branch: `force`\n\n> I went ahead and updated your branch with `main` - Please try again once this operation is complete',
    status: false
  })
})

test('runs prechecks and finds the PR is NOT behind the stable branch (BLOCKED) and a noop deploy and does not update the branch', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'BLOCKED',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )
  getBranchMock.mock.mockImplementationOnce(() =>
    Promise.resolve({
      data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
      status: 200
    })
  )

  updateBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        message: 'Updating pull request branch.',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 202
    })
  )

  data.environmentObj.noop = true
  data.inputs.update_branch = 'force'

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })
})

test('runs prechecks and finds the PR is NOT behind the stable branch (HAS_HOOKS) and a noop deploy and does not update the branch', async () => {
  graphQLOK.mock.mockImplementation(() =>
    Promise.resolve({
      repository: {
        pullRequest: {
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'HAS_HOOKS',
          commits: {
            nodes: [
              {
                commit: {
                  oid: 'abc123',
                  statusCheckRollup: checkRollup('SUCCESS')
                }
              }
            ]
          }
        }
      }
    })
  )
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )
  getBranchMock.mock.mockImplementationOnce(() =>
    Promise.resolve({
      data: {commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}}},
      status: 200
    })
  )
  updateBranchMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {
        message: 'Updating pull request branch.',
        url: 'https://api.github.com/repos/foo/bar/pulls/123'
      },
      status: 202
    })
  )

  data.environmentObj.noop = true

  assert.deepStrictEqual(await prechecks(context, octokit, data), {
    message: '✅ PR is approved and all CI checks passed',
    status: true,
    noopMode: true,
    ref: 'test-ref',
    sha: 'abc123',
    isFork: false
  })

  assertCalledWith(setOutputMock, 'default_branch_tree_sha', 'beefdead')
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
  queueMockImplementation(
    getBranchMock,
    // First call: stable branch check (succeeds)
    () =>
      Promise.resolve({
        data: {
          commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
          name: 'main'
        },
        status: 200
      }),
    // Second call: PR branch check (fails with 404)
    () => Promise.reject(new NotFoundError('Reference does not exist'))
  )

  const result = await prechecks(context, octokit, data)

  assert.strictEqual(result.status, false)
  assert.ok(result.message.includes('Cannot proceed with deployment'))
  assert.ok(result.message.includes('ref: `test-ref`'))
  assert.ok(
    result.message.includes('The branch for this pull request no longer exists')
  )
  assertCalledWith(warningMock, 'branch does not exist: test-ref')
})

test('passes prechecks when branch exists (normal deployment)', async () => {
  // Mock getBranch to succeed for all calls
  queueMockImplementation(
    getBranchMock,
    // First call: stable branch check
    () =>
      Promise.resolve({
        data: {
          commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
          name: 'main'
        },
        status: 200
      }),
    // Second call: base branch check
    () =>
      Promise.resolve({
        data: {commit: {sha: 'deadbeef'}, name: 'main'},
        status: 200
      }),
    // Third call: PR branch check (succeeds)
    () =>
      Promise.resolve({
        data: {commit: {sha: 'abc123'}, name: 'test-ref'},
        status: 200
      })
  )

  const result = await prechecks(context, octokit, data)

  assert.strictEqual(result.status, true)
  assert.strictEqual(result.ref, 'test-ref')
  assertCalledWith(debugMock, 'checking if branch exists: test-ref')
  assertCalledWith(infoMock, '✅ branch exists: test-ref')
})

test('skips branch existence check when deploying to stable branch', async () => {
  data.environmentObj.stable_branch_used = true

  // The stable and base branch lookup is reused.
  queueMockImplementation(getBranchMock, () =>
    Promise.resolve({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
  )

  const result = await prechecks(context, octokit, data)

  assert.strictEqual(result.status, true)
  assertCalledTimes(octokit.rest.repos.getBranch, 1)
  assertNotCalledWith(debugMock, 'checking if branch exists: test-ref')
})

test('skips branch existence check when deploying an exact SHA', async () => {
  data.environmentObj.sha = 'abc123def456'
  data.inputs.allow_sha_deployments = true

  queueMockImplementation(getBranchMock, () =>
    Promise.resolve({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
  )

  const result = await prechecks(context, octokit, data)

  assert.strictEqual(result.status, true)
  // Verify the branch existence check was skipped
  assertCalledTimes(octokit.rest.repos.getBranch, 1)
  assertNotCalledWith(debugMock, 'checking if branch exists: test-ref')
})

test('skips branch existence check when PR fork deployments are explicitly allowed', async () => {
  data.inputs.allowForks = true

  // Mock the PR as a fork
  getPullsOK.mock.mockImplementation(() =>
    Promise.resolve({
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
  )

  queueMockImplementation(getBranchMock, () =>
    Promise.resolve({
      data: {
        commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
        name: 'main'
      },
      status: 200
    })
  )

  const result = await prechecks(context, octokit, data)

  assert.partialDeepStrictEqual(result, {status: true, isFork: true})
  // Verify the branch existence check was skipped for forks
  assertCalledTimes(octokit.rest.repos.getBranch, 1)
  assertNotCalledWith(debugMock, 'checking if branch exists: abc123')
})

test('fails prechecks when branch check encounters unexpected error', async () => {
  // Mock getBranch to throw a non-404 error
  queueMockImplementation(
    getBranchMock,
    () =>
      Promise.resolve({
        data: {
          commit: {sha: 'deadbeef', commit: {tree: {sha: 'beefdead'}}},
          name: 'main'
        },
        status: 200
      }),
    () => Promise.reject(new UnexpectedError('Internal server error'))
  )

  const result = await prechecks(context, octokit, data)

  // Should fail and not continue
  assert.strictEqual(result.status, false)
  assert.ok(result.message.includes('Cannot proceed with deployment'))
  assert.ok(result.message.includes('ref: `test-ref`'))
  assert.ok(
    result.message.includes(
      'An unexpected error occurred while checking if the branch exists'
    )
  )
  assert.ok(result.message.includes('Internal server error'))
})
