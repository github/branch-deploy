import {createDeploymentStatus} from '../../src/functions/deployment'

var octokit
var context
beforeEach(() => {
  jest.clearAllMocks()
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

  octokit = {
    rest: {
      repos: {
        createDeploymentStatus: jest.fn().mockReturnValueOnce({
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
    log_url: logUrl
  })
})
