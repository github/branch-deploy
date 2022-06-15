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
        },
        issues: {
            createComment: jest.fn().mockReturnValue({ data: {} })
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
