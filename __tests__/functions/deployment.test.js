import {vi, expect, test, beforeEach} from 'vitest'
import {
  createDeploymentStatus,
  latestActiveDeployment,
  activeDeployment
} from '../../src/functions/deployment.js'
import * as core from '@actions/core'
import {API_HEADERS} from '../../src/functions/api-headers.js'

var octokit
var context
var mockDeploymentData
var mockDeploymentResults
beforeEach(() => {
  vi.clearAllMocks()
  process.env.GITHUB_SERVER_URL = 'https://github.com'

  context = {
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    payload: {
      comment: {
        id: '1'
      }
    },
    runId: 12345
  }

  mockDeploymentData = {
    repository: {
      deployments: {
        nodes: [
          {
            createdAt: '2024-09-19T20:18:18Z',
            environment: 'production',
            updatedAt: '2024-09-19T20:18:21Z',
            id: 'DE_kwDOID9x8M5sC6QZ',
            payload:
              '{"type":"branch-deploy", "sha": "315cec138fc9d7dac8a47c6bba4217d3965ede3b"}',
            state: 'ACTIVE',
            creator: {
              login: 'github-actions'
            },
            ref: {
              name: 'main'
            },
            commit: {
              oid: '315cec138fc9d7dac8a47c6bba4217d3965ede3b'
            }
          }
        ],
        pageInfo: {
          endCursor: null,
          hasNextPage: false
        }
      }
    }
  }

  mockDeploymentResults = {
    createdAt: '2024-09-19T20:18:18Z',
    environment: 'production',
    updatedAt: '2024-09-19T20:18:21Z',
    id: 'DE_kwDOID9x8M5sC6QZ',
    payload:
      '{"type":"branch-deploy", "sha": "315cec138fc9d7dac8a47c6bba4217d3965ede3b"}',
    state: 'ACTIVE',
    creator: {
      login: 'github-actions'
    },
    ref: {
      name: 'main'
    },
    commit: {
      oid: '315cec138fc9d7dac8a47c6bba4217d3965ede3b'
    }
  }

  octokit = {
    rest: {
      repos: {
        createDeploymentStatus: vi.fn().mockReturnValueOnce({
          data: {}
        })
      }
    }
  }
})

const environment = 'production'
const deploymentId = 123
const ref = 'test-ref'
const logUrl = 'https://github.com/corp/test/actions/runs/12345'

const createMockGraphQLOctokit = data => ({
  graphql: vi.fn().mockReturnValueOnce(data)
})

test('creates an in_progress deployment status', async () => {
  expect(
    await createDeploymentStatus(
      octokit,
      context,
      ref,
      'in_progress',
      deploymentId,
      environment
    )
  ).toStrictEqual({})

  expect(octokit.rest.repos.createDeploymentStatus).toHaveBeenCalledWith({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: ref,
    deployment_id: deploymentId,
    state: 'in_progress',
    environment: environment,
    environment_url: null,
    log_url: logUrl,
    headers: API_HEADERS
  })
})

test('successfully fetches the latest deployment', async () => {
  octokit = createMockGraphQLOctokit(mockDeploymentData)

  expect(
    await latestActiveDeployment(octokit, context, environment)
  ).toStrictEqual(mockDeploymentResults)

  expect(octokit.graphql).toHaveBeenCalled()
})

test('returns null if no deployments are found', async () => {
  octokit = createMockGraphQLOctokit({
    repository: {
      deployments: {
        nodes: []
      }
    }
  })

  expect(await latestActiveDeployment(octokit, context, environment)).toBeNull()

  expect(octokit.graphql).toHaveBeenCalled()
})

test('returns null if no deployments are found in 3 pages of queries', async () => {
  octokit.graphql = vi
    .fn()
    .mockReturnValueOnce({
      repository: {
        deployments: {
          nodes: [
            {
              state: 'INACTIVE'
            }
          ],
          pageInfo: {
            endCursor: 'cursor',
            hasNextPage: true
          }
        }
      }
    })
    .mockReturnValueOnce({
      repository: {
        deployments: {
          nodes: [
            {
              state: 'INACTIVE'
            }
          ],
          pageInfo: {
            endCursor: 'cursor',
            hasNextPage: true
          }
        }
      }
    })
    .mockReturnValueOnce({
      repository: {
        deployments: {
          nodes: [
            {
              state: 'INACTIVE'
            }
          ],
          pageInfo: {
            endCursor: 'cursor',
            hasNextPage: false
          }
        }
      }
    })

  expect(await latestActiveDeployment(octokit, context, environment)).toBeNull()

  expect(octokit.graphql).toHaveBeenCalledTimes(3)
})

test('returns the deployment when it is found in the second page of queries', async () => {
  octokit.graphql = vi
    .fn()
    .mockReturnValueOnce({
      repository: {
        deployments: {
          nodes: [
            {
              state: 'INACTIVE'
            },
            {
              state: 'INACTIVE'
            },
            {
              state: 'INACTIVE'
            },
            {
              state: 'PENDING'
            }
          ],
          pageInfo: {
            endCursor: 'cursor',
            hasNextPage: true
          }
        }
      }
    })
    .mockReturnValueOnce({
      repository: {
        deployments: {
          nodes: [
            {
              state: 'INACTIVE'
            },
            {
              state: 'INACTIVE'
            },
            {
              state: 'ACTIVE'
            },
            {
              state: 'INACTIVE'
            }
          ],
          pageInfo: {
            endCursor: 'cursor',
            hasNextPage: true
          }
        }
      }
    })

  expect(
    await latestActiveDeployment(octokit, context, environment)
  ).toStrictEqual({
    state: 'ACTIVE'
  })

  expect(octokit.graphql).toHaveBeenCalledTimes(2)
})

test('returns false if the deployment is not active', async () => {
  mockDeploymentData.repository.deployments.nodes[0].state = 'INACTIVE'
  octokit = createMockGraphQLOctokit(mockDeploymentData)

  expect(await activeDeployment(octokit, context, environment, 'sha')).toBe(
    false
  )

  expect(octokit.graphql).toHaveBeenCalled()
})

test('returns false if the deployment does not match the sha', async () => {
  mockDeploymentData.repository.deployments.nodes[0].commit.oid = 'badsha'
  octokit = createMockGraphQLOctokit(mockDeploymentData)

  expect(await activeDeployment(octokit, context, environment, 'sha')).toBe(
    false
  )

  expect(octokit.graphql).toHaveBeenCalled()
})

test('returns true if the deployment is active and matches the sha', async () => {
  octokit = createMockGraphQLOctokit(mockDeploymentData)

  expect(
    await activeDeployment(
      octokit,
      context,
      environment,
      '315cec138fc9d7dac8a47c6bba4217d3965ede3b'
    )
  ).toBe(true)

  expect(octokit.graphql).toHaveBeenCalled()
})

test('returns false if the deployment is not found', async () => {
  octokit = createMockGraphQLOctokit({
    repository: {
      deployments: {
        nodes: []
      }
    }
  })

  expect(await activeDeployment(octokit, context, environment, 'sha')).toBe(
    false
  )

  expect(octokit.graphql).toHaveBeenCalled()
})
