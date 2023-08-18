import {isAdmin} from '../../src/functions/admin'
import {COLORS} from '../../src/functions/colors'
import * as github from '@actions/github'
import * as core from '@actions/core'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const warningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})
// const infoMock = jest.spyOn(core, 'info').mockImplementation(() => {})

class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.status = 404
  }
}

class WildError extends Error {
  constructor(message) {
    super(message)
    this.status = 500
  }
}

var context
var octokit
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  process.env.INPUT_ADMINS_PAT = 'faketoken'
  process.env.INPUT_ADMINS =
    'MoNaLiSa,@lisamona,octoawesome/octo-awEsome-team,bad$user'

  context = {
    actor: 'monalisa'
  }

  octokit = {
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

  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return octokit
  })
})

test('runs isAdmin checks and finds a valid admin via handle reference', async () => {
  expect(await isAdmin(context)).toStrictEqual(true)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is an admin via handle reference'
  )
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
  expect(warningMock).toHaveBeenCalledWith(
    `🚨 no ${COLORS.highlight}admins_pat${COLORS.reset} provided, skipping admin check for org team membership`
  )
})

test('runs isAdmin checks for an org team and finds a valid user', async () => {
  process.env.INPUT_ADMINS = 'octoawesome/octo-awesome-team'
  expect(await isAdmin(context)).toStrictEqual(true)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is in octoawesome/octo-awesome-team'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is an admin via org team reference'
  )
})

// This only handles the global failure case of any 404 in the admin.js file
test('runs isAdmin checks for an org team and does not find the org', async () => {
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        orgs: {
          get: jest
            .fn()
            .mockRejectedValueOnce(
              new NotFoundError('Reference does not exist')
            )
        }
      }
    }
  })
  process.env.INPUT_ADMINS = 'octoawesome/octo-awesome-team'
  expect(await isAdmin(context)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

// This only handles the global failure case of any 404 in the admin.js file
test('runs isAdmin checks for an org team and does not find the team', async () => {
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        orgs: {
          get: jest.fn().mockReturnValueOnce({
            data: {id: '12345'}
          })
        },
        teams: {
          getByName: jest
            .fn()
            .mockRejectedValueOnce(
              new NotFoundError('Reference does not exist')
            )
        }
      }
    }
  })
  process.env.INPUT_ADMINS = 'octoawesome/octo-awesome-team'
  expect(await isAdmin(context)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

// This test correctly tests if a user is a member of a team or not. If they are in a team a 204 is returned. If they are not a 404 is returned like in this test example
test('runs isAdmin checks for an org team and does not find the user in the team', async () => {
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      request: jest
        .fn()
        .mockRejectedValueOnce(new NotFoundError('Reference does not exist')),
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
  process.env.INPUT_ADMINS = 'octoawesome/octo-awesome-team'
  expect(await isAdmin(context)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith(
    'monalisa is not a member of the octoawesome/octo-awesome-team team'
  )
})

test('runs isAdmin checks for an org team and an unexpected status code is received from the request method with octokit', async () => {
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      request: jest.fn().mockReturnValueOnce({
        status: 500
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
  process.env.INPUT_ADMINS = 'octoawesome/octo-awesome-team'
  expect(await isAdmin(context)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith('monalisa is not an admin')
  expect(warningMock).toHaveBeenCalledWith(
    'non 204 response from org team check: 500'
  )
})

test('runs isAdmin checks for an org team and an unexpected error is thrown from any API call', async () => {
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      request: jest
        .fn()
        .mockRejectedValueOnce(new WildError('something went boom')),
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
  process.env.INPUT_ADMINS = 'octoawesome/octo-awesome-team'
  expect(await isAdmin(context)).toStrictEqual(false)
  expect(debugMock).toHaveBeenCalledWith('monalisa is not an admin')
  expect(warningMock).toHaveBeenCalledWith(
    'error checking org team membership: Error: something went boom'
  )
})
