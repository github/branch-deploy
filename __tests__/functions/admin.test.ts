import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import type {
  AdminOctokit,
  AdminOctokitFactory
} from '../../src/functions/admin.ts'
import {COLORS} from '../../src/functions/colors.ts'
import {createContext} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  queueMockImplementation,
  stubEnv,
  installModuleMock
} from '../node-test-helpers.ts'

const actionsCore = await import('../../src/actions-core.ts')
const debugMock = createMock<typeof actionsCore.debug>()
const infoMock = createMock<typeof actionsCore.info>()
const warningMock = createMock<typeof actionsCore.warning>()
installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  ...actionsCore,
  debug: debugMock,
  info: infoMock,
  warning: warningMock
})

const {defaultAdminOctokitFactory, isAdmin} =
  await import('../../src/functions/admin.ts')

const requestMock = createMock<AdminOctokit['request']>()
const getOrganizationMock = createMock<AdminOctokit['rest']['orgs']['get']>()
const getTeamMock = createMock<AdminOctokit['rest']['teams']['getByName']>()
const createClientMock = createMock<AdminOctokitFactory>()

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

beforeEach(context_ => {
  if (!('after' in context_)) {
    throw new TypeError('expected a test context')
  }
  for (const mockFunction of [
    debugMock,
    infoMock,
    warningMock,
    requestMock,
    getOrganizationMock,
    getTeamMock,
    createClientMock
  ]) {
    mockFunction.mock.resetCalls()
  }
  stubEnv(context_, 'INPUT_ADMINS_PAT', 'faketoken')
  stubEnv(
    context_,
    'INPUT_ADMINS',
    'MoNaLiSa,@lisamona,octoawesome/octo-awEsome-team,bad$user'
  )

  context = createContext({actor: 'monalisa'})
  requestMock.mock.mockImplementation(() => Promise.resolve({status: 204}))
  getOrganizationMock.mock.mockImplementation(() =>
    Promise.resolve({
      data: {id: 12345}
    })
  )
  getTeamMock.mock.mockImplementation(() =>
    Promise.resolve({data: {id: 567890}})
  )
  createClientMock.mock.mockImplementation(() => adminClient)
})

test('creates the default narrow admin client without making a request', () => {
  const client = defaultAdminOctokitFactory('faketoken')
  assert.strictEqual(typeof client.request, 'function')
  assert.strictEqual(typeof client.rest.orgs.get, 'function')
  assert.strictEqual(typeof client.rest.teams.getByName, 'function')
})

test('runs isAdmin checks and finds a valid admin via handle reference', async () => {
  assert.strictEqual(await isAdmin(context), true)
  assertCalledWith(debugMock, 'monalisa is an admin via handle reference')
})

test('runs isAdmin checks and finds a valid handle that is a GitHub EMU', async () => {
  process.env['INPUT_ADMINS'] = 'username_company'
  const contextNoAdmin = createContext({actor: 'username_company'})
  assert.strictEqual(await isAdmin(contextNoAdmin), true)
  assertCalledWith(
    debugMock,
    'username_company is an admin via handle reference'
  )
})

for (const {admin, valid} of [
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
]) {
  test(`preserves legacy username validation for ${admin}`, async () => {
    process.env['INPUT_ADMINS'] = admin
    const usernameContext = createContext({actor: admin})

    assert.strictEqual(await isAdmin(usernameContext), valid)

    if (!valid) {
      assertCalledWith(
        debugMock,
        `${admin} is not a valid GitHub username... skipping admin check`
      )
    }
  })
}

test('runs isAdmin checks and does not find a valid admin due to a bad GitHub handle', async () => {
  process.env['INPUT_ADMINS'] = 'mona%lisa-'
  const contextNoAdmin = createContext({actor: 'mona%lisa-'})
  assert.strictEqual(await isAdmin(contextNoAdmin), false)
  assertCalledWith(
    debugMock,
    'mona%lisa- is not a valid GitHub username... skipping admin check'
  )
})

test('runs isAdmin checks and does not find a valid admin', async () => {
  process.env['INPUT_ADMINS'] = 'monalisa'
  const contextNoAdmin = createContext({actor: 'eviluser'})
  assert.strictEqual(await isAdmin(contextNoAdmin), false)
  assertCalledWith(debugMock, 'eviluser is not an admin')
})

test('runs isAdmin checks for an org team and fails due to no admins_pat', async () => {
  process.env['INPUT_ADMINS_PAT'] = 'false'
  process.env['INPUT_ADMINS'] = 'octoawesome/octo-awesome'
  assert.strictEqual(await isAdmin(context, createClientMock), false)
  assertCalledWith(
    warningMock,
    `🚨 no ${COLORS.highlight}admins_pat${COLORS.reset} provided, skipping admin check for org team membership`
  )
})

test('runs isAdmin checks for an org team and finds a valid user', async () => {
  process.env['INPUT_ADMINS'] = 'octoawesome/octo-awesome-team'
  assert.strictEqual(await isAdmin(context, createClientMock), true)
  assertCalledWith(debugMock, 'monalisa is in octoawesome/octo-awesome-team')
  assertCalledWith(debugMock, 'monalisa is an admin via org team reference')
})

test('runs isAdmin checks for an org team and does not find the org', async () => {
  queueMockImplementation(getOrganizationMock, () =>
    Promise.reject(new NotFoundError('Reference does not exist'))
  )
  process.env['INPUT_ADMINS'] = 'octoawesome/octo-awesome-team'
  assert.strictEqual(await isAdmin(context, createClientMock), false)
  assertCalledWith(
    debugMock,
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

test('runs isAdmin checks for an org team and does not find the team', async () => {
  queueMockImplementation(getTeamMock, () =>
    Promise.reject(new NotFoundError('Reference does not exist'))
  )
  process.env['INPUT_ADMINS'] = 'octoawesome/octo-awesome-team'
  assert.strictEqual(await isAdmin(context, createClientMock), false)
  assertCalledWith(
    debugMock,
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

test('runs isAdmin checks for an org team and does not find the user in the team', async () => {
  queueMockImplementation(requestMock, () =>
    Promise.reject(new NotFoundError('Reference does not exist'))
  )
  process.env['INPUT_ADMINS'] = 'octoawesome/octo-awesome-team'
  assert.strictEqual(await isAdmin(context, createClientMock), false)
  assertCalledWith(
    debugMock,
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

test('runs isAdmin checks for an org team and an unexpected status code is received from the request method with octokit', async () => {
  queueMockImplementation(requestMock, () => Promise.resolve({status: 500}))
  process.env['INPUT_ADMINS'] = 'octoawesome/octo-awesome-team'
  assert.strictEqual(await isAdmin(context, createClientMock), false)
  assertCalledWith(debugMock, 'monalisa is not an admin')
  assertCalledWith(warningMock, 'non 204 response from org team check: 500')
})

test('runs isAdmin checks for an org team and an unexpected error is thrown from any API call', async () => {
  queueMockImplementation(requestMock, () =>
    Promise.reject(new WildError('something went boom'))
  )
  process.env['INPUT_ADMINS'] = 'octoawesome/octo-awesome-team'
  assert.strictEqual(await isAdmin(context, createClientMock), false)
  assertCalledWith(debugMock, 'monalisa is not an admin')
  assertCalledWith(
    warningMock,
    'error checking org team membership: Error: something went boom'
  )
})
