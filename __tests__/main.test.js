import {run} from '../src/main'
import * as reactEmote from '../src/functions/react-emote'
import * as contextCheck from '../src/functions/context-check'
import * as prechecks from '../src/functions/prechecks'
import * as actionStatus from '../src/functions/action-status'
import * as github from '@actions/github'
import * as core from '@actions/core'

const setOutputMock = jest.spyOn(core, 'setOutput')
const saveStateMock = jest.spyOn(core, 'saveState')
const setFailedMock = jest.spyOn(core, 'setFailed')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  process.env.INPUT_GITHUB_TOKEN = 'faketoken'
  process.env.INPUT_TRIGGER = '.deploy'
  process.env.INPUT_REACTION = 'eyes'
  process.env.INPUT_PREFIX_ONLY = 'true'
  process.env.INPUT_ENVIRONMENT = 'production'
  process.env.INPUT_STABLE_BRANCH = 'main'
  process.env.INPUT_NOOP_TRIGGER = 'noop'
  process.env.INPUT_REQUIRED_CONTEXTS = 'false'
  process.env.GITHUB_REPOSITORY = 'corp/test'
  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy'
    }
  }

  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        repos: {
          createDeployment: jest.fn().mockImplementation(() => {
            return {data: {id: 123}}
          }),
          createDeploymentStatus: jest.fn().mockImplementation(() => {
            return {data: {}}
          })
        }
      }
    }
  })
  jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return true
  })
  jest.spyOn(reactEmote, 'reactEmote').mockImplementation(() => {
    return {data: {id: '123'}}
  })
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false
    }
  })
})

test('successfully runs the action', async () => {
  expect(await run()).toBe('success')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', '123')
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', 'false')
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', '123')
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', 'false')
  expect(saveStateMock).toHaveBeenCalledWith('deployment_id', 123)
})

test('successfully runs the action in noop mode', async () => {
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true
    }
  })
  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy noop'
    }
  }
  expect(await run()).toBe('success - noop')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy noop')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', '123')
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', '123')
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', 'true')
})

test('successfully runs the action with required contexts', async () => {
    process.env.INPUT_REQUIRED_CONTEXTS = 'lint,test,build'
    expect(await run()).toBe('success')
    expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
    expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
    expect(setOutputMock).toHaveBeenCalledWith('comment_id', '123')
    expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
    expect(setOutputMock).toHaveBeenCalledWith('noop', 'false')
    expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
    expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
    expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
    expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
    expect(saveStateMock).toHaveBeenCalledWith('comment_id', '123')
    expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
    expect(saveStateMock).toHaveBeenCalledWith('noop', 'false')
  })

test('fails due to a bad context', async () => {
  jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return false
  })
  expect(await run()).toBe('safe-exit')
})

test('fails due to no trigger being found', async () => {
  process.env.INPUT_TRIGGER = '.shipit'
  expect(await run()).toBe('safe-exit')
})

test('fails prechecks', async () => {
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: false,
      message: '### ⚠️ Cannot proceed with deployment... something went wrong',
      noopMode: false
    }
  })
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('failure')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    '### ⚠️ Cannot proceed with deployment... something went wrong'
  )
})
