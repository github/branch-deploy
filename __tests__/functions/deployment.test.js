import {createDeploymentStatus} from '../../src/functions/deployment'

const context = {
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
      createDeploymentStatus: jest.fn().mockReturnValueOnce({
        data: {}
      })
    }
  }
}

test('creates an in_progress deployment status', async () => {
  expect(
    await createDeploymentStatus(
      octokit,
      context,
      'test-ref',
      'in_progress',
      123,
      'production'
    )
  ).toStrictEqual({})
})
