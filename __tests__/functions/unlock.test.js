import * as core from '@actions/core'
import { unlock } from '../../src/functions/unlock'
import * as actionStatus from '../../src/functions/action-status'

beforeEach(() => {
    jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
        return undefined
    })
    jest.spyOn(core, 'info').mockImplementation(() => { })
})

const context = {
    repo: {
        owner: 'corp',
        repo: 'test'
    },
    issue: {
        number: 1
    }
}

const octokit = {
    rest: {
        git: {
            deleteRef: jest.fn().mockReturnValue({ status: 204 })
        }
    }
}

test('successfully releases a deployment lock with the unlock function', async () => {
    expect(await unlock(octokit, context, 123)).toBe(true)
    expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
        owner: 'corp',
        repo: 'test',
        ref: 'heads/branch-deploy-lock'
    })
})

test('fails to release a deployment lock due to a bad HTTP code from the GitHub API', async () => {
    const badHttpOctokitMock = {
        rest: {
            git: {
                deleteRef: jest.fn().mockReturnValue({ status: 500 })
            }
        }
    }
    expect(await unlock(badHttpOctokitMock, context, 123)).toBe(false)
    expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
        owner: 'corp',
        repo: 'test',
        ref: 'heads/branch-deploy-lock'
    })
})
