import { run } from '../src/main'
import * as core from '@actions/core'
// import * as postDeploy from '../../src/functions/post-deploy'
// import * as contextCheck from '../../src/functions/context-check'
import * as reactEmote from '../src/functions/react-emote'
import * as github from '@actions/github'
import * as contextCheck from '../src/functions/context-check'


describe('branch-deploy action', () => {
    let inputs = {}

    // const setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation(() => {})
    // const setWarningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})

    beforeAll(async () => {
        jest.resetAllMocks()
        jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
            if (inputs[name] === undefined && options && options.required) {
                throw new Error(name + ' was not expected to be empty')
            }
            return inputs[name]
        })
        jest.spyOn(github, 'getOctokit').mockImplementation(() => {
            return true
        })
        jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
            return true
        })
        jest.spyOn(reactEmote, 'reactEmote').mockImplementation(() => {
            return true
        })
        jest.spyOn(core, 'info').mockImplementation(() => { })
    })

    beforeEach(() => {
        // clear inputs
        inputs = {}
    })

    test('successfully runs the action', async () => {

        inputs = {
            trigger: '.deploy',
            reaction: 'eyes',
            prefixOnly: 'true',
            github_token: 'faketoken',
            environment: 'production',
            stable_branch: 'main',
            noop_trigger: 'noop',
            required_contexts: 'false'
        }

        process.env.GITHUB_REPOSITORY = 'corp/test'

        github.context.payload = {
            issue: {
                number: 123
            },
            comment: {
                body: '.deploy'
            }
        }

        expect(await run()).toBe('success')
    })
})
