import {defaultAdminOctokitFactory, isAdmin} from '../../src/functions/admin.ts'
import type {
  AdminOctokit,
  AdminOctokitFactory
} from '../../src/functions/admin.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import {COLORS} from '../../src/functions/colors.ts'
import * as core from '@actions/core'
import {createContext} from '../test-helpers.ts'

const debugMock = vi.spyOn(core, 'debug')
const warningMock = vi.spyOn(core, 'warning')
const requestMock = vi.fn<AdminOctokit['request']>()
const getOrganizationMock = vi.fn<AdminOctokit['rest']['orgs']['get']>()
const getTeamMock = vi.fn<AdminOctokit['rest']['teams']['getByName']>()
const createClientMock = vi.fn<AdminOctokitFactory>()

const adminClient: AdminOctokit = {
  request: requestMock,
  rest: {
    orgs: {get: getOrganizationMock},
    teams: {getByName: getTeamMock}
  }
}

class NotFoundError extends Error {
  declare status: number

  constructor(message: string) {
    super(message)
    this.status = 404
  }
}

class WildError extends Error {
  declare status: number

  constructor(message: string) {
    super(message)
    this.status = 500
  }
}

let context: Parameters<typeof isAdmin>[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('INPUT_ADMINS_PAT', 'faketoken')
  vi.stubEnv(
    'INPUT_ADMINS',
    'MoNaLiSa,@lisamona,octoawesome/octo-awEsome-team,bad$user'
  )

  context = createContext({actor: 'monalisa'})
  requestMock.mockResolvedValue({status: 204})
  getOrganizationMock.mockResolvedValue({data: {id: 12345}})
  getTeamMock.mockResolvedValue({data: {id: 567890}})
  createClientMock.mockReturnValue(adminClient)
})

test('creates the default narrow admin client without making a request', () => {
  const client = defaultAdminOctokitFactory('faketoken')
  expect(typeof client.request).toBe('function')
  expect(typeof client.rest.orgs.get).toBe('function')
  expect(typeof client.rest.teams.getByName).toBe('function')
})

test('runs isAdmin checks and finds a valid admin via handle reference', async () => {
  expect(await isAdmin(context)).toStrictEqual(true)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is an admin via handle reference'
  )
})

test('runs isAdmin checks and finds a valid handle that is a GitHub EMU', async () => {
  vi.stubEnv('INPUT_ADMINS', 'username_company')
  const contextNoAdmin = createContext({actor: 'username_company'})
  expect(await isAdmin(contextNoAdmin)).toStrictEqual(true)
  expect(debugMock).toHaveBeenCalledWith(
    'username_company is an admin via handle reference'
  )
})

test.each([
  {admin: '', valid: false},
  {admin: 'a', valid: true},
  {admin: '0', valid: true},
  {admin: 'a-b', valid: true},
  {admin: 'a'.repeat(39), valid: true},
  {admin: 'a'.repeat(40), valid: false},
  {admin: '-monalisa', valid: false},
  {admin: 'mona--lisa', valid: false},
  {admin: 'monalisa-', valid: false},
  {admin: '@monalisa', valid: false},
  {admin: 'mona_lisa', valid: true},
  {admin: 'name-with-hyphens_company', valid: true},
  {admin: `${'a'.repeat(40)}_company`, valid: true},
  {admin: 'mona_lisa-smith', valid: false},
  {admin: 'mona__lisa', valid: false}
])('preserves legacy username validation for $admin', async ({admin, valid}) => {
  vi.stubEnv('INPUT_ADMINS', admin)
  const usernameContext = createContext({actor: admin})

  expect(await isAdmin(usernameContext)).toStrictEqual(valid)

  if (!valid) {
    expect(debugMock).toHaveBeenCalledWith(
      `${admin} is not a valid GitHub username... skipping admin check`
    )
  }
})

test('runs isAdmin checks and does not find a valid admin due to a bad GitHub handle', async () => {
  vi.stubEnv('INPUT_ADMINS', 'mona%lisa-')
  const contextNoAdmin = createContext({actor: 'mona%lisa-'})
  expect(await isAdmin(contextNoAdmin)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith(
    'mona%lisa- is not a valid GitHub username... skipping admin check'
  )
})

test('runs isAdmin checks and does not find a valid admin', async () => {
  vi.stubEnv('INPUT_ADMINS', 'monalisa')
  const contextNoAdmin = createContext({actor: 'eviluser'})
  expect(await isAdmin(contextNoAdmin)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith('eviluser is not an admin')
})

test('runs isAdmin checks for an org team and fails due to no admins_pat', async () => {
  vi.stubEnv('INPUT_ADMINS_PAT', 'false')
  vi.stubEnv('INPUT_ADMINS', 'octoawesome/octo-awesome')
  expect(await isAdmin(context, createClientMock)).toStrictEqual(false)
  expect(warningMock).toHaveBeenCalledWith(
    `🚨 no ${COLORS.highlight}admins_pat${COLORS.reset} provided, skipping admin check for org team membership`
  )
})

test('runs isAdmin checks for an org team and finds a valid user', async () => {
  vi.stubEnv('INPUT_ADMINS', 'octoawesome/octo-awesome-team')
  expect(await isAdmin(context, createClientMock)).toStrictEqual(true)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is in octoawesome/octo-awesome-team'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is an admin via org team reference'
  )
})

test('runs isAdmin checks for an org team and does not find the org', async () => {
  getOrganizationMock.mockRejectedValueOnce(
    new NotFoundError('Reference does not exist')
  )
  vi.stubEnv('INPUT_ADMINS', 'octoawesome/octo-awesome-team')
  expect(await isAdmin(context, createClientMock)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

test('runs isAdmin checks for an org team and does not find the team', async () => {
  getTeamMock.mockRejectedValueOnce(
    new NotFoundError('Reference does not exist')
  )
  vi.stubEnv('INPUT_ADMINS', 'octoawesome/octo-awesome-team')
  expect(await isAdmin(context, createClientMock)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

test('runs isAdmin checks for an org team and does not find the user in the team', async () => {
  requestMock.mockRejectedValueOnce(
    new NotFoundError('Reference does not exist')
  )
  vi.stubEnv('INPUT_ADMINS', 'octoawesome/octo-awesome-team')
  expect(await isAdmin(context, createClientMock)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

test('runs isAdmin checks for an org team and an unexpected status code is received from the request method with octokit', async () => {
  requestMock.mockResolvedValueOnce({status: 500})
  vi.stubEnv('INPUT_ADMINS', 'octoawesome/octo-awesome-team')
  expect(await isAdmin(context, createClientMock)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith('monalisa is not an admin')
  expect(warningMock).toHaveBeenCalledWith(
    'non 204 response from org team check: 500'
  )
})

test('runs isAdmin checks for an org team and an unexpected error is thrown from any API call', async () => {
  requestMock.mockRejectedValueOnce(new WildError('something went boom'))
  vi.stubEnv('INPUT_ADMINS', 'octoawesome/octo-awesome-team')
  expect(await isAdmin(context, createClientMock)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith('monalisa is not an admin')
  expect(warningMock).toHaveBeenCalledWith(
    'error checking org team membership: Error: something went boom'
  )
})
