import {environmentTargets} from '../../src/functions/environment-targets'
import * as actionStatus from '../../src/functions/action-status'
import * as core from '@actions/core'
import dedent from 'dedent-js'
import {COLORS} from '../../src/functions/colors'

const infoMock = jest.spyOn(core, 'info').mockImplementation(() => {})
const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})
const warningMock = jest.spyOn(core, 'warning').mockImplementation(() => {})
const saveStateMock = jest.spyOn(core, 'saveState').mockImplementation(() => {})
const setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation(() => {})

beforeEach(() => {
  jest.clearAllMocks()
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
const noop_trigger = '.noop'
const stable_branch = 'main'
const environmentUrls =
  'production|https://example.com,development|https://dev.example.com,staging|http://staging.example.com'

test('checks the comment body and does not find an explicit environment target', async () => {
  expect(
    await environmentTargets(
      environment,
      body,
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      noop: false,
      stable_branch_used: false,
      params: null
    }
  })
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
  ).toStrictEqual({
    environment: 'development',
    environmentUrl: null,
    environmentObj: {
      target: 'development',
      noop: false,
      stable_branch_used: false,
      params: null
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for branch deploy: development'
  )
})

test('checks the comment body and finds an explicit environment target for development with params', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy development | something1 something2 something3',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toStrictEqual({
    environment: 'development',
    environmentUrl: null,
    environmentObj: {
      target: 'development',
      noop: false,
      stable_branch_used: false,
      params: 'something1 something2 something3'
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for branch deploy: development'
  )
  expect(infoMock).toHaveBeenCalledWith(
    `Detected parameters in command: 'something1 something2 something3'`
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'params',
    'something1 something2 something3'
  )
})

test('checks the comment body and finds an explicit environment target for development to stable_branch with params and a custom separator', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy main development + something1 | something2 something3',
      trigger,
      noop_trigger,
      stable_branch,
      null,
      null,
      null,
      false, // lockChecks disabled
      null, // environmentUrls
      '+' // custom separator
    )
  ).toStrictEqual({
    environment: 'development',
    environmentUrl: null,
    environmentObj: {
      target: 'development',
      noop: false,
      stable_branch_used: true,
      params: 'something1 | something2 something3'
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for stable branch deploy: development'
  )
  expect(infoMock).toHaveBeenCalledWith(
    `Detected parameters in command: 'something1 | something2 something3'`
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'params',
    'something1 | something2 something3'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy', async () => {
  expect(
    await environmentTargets(
      environment,
      '.noop staging',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toStrictEqual({
    environment: 'staging',
    environmentUrl: null,
    environmentObj: {
      target: 'staging',
      noop: true,
      stable_branch_used: false,
      params: null
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for noop trigger: staging'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with the stable branch', async () => {
  expect(
    await environmentTargets(
      environment,
      '.noop main staging',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toStrictEqual({
    environment: 'staging',
    environmentUrl: null,
    environmentObj: {
      target: 'staging',
      noop: true,
      stable_branch_used: true,
      params: null
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for stable branch noop trigger: staging'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with environment_urls set', async () => {
  expect(
    await environmentTargets(
      environment,
      '.noop staging',
      trigger,
      noop_trigger,
      stable_branch,
      null,
      null,
      null,
      false, // lockChecks disabled
      environmentUrls
    )
  ).toStrictEqual({
    environment: 'staging',
    environmentUrl: 'http://staging.example.com',
    environmentObj: {
      target: 'staging',
      noop: true,
      stable_branch_used: false,
      params: null
    }
  })
  expect(infoMock).toHaveBeenCalledWith(
    `🔗 environment url detected: ${COLORS.highlight}http://staging.example.com`
  )
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for noop trigger: staging'
  )
  expect(saveStateMock).toHaveBeenCalledWith(
    'environment_url',
    'http://staging.example.com'
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'environment_url',
    'http://staging.example.com'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with environment_urls set and using the stable branch with "to" - and params!', async () => {
  expect(
    await environmentTargets(
      environment,
      '.noop main to staging | something1 something2 something3',
      trigger,
      noop_trigger,
      stable_branch,
      null,
      null,
      null,
      false, // lockChecks disabled
      environmentUrls
    )
  ).toStrictEqual({
    environment: 'staging',
    environmentUrl: 'http://staging.example.com',
    environmentObj: {
      target: 'staging',
      noop: true,
      stable_branch_used: true,
      params: 'something1 something2 something3'
    }
  })
  expect(infoMock).toHaveBeenCalledWith(
    `🔗 environment url detected: ${COLORS.highlight}http://staging.example.com`
  )
  expect(debugMock).toHaveBeenCalledWith(
    `Found environment target for stable branch noop trigger (with 'to'): staging`
  )
  expect(saveStateMock).toHaveBeenCalledWith(
    'environment_url',
    'http://staging.example.com'
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'environment_url',
    'http://staging.example.com'
  )
})

test('checks the comment body and uses the default production environment target with environment_urls set', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy',
      trigger,
      noop_trigger,
      stable_branch,
      null,
      null,
      null,
      false, // lockChecks disabled
      environmentUrls
    )
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: 'https://example.com',
    environmentObj: {
      target: 'production',
      noop: false,
      stable_branch_used: false,
      params: null
    }
  })
  expect(infoMock).toHaveBeenCalledWith(
    `🔗 environment url detected: ${COLORS.highlight}https://example.com`
  )
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for branch deployment'
  )
  expect(saveStateMock).toHaveBeenCalledWith(
    'environment_url',
    'https://example.com'
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'environment_url',
    'https://example.com'
  )
})

test('checks the comment body and finds an explicit environment target for a production deploy with environment_urls set but no valid url', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy production',
      trigger,
      noop_trigger,
      stable_branch,
      null,
      null,
      null,
      false, // lockChecks disabled
      'evil-production|example.com,development|dev.example.com,staging|'
    )
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      noop: false,
      params: null,
      stable_branch_used: false
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for branch deploy: production'
  )
  expect(warningMock).toHaveBeenCalledWith(
    "no valid environment URL found for environment: production - setting environment URL to 'null' - please check your 'environment_urls' input"
  )
  expect(saveStateMock).toHaveBeenCalledWith('environment_url', 'null')
  expect(setOutputMock).toHaveBeenCalledWith('environment_url', 'null')
})

test('checks the comment body and finds an explicit environment target for a production deploy with environment_urls set but a url with a non-http(s) schema is provided', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy production',
      trigger,
      noop_trigger,
      stable_branch,
      null,
      null,
      null,
      false, // lockChecks disabled
      'production|example.com,development|dev.example.com,staging|'
    )
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: false,
      noop: false,
      params: null
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for branch deploy: production'
  )
  expect(warningMock).toHaveBeenCalledWith(
    'environment url does not match http(s) schema: example.com'
  )
  expect(warningMock).toHaveBeenCalledWith(
    "no valid environment URL found for environment: production - setting environment URL to 'null' - please check your 'environment_urls' input"
  )
  expect(saveStateMock).toHaveBeenCalledWith('environment_url', 'null')
  expect(setOutputMock).toHaveBeenCalledWith('environment_url', 'null')
})

test('checks the comment body and finds an explicit environment target for a production deploy with environment_urls set but the environment url for the given environment is disabled', async () => {
  expect(
    await environmentTargets(
      environment,
      '.deploy production',
      trigger,
      noop_trigger,
      stable_branch,
      null,
      null,
      null,
      false, // lockChecks disabled
      'production|disabled,development|dev.example.com,staging|'
    )
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: false,
      noop: false,
      params: null
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for branch deploy: production'
  )
  expect(infoMock).toHaveBeenCalledWith(
    `💡 environment url for ${COLORS.highlight}production${COLORS.reset} is explicitly disabled`
  )
  expect(saveStateMock).toHaveBeenCalledWith('environment_url', 'null')
  expect(setOutputMock).toHaveBeenCalledWith('environment_url', 'null')
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with "to"', async () => {
  expect(
    await environmentTargets(
      environment,
      '.noop to staging',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toStrictEqual({
    environment: 'staging',
    environmentUrl: null,
    environmentObj: {
      target: 'staging',
      stable_branch_used: false,
      noop: true,
      params: null
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    "Found environment target for noop trigger (with 'to'): staging"
  )
})

test('checks the comment body and finds a noop deploy to the stable branch and default environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.noop main',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: true,
      noop: true,
      params: null
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for stable branch noop trigger'
  )
})

test('checks the comment body and finds a noop deploy to the stable branch and default environment with params', async () => {
  expect(
    await environmentTargets(
      environment,
      '.noop main | foo=bar',
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: true,
      noop: true,
      params: 'foo=bar'
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for stable branch noop trigger'
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
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: false,
      noop: false,
      params: null
    }
  })
  expect(debugMock).toHaveBeenCalledWith(
    "Found environment target for branch deploy (with 'to'): production"
  )
})

test('checks the comment body on a noop deploy and does not find an explicit environment target', async () => {
  expect(
    await environmentTargets(
      environment,
      '.noop', // comment body
      trigger,
      noop_trigger,
      stable_branch
    )
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: false,
      noop: true,
      params: null
    }
  })
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
  ).toStrictEqual({
    environment: false,
    environmentUrl: null,
    environmentObj: {
      noop: null,
      params: null,
      stable_branch_used: null,
      target: false
    }
  })

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
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: true,
      noop: false,
      params: null
    }
  })
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
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: true,
      noop: false,
      params: null
    }
  })
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
  ).toStrictEqual({
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: true,
      noop: false,
      params: null
    }
  })
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
  ).toStrictEqual({
    environment: false,
    environmentUrl: null,
    environmentObj: {
      noop: null,
      params: null,
      stable_branch_used: null,
      target: false
    }
  })

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
  ).toStrictEqual({environment: 'production', environmentUrl: null})
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for lock request'
  )
})

