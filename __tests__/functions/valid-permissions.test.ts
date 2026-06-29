import * as core from '../../src/actions-core.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import {validPermissions} from '../../src/functions/valid-permissions.ts'
import {createContext} from '../test-helpers.ts'

const setOutputMock = vi.spyOn(core, 'setOutput')

let octokit: Parameters<typeof validPermissions>[0]
let context: Parameters<typeof validPermissions>[1]
const permissions: Parameters<typeof validPermissions>[2] = ['write', 'admin']
const getPermissionMock =
  vi.fn<
    Parameters<
      typeof validPermissions
    >[0]['rest']['repos']['getCollaboratorPermissionLevel']
  >()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('INPUT_PERMISSIONS', 'write,admin')

  context = createContext({actor: 'monalisa'})

  getPermissionMock.mockResolvedValue({
    status: 200,
    data: {permission: 'write'}
  })
  octokit = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: getPermissionMock
      }
    }
  }
})

test('determines that a user has valid permissions to invoke the Action', async () => {
  expect(await validPermissions(octokit, context, permissions)).toEqual(true)
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})

test('determines that a user has does not valid permissions to invoke the Action', async () => {
  getPermissionMock.mockResolvedValue({
    status: 200,
    data: {permission: 'read'}
  })

  expect(await validPermissions(octokit, context, permissions)).toEqual(
    '👋 @monalisa, that command requires the following permission(s): `write/admin`\n\nYour current permissions: `read`'
  )
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})

test('fails to get actor permissions due to a bad status code', async () => {
  getPermissionMock.mockResolvedValue({status: 500, data: {permission: 'none'}})

  expect(await validPermissions(octokit, context, permissions)).toEqual(
    'Permission check returns non-200 status: 500'
  )
  expect(setOutputMock).toHaveBeenCalledWith('actor', 'monalisa')
})
