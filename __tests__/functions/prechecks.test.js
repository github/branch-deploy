import {prechecks} from '../../src/functions/prechecks'

// Globals for testing
const context = {
  repo: {
    owner: 'corp',
    repo: 'test'
  },
  issue: {
    number: 123
  }
}
const createComment = jest.fn().mockReturnValueOnce({data: {}})
const getCollabOK = jest
  .fn()
  .mockReturnValueOnce({data: {permission: 'admin'}, status: 200})
const getPullsOK = jest
  .fn()
  .mockReturnValueOnce({data: {head: {ref: 'test-ref'}}, status: 200})
const graphQLOK = jest.fn().mockReturnValueOnce({
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
      octokit
    )
  ).toStrictEqual({
    message: 'Permission check returns non-200 status: 500',
    status: false
  })
})
