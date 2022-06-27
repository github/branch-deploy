import { isAdmin } from '../../src/functions/admin'
import * as core from '@actions/core'
import * as github from '@actions/github'

beforeEach(() => {
    jest.resetAllMocks()
    process.env.INPUT_ADMINS_PAT = 'faketoken'
    process.env.INPUT_ADMINS = 'monalisa,@lisamona,octoawesome/octo-awesome,bad$user'
    jest.spyOn(core, 'debug').mockImplementation(() => { })
    jest.spyOn(core, 'warning').mockImplementation(() => {})
    jest.spyOn(github, 'getOctokit').mockImplementation(() => {
        return {
            get: jest.fn(),
            rest: {
                orgs: {
                    get: jest.fn().mockReturnValueOnce({
                        data: {}
                    })
                },
                teams: {
                    getByName: jest.fn().mockReturnValueOnce({
                        data: {}
                    })
                }
            }
        }
    })
})

const context = {
    actor: 'monalisa'
}

test('runs isAdmin checks and finds a valid admin', async () => {
    expect(await isAdmin(context)).toStrictEqual(true)
})
