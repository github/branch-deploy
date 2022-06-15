import * as core from '@actions/core'
import { lock } from '../../src/functions/lock'
import * as actionStatus from '../../src/functions/action-status'

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.status = 404;
    }
}

const lockBase64Monalisa = "ewogICAgInJlYXNvbiI6IG51bGwsCiAgICAiYnJhbmNoIjogImNvb2wtbmV3LWZlYXR1cmUiLAogICAgImNyZWF0ZWRfYXQiOiAiMjAyMi0wNi0xNVQyMToxMjoxNC4wNDFaIiwKICAgICJjcmVhdGVkX2J5IjogIm1vbmFsaXNhIiwKICAgICJzdGlja3kiOiBmYWxzZSwKICAgICJsaW5rIjogImh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8zI2lzc3VlY29tbWVudC0xMjMiCn0K"

const lockBase64Octocat = "ewogICAgInJlYXNvbiI6ICJUZXN0aW5nIG15IG5ldyBmZWF0dXJlIHdpdGggbG90cyBvZiBjYXRzIiwKICAgICJicmFuY2giOiAib2N0b2NhdHMtZXZlcnl3aGVyZSIsCiAgICAiY3JlYXRlZF9hdCI6ICIyMDIyLTA2LTE0VDIxOjEyOjE0LjA0MVoiLAogICAgImNyZWF0ZWRfYnkiOiAib2N0b2NhdCIsCiAgICAic3RpY2t5IjogdHJ1ZSwKICAgICJsaW5rIjogImh0dHBzOi8vZ2l0aHViLmNvbS90ZXN0LW9yZy90ZXN0LXJlcG8vcHVsbC8yI2lzc3VlY29tbWVudC00NTYiCn0K"

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

test('Determines that another user has the lock and exits', async () => {
    const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
        return undefined
    })
    const octokit = {
        rest: {
            repos: {
                getBranch: jest
                    .fn()
                    .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
                get: jest.fn().mockReturnValue({ data: { default_branch: "main" } }),
                getContent: jest.fn().mockReturnValue({data: {content: lockBase64Octocat}})
            }
        }
    }
    expect(await lock(octokit, context, ref, 123, false)).toBe(false)
    expect(actionStatusSpy).toHaveBeenCalledWith(context, octokit, 123, expect.stringMatching(/Sorry __monalisa__, the deployment lock has already been claimed/))
    expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
    expect(setFailedMock).toHaveBeenCalledWith(expect.stringMatching(/Sorry __monalisa__, the deployment lock has already been claimed/))
})

test('Determines that the lock request is coming from current owner of the lock and exits', async () => {
    const octokit = {
        rest: {
            repos: {
                getBranch: jest
                    .fn()
                    .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
                get: jest.fn().mockReturnValue({ data: { default_branch: "main" } }),
                getContent: jest.fn().mockReturnValue({data: {content: lockBase64Monalisa}})
            }
        }
    }
    expect(await lock(octokit, context, ref, 123, false)).toBe('owner')
    expect(infoMock).toHaveBeenCalledWith('monalisa is the owner of the lock')
})

test('Creates a lock when the lock branch exists but no lock file exists', async () => {
    const octokit = {
        rest: {
            repos: {
                getBranch: jest
                    .fn()
                    .mockReturnValueOnce({data: {commit: {sha: 'abc123'}}}),
                get: jest.fn().mockReturnValue({ data: { default_branch: "main" } }),
                getContent: jest.fn().mockRejectedValue(new NotFoundError('file not found')),
                createOrUpdateFileContents: jest.fn().mockReturnValue({})
            },
            issues: {
                createComment: jest.fn().mockReturnValue({})
            }
        }
    }
    expect(await lock(octokit, context, ref, 123, false)).toBe(true)
    expect(infoMock).toHaveBeenCalledWith('deployment lock obtained')
})

// test('fails to release a deployment lock due to a bad HTTP code from the GitHub API', async () => {
//     const badHttpOctokitMock = {
//         rest: {
//             git: {
//                 deleteRef: jest.fn().mockReturnValue({ status: 500 })
//             }
//         }
//     }
//     expect(await unlock(badHttpOctokitMock, context, 123)).toBe(false)
//     expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
//         owner: 'corp',
//         repo: 'test',
//         ref: 'heads/branch-deploy-lock'
//     })
// })

// test('Does not find a deployment lock branch so it lets the user know', async () => {
//     const actionStatusSpy = jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
//         return undefined
//     })
//     const noBranchOctokitMock = {
//         rest: {
//             git: {
//                 deleteRef: jest.fn().mockRejectedValue(new NotFoundError('Reference does not exist'))
//             }
//         }
//     }
//     expect(await unlock(noBranchOctokitMock, context, 123)).toBe(true)
//     expect(actionStatusSpy).toHaveBeenCalledWith(context, noBranchOctokitMock, 123, '🔓 There is currently no deployment lock set', true, true)
// })

// test('throws an error if an unhandled exception occurs', async () => {
//     const errorOctokitMock = {
//         rest: {
//             git: {
//                 deleteRef: jest.fn().mockRejectedValue(new Error('oh no'))
//             }
//         }
//     }
//     try {
//         await unlock(errorOctokitMock, context, 123)
//     } catch (e) {
//         expect(e.message).toBe('Error: oh no')
//     }
// })

