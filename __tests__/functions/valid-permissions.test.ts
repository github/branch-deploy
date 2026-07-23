import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionIo = typeof import('../../src/action-io.ts')
type ValidPermissionsModule =
  typeof import('../../src/functions/valid-permissions.ts')

const setActionOutputMock = createMock<ActionIo['setActionOutput']>()

installModuleMock(mock, new URL('../../src/action-io.ts', import.meta.url), {
  setActionOutput: setActionOutputMock
})

const {validPermissions} =
  await import('../../src/functions/valid-permissions.ts')

let octokit: Parameters<ValidPermissionsModule['validPermissions']>[0]
let context: Parameters<ValidPermissionsModule['validPermissions']>[1]
const permissions: Parameters<ValidPermissionsModule['validPermissions']>[2] = [
  'write',
  'admin'
]
const getPermissionMock =
  createMock<
    Parameters<
      ValidPermissionsModule['validPermissions']
    >[0]['rest']['repos']['getCollaboratorPermissionLevel']
  >()

beforeEach(() => {
  setActionOutputMock.mock.resetCalls()
  getPermissionMock.mock.resetCalls()

  context = createContext({actor: 'monalisa'})

  getPermissionMock.mock.mockImplementation(() =>
    Promise.resolve({
      status: 200,
      data: {permission: 'write'}
    })
  )
  octokit = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: getPermissionMock
      }
    }
  }
})

test('determines that a user has valid permissions to invoke the Action', async () => {
  assert.strictEqual(
    await validPermissions(octokit, context, permissions),
    true
  )
  assertCalledWith(setActionOutputMock, 'actor', 'monalisa')
})

test('determines that a user has does not valid permissions to invoke the Action', async () => {
  getPermissionMock.mock.mockImplementation(() =>
    Promise.resolve({
      status: 200,
      data: {permission: 'read'}
    })
  )

  assert.strictEqual(
    await validPermissions(octokit, context, permissions),
    '👋 @monalisa, that command requires the following permission(s): `write/admin`\n\nYour current permissions: `read`'
  )
  assertCalledWith(setActionOutputMock, 'actor', 'monalisa')
})

test('fails to get actor permissions due to a bad status code', async () => {
  getPermissionMock.mock.mockImplementation(() =>
    Promise.resolve({
      status: 500,
      data: {permission: 'none'}
    })
  )

  assert.strictEqual(
    await validPermissions(octokit, context, permissions),
    'Permission check returns non-200 status: 500'
  )
  assertCalledWith(setActionOutputMock, 'actor', 'monalisa')
})
