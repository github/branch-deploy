import * as core from '@actions/core'
import {validPermissions} from '../../src/functions/valid-permissions'

const setOutputMock = jest.spyOn(core, 'setOutput')

var octokit
var context
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  process.env.INPUT_PERMISSIONS = 'write,maintain,admin'

  context = {
    actor: 'monalisa'
  }

  octokit = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: jest.fn().mockReturnValueOnce({
          status: 200,
          data: {
            permission: 'write'
          }
        })
      }
    }
  }
})

test('determines that a user has valid permissions to invoke the Action', async () => {
  expect(await validPermissions(octokit, context)).toEqual(true)
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})

test('determines that a user has does not valid permissions to invoke the Action', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = jest
    .fn()
    .mockReturnValue({
      status: 200,
      data: {
        permission: 'read'
      }
    })

  expect(await validPermissions(octokit, context)).toEqual(
    '👋 __monalisa__, seems as if you have not write/maintain/admin permissions in this repo, permissions: read'
  )
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})

test('fails to get actor permissions due to a bad status code', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = jest
    .fn()
    .mockReturnValue({
      status: 500
    })

  expect(await validPermissions(octokit, context)).toEqual(
    'Permission check returns non-200 status: 500'
  )
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})
