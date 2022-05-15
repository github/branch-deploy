import { createDeploymentStatus } from '../../src/functions/deployment'

const context = {
    repo: {
        owner: 'corp',
        repo: 'test'
    },
    payload: {
        comment: {
            id: '1'
        }
    }
}

const octokit = {
    rest: {
        repos: {
            createDeploymentStatus: jest.fn().mockReturnValueOnce({
                data: {}
            })
        }
    }
}

test('checks a message and does not find prefix trigger', async () => {
    expect(await createDeploymentStatus(octokit, context, 'test-ref', 'in_progress', 123, 'production')).toStrictEqual({})
})
