import {postDeploy} from '../../src/functions/post-deploy'
import * as actionStatus from '../../src/functions/action-status'
import * as createDeploymentStatus from '../../src/functions/deployment'
import * as core from '@actions/core'

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(createDeploymentStatus, 'createDeploymentStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

const context = {
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

const octokit = {
  rest: {
    repos: {
      createDeploymentStatus: jest.fn().mockReturnValue({
        data: {}
      })
    }
  }
}

test('successfully completes a production branch deployment', async () => {
  const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus')
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      'false',
      456,
      'production'
    )
  ).toBe('success')

  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith({"actor": "monalisa", "eventName": "issue_comment", "payload": {"comment": {"id": "1"}}, "repo": {"owner": "corp", "repo": "test"}, "workflow": "test-workflow"}, {"rest": {"repos": {"createDeploymentStatus": octokit.rest.repos.createDeploymentStatus}}}, 123, "  ### Deployment Results\n\n  - Status: `success` ✔️\n  - Mode: `branch` 🚀\n  - Branch: `test-ref`\n\n  <details><summary>Show Results</summary>\n\n  Deployment has created 1 new server\n\n  </details>\n\n  Successfully deployed branch **test-ref**\n\n  > Actor: **monalisa**, Action: `issue_comment`, Workflow: `test-workflow`", true, "test-ref")
})

test('successfully completes a production branch deployment with no custom message', async () => {
  const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus')
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      'success',
      '',
      'test-ref',
      'false',
      456,
      'production'
    )
  ).toBe('success')
  expect(actionStatusSpy).toHaveBeenCalled()
  expect(actionStatusSpy).toHaveBeenCalledWith({"actor": "monalisa", "eventName": "issue_comment", "payload": {"comment": {"id": "1"}}, "repo": {"owner": "corp", "repo": "test"}, "workflow": "test-workflow"}, {"rest": {"repos": {"createDeploymentStatus": octokit.rest.repos.createDeploymentStatus}}}, 123, "  ### Deployment Results\n\n  - Status: `success` ✔️\n  - Mode: `branch` 🚀\n  - Branch: `test-ref`\n\n  Successfully deployed branch **test-ref**\n\n  > Actor: **monalisa**, Action: `issue_comment`, Workflow: `test-workflow`", true, "test-ref")
})

test('successfully completes a noop branch deployment', async () => {
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      'success',
      'Deployment has created 1 new server',
      'test-ref',
      'true',
      456,
      'production'
    )
  ).toBe('success - noop')
})

test('updates with a failure for a production branch deployment', async () => {
  expect(
    await postDeploy(
      context,
      octokit,
      123,
      'failure',
      'Deployment has failed to create 1 new server',
      'test-ref',
      'true',
      456,
      'production'
    )
  ).toBe('success - noop')
})