test('checks the comment body on a lock request with a reason and uses the default environment', async () => {
  expect(
    await environmentTargets(
      environment,
      '.lock --reason making a small change to our api because reasons', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toStrictEqual({environment: 'production', environmentUrl: null})
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for lock request'
  )
})

test('checks the comment body on a lock request with a reason and uses the explict environment with a bunch of horrible formatting', async () => {
  expect(
    await environmentTargets(
      environment,
      '.lock  production    --reason small change to mappings for risk rating - - 92*91-2408|  ', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toStrictEqual({environment: 'production', environmentUrl: null})
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for lock request: production'
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
  ).toStrictEqual({environment: 'production', environmentUrl: null})
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for unlock request'
  )
})

test('checks the comment body on an unlock request and uses the default environment (and uses --reason) even though it does not need to', async () => {
  expect(
    await environmentTargets(
      environment,
      '.unlock --reason oh wait this command does not need a reason.. oops', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toStrictEqual({environment: 'production', environmentUrl: null})
  expect(debugMock).toHaveBeenCalledWith(
    'Using default environment for unlock request'
  )
})

test('checks the comment body on an unlock request and uses the development environment (and uses --reason) even though it does not need to', async () => {
  expect(
    await environmentTargets(
      environment,
      '.unlock development --reason oh wait this command does not need a reason.. oops', // comment body
      '.lock', // lock trigger
      '.unlock', // unlock trigger
      null, // stable_branch not used for lock/unlock requests
      null, // context
      null, // octokit
      null, // reaction_id
      true // enable lockChecks
    )
  ).toStrictEqual({environment: 'development', environmentUrl: null})
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for unlock request: development'
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
  ).toStrictEqual({environment: 'production', environmentUrl: null})
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
  ).toStrictEqual({environment: 'production', environmentUrl: null})
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
  ).toStrictEqual({environment: 'development', environmentUrl: null})
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
  ).toStrictEqual({environment: 'development', environmentUrl: null})
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
  ).toStrictEqual({environment: 'development', environmentUrl: null})
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
  ).toStrictEqual({environment: 'development', environmentUrl: null})
  expect(debugMock).toHaveBeenCalledWith(
    'Found environment target for lock request: development'
  )
})
