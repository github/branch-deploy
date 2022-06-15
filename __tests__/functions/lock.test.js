import * as core from '@actions/core'
import { lock } from '../../src/functions/lock'
import * as actionStatus from '../../src/functions/action-status'

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.status = 404;
    }
}

const saveStateMock = jest.spyOn(core, 'saveState')
const setFailedMock = jest.spyOn(core, 'setFailed')
const infoMock = jest.spyOn(core, 'info')

beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(core, 'setFailed').mockImplementation(() => { })
    jest.spyOn(core, 'saveState').mockImplementation(() => { })
    jest.spyOn(core, 'info').mockImplementation(() => { })
})

const context = {
    actor: 'monalisa',
    repo: {
        owner: 'corp',
        repo: 'test'
    },
    issue: {
        number: 1
    },
    payload: {
        comment: {
            body: '.deploy',
            id: 123
        }
    }
}

const ref = 'cool-new-feature'

test('successfully obtains a deployment lock (non-sticky) by creating the branch and lock file', async () => {
    const octokit = {
        rest: {
            repos: {
                getBranch: jest
                    .fn()
                    .mockRejectedValueOnce(new NotFoundError('Reference does not exist'))
                    .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
                get: jest.fn().mockReturnValue({ data: { default_branch: "main" } }),
                createOrUpdateFileContents: jest.fn().mockReturnValue({})
            },
            git: {
                createRef: jest.fn().mockReturnValue({ status: 201 })
            },
            issues: {
                createComment: jest.fn().mockReturnValue({})
            }
        }
    }
    expect(await lock(octokit, context, ref, 123, false)).toBe(true)
    expect(infoMock).toHaveBeenCalledWith('Created lock branch: branch-deploy-lock')
})
