import {environmentTargets} from '../../src/functions/environment-targets'
import * as actionStatus from '../../src/functions/action-status'
import * as core from '@actions/core'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const warningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})
const saveStateMock = jest.spyOn(core, 'saveState')

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  process.env.INPUT_ENVIRONMENT_TARGETS = 'production,development,staging'
})

const environment = 'production'
const body = '.deploy'
const trigger = '.deploy'
const noop_trigger = 'noop'

test('checks the comment body and does not find an explicit environment target', async () => {
  expect(
    await environmentTargets(environment, body, trigger, noop_trigger)
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for branch deployment'
  )
})

test('checks the comment body and finds an explicit environment target for development', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy development',
      trigger,
      noop_trigger
    )
  ).toBe('development')
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for branch deploy: development'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy noop staging',
      trigger,
      noop_trigger
    )
  ).toBe('staging')
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for noop trigger: staging'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with "to"', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy noop to staging',
      trigger,
      noop_trigger
    )
  ).toBe('staging')
  expect(debugMock).toHaveBeenCalledWith(
    "Found environment target for noop trigger (with 'to'): staging"
  )
})

test('checks the comment body and finds an explicit environment target for production on a branch deploy with "to"', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy to production',
      trigger,
      noop_trigger
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    "Found environment target for branch deploy (with 'to'): production"
  )
})

test('checks the comment body on a noop deploy and does not find an explicit environment target', async () => {
  expect(
    await environmentTargets(environment, '.deploy noop', trigger, noop_trigger)
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for noop trigger'
  )
})

test('checks the comment body on a deployment and does not find any matching environment target (fails)', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy to chaos',
      trigger,
      noop_trigger
    )
  ).toBe(false)
  expect(warningMock).toHaveBeenCalledWith(
    'No matching environment target found. Please check your command and try again'
  )
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})
