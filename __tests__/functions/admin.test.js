import {isAdmin} from '../../src/functions/admin'
import * as github from '@actions/github'
import * as core from '@actions/core'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const warningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})

beforeEach(() => {
  jest.resetAllMocks()
  process.env.INPUT_ADMINS_PAT = 'faketoken'
  process.env.INPUT_ADMINS =
    'monalisa,@lisamona,octoawesome/octo-awesome-team,bad$user'
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      request: jest.fn().mockReturnValueOnce({
        status: 204
      }),
      rest: {
        orgs: {
          get: jest.fn().mockReturnValueOnce({
            data: {id: '12345'}
          })
        },
        teams: {
          getByName: jest.fn().mockReturnValueOnce({
            data: {id: '567890'}
          })
        }
      }
    }
  })
})

const context = {
  actor: 'monalisa'
}

test('runs isAdmin checks and finds a valid admin via handle reference', async () => {
    expect(await isAdmin(context)).toStrictEqual(true)
    expect(debugMock).toHaveBeenCalledWith('monalisa is an admin via handle reference')
})

test('runs isAdmin checks and does not find a valid admin', async () => {
    process.env.INPUT_ADMINS = 'monalisa'
    const contextNoAdmin = {
        actor: 'eviluser'
    }
    expect(await isAdmin(contextNoAdmin)).toStrictEqual(false)
    expect(debugMock).toHaveBeenCalledWith('eviluser is not an admin')
})

test('runs isAdmin checks for an org team and fails due to no admins_pat', async () => {
    process.env.INPUT_ADMINS_PAT = 'false'
    process.env.INPUT_ADMINS = 'octoawesome/octo-awesome'
    expect(await isAdmin(context)).toStrictEqual(false)
    expect(warningMock).toHaveBeenCalledWith('No admins_pat provided, skipping admin check for org team membership')
})

test('runs isAdmin checks for an org team and finds a valid user', async () => {
  process.env.INPUT_ADMINS = 'octoawesome/octo-awesome-team'
  expect(await isAdmin(context)).toStrictEqual(true)
  expect(debugMock).toHaveBeenCalledWith('monalisa is in octoawesome/octo-awesome-team')
  expect(debugMock).toHaveBeenCalledWith('monalisa is an admin via org team reference')
})
