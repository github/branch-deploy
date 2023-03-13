import {environmentTargets} from '../../src/functions/environment-targets'
import * as actionStatus from '../../src/functions/action-status'
import * as core from '@actions/core'
import dedent from 'dedent-js'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const warningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})
const saveStateMock = jest.spyOn(core, 'saveState')

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  process.env.INPUT_ENVIRONMENT_TARGETS = 'production,development,staging'
  process.env.INPUT_GLOBAL_LOCK_FLAG = '--global'
  process.env.INPUT_LOCK_INFO_ALIAS = '.wcid'
})

const environment = 'production'
const body = '.deploy'
const trigger = '.deploy'
const noop_trigger = 'noop'
const stable_branch = 'main'

test('checks the comment body and does not find an explicit environment target', async () => {
  expect(
    await environmentTargets(
      environment,
      body,
      trigger,
      noop_trigger,
      stable_branch
    )
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
      noop_trigger,
      stable_branch
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
      noop_trigger,
      stable_branch
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
      noop_trigger,
      stable_branch
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
      noop_trigger,
      stable_branch
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    "Found environment target for branch deploy (with 'to'): production"
  )
})

test('checks the comment body on a noop deploy and does not find an explicit environment target', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy noop',
      trigger,
      noop_trigger,
      stable_branch
    )
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
      noop_trigger,
      stable_branch
    )
  ).toBe(false)

  const msg = dedent(`
  No matching environment target found. Please check your command and try again. You can read more about environment targets in the README of this Action.

  > The following environment targets are available: \`production,development,staging\`
  `)

  expect(warningMock).toHaveBeenCalledWith(msg)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('checks the comment body on a stable branch deployment and finds a matching environment (with to)', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy main to production',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    "Found environment target for stable branch deploy (with 'to'): production"
  )
})

test('checks the comment body on a stable branch deployment and finds a matching environment (without to)', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy main production',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for stable branch deploy: production'
  )
})

test('checks the comment body on a stable branch deployment and uses the default environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy main',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for stable branch deployment'
  )
})

test('checks the comment body on a stable branch deployment and does not find a matching environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy main chaos',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toBe(false)

  const msg = dedent(`
  No matching environment target found. Please check your command and try again. You can read more about environment targets in the README of this Action.

  > The following environment targets are available: \`production,development,staging\`
  `)

  expect(warningMock).toHaveBeenCalledWith(msg)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('checks the comment body on a lock request and uses the default environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.lock', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for lock request'
  )
})

test('checks the comment body on an unlock request and uses the default environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.unlock', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for unlock request'
  )
})

test('checks the comment body on a lock info alias request and uses the default environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.wcid', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for lock info request'
  )
})

test('checks the comment body on a lock request and uses the production environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.lock production', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toBe('production')
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for lock request: production'
  )
})

test('checks the comment body on an unlock request and uses the development environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.unlock development', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toBe('development')
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for unlock request: development'
  )
})

test('checks the comment body on a lock info alias request and uses the development environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.wcid development', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toBe('development')
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for lock info request: development'
  )
})

test('checks the comment body on a lock info request and uses the development environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.lock --info development', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toBe('development')
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for lock request: development'
  )
})

test('checks the comment body on a lock info request and uses the development environment (using -d)', async () => {
  expect(
    await environmentTargets(
      environment,
      '.lock -d development', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toBe('development')
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for lock request: development'
  )
})
