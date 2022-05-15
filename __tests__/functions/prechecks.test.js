import {prechecks} from '../../src/functions/prechecks'
import * as core from '@actions/core'

beforeEach(() => {
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
    message: '### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: `APPROVED`\n- commitStatus: `null`\n\n> This is usually caused by missing PR approvals or CI checks failing',
    status: false
  })
  expect(infoMock).toHaveBeenCalledWith(
    'Could not retrieve PR commit status: TypeError: Cannot read properties of undefined (reading \'nodes\') - Handled: OK'
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
