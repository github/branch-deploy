import {test, expect, jest, beforeEach} from '@jest/globals'

import * as core from '@actions/core'
import {validPermissions} from '../../src/functions/valid-permissions.js.js'

const setOutputMock = jest.spyOn(core, 'setOutput')

var octokit
var context
var permissions = ['write', 'admin']

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  process.env.INPUT_PERMISSIONS = 'write,admin'

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
  expect(await validPermissions(octokit, context, permissions)).toEqual(true)
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

  expect(await validPermissions(octokit, context, permissions)).toEqual(
    '👋 @monalisa, that command requires the following permission(s): `write/admin`\n\nYour current permissions: `read`'
  )
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})

test('fails to get actor permissions due to a bad status code', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = jest
    .fn()
    .mockReturnValue({
      status: 500
    })

  expect(await validPermissions(octokit, context, permissions)).toEqual(
    'Permission check returns non-200 status: 500'
  )
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})
