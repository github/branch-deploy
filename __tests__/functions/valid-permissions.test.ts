import * as core from '@actions/core'
import {vi, expect, test, beforeEach} from 'vitest'
import {validPermissions} from '../../src/functions/valid-permissions.ts'
import {asPartialOctokit} from '../test-helpers.ts'

const setOutputMock = vi.spyOn(core, 'setOutput')

var octokit: Parameters<typeof validPermissions>[0]
var context: Parameters<typeof validPermissions>[1]
var permissions: Parameters<typeof validPermissions>[2] = ['write', 'admin']

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INPUT_PERMISSIONS = 'write,admin'

  context = {
    actor: 'monalisa'
  } as unknown as typeof context

  octokit = asPartialOctokit({
    rest: {
      repos: {
        getCollaboratorPermissionLevel: vi.fn().mockReturnValueOnce({
          status: 200,
          data: {
            permission: 'write'
          }
        })
      }
    }
  }) as unknown as typeof octokit
})

test('determines that a user has valid permissions to invoke the Action', async () => {
  expect(await validPermissions(octokit, context, permissions)).toEqual(true)
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})

test('determines that a user has does not valid permissions to invoke the Action', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = vi.fn().mockReturnValue({
    status: 200,
    data: {
      permission: 'read'
    }
  }) as unknown as typeof octokit.rest.repos.getCollaboratorPermissionLevel

  expect(await validPermissions(octokit, context, permissions)).toEqual(
    '👋 @monalisa, that command requires the following permission(s): `write/admin`\n\nYour current permissions: `read`'
  )
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})

test('fails to get actor permissions due to a bad status code', async () => {
  octokit.rest.repos.getCollaboratorPermissionLevel = vi.fn().mockReturnValue({
    status: 500
  }) as unknown as typeof octokit.rest.repos.getCollaboratorPermissionLevel

  expect(await validPermissions(octokit, context, permissions)).toEqual(
    'Permission check returns non-200 status: 500'
  )
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})
