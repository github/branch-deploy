import type {
  DeploymentEnvironmentRequest,
  LockEnvironmentRequest
} from '../../src/functions/environment-targets.ts'
import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {dedent} from '../../src/functions/dedent.ts'
import {COLORS} from '../../src/functions/colors.ts'
import {createIssueCommentContext, createOctokit} from '../test-helpers.ts'
import {
  assertCalledWith,
  createMock,
  stubEnv,
  installModuleMock
} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')
type ActionStatus = typeof import('../../src/functions/action-status.ts')

function readInput(name: string, trimWhitespace = true): string {
  const value =
    process.env[`INPUT_${name.replace(/ /gu, '_').toUpperCase()}`] ?? ''
  return trimWhitespace ? value.trim() : value
}

const debugMock = createMock<ActionsCore['debug']>()
const infoMock = createMock<ActionsCore['info']>()
const setOutputMock = createMock<ActionsCore['setOutput']>()
const saveStateMock = createMock<ActionsCore['saveState']>()
const warningMock = createMock<ActionsCore['warning']>()
const getInputMock = createMock<ActionsCore['getInput']>((name, options) =>
  readInput(name, options?.trimWhitespace !== false)
)
const actionStatusMock = createMock<ActionStatus['actionStatus']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  getInput: getInputMock,
  info: infoMock,
  saveState: saveStateMock,
  setOutput: setOutputMock,
  warning: warningMock
})
installModuleMock(
  mock,
  new URL('../../src/functions/action-status.ts', import.meta.url),
  {actionStatus: actionStatusMock}
)

const {environmentTargets} =
  await import('../../src/functions/environment-targets.ts')

beforeEach(testContext => {
  if (!('after' in testContext)) {
    throw new Error('expected a test context')
  }

  debugMock.mock.resetCalls()
  infoMock.mock.resetCalls()
  setOutputMock.mock.resetCalls()
  saveStateMock.mock.resetCalls()
  warningMock.mock.resetCalls()
  getInputMock.mock.resetCalls()
  actionStatusMock.mock.resetCalls()
  actionStatusMock.mock.mockImplementation(() => Promise.resolve(undefined))

  stubEnv(
    testContext,
    'INPUT_ENVIRONMENT_TARGETS',
    'production,development,staging'
  )
  stubEnv(testContext, 'INPUT_GLOBAL_LOCK_FLAG', '--global')
  stubEnv(testContext, 'INPUT_LOCK_INFO_ALIAS', '.wcid')
})

const environment = 'production'
const body = '.deploy'
const trigger = '.deploy'
const noop_trigger = '.noop'
const stable_branch = 'main'
const environmentUrls =
  'production|https://example.com,development|https://dev.example.com,staging|http://staging.example.com'

const context = createIssueCommentContext({
  actor: 'monalisa',
  issue: {number: 1},
  payload: {comment: {body, id: 1}},
  repo: {owner: 'test', repo: 'test'}
})
const octokit = createOctokit()

const deploymentRequestDefaults = {
  alternateTrigger: noop_trigger,
  context,
  environment,
  environmentUrls: null,
  mode: 'deployment',
  octokit,
  paramSeparator: '|',
  reactionId: 123,
  stableBranch: stable_branch,
  trigger
} satisfies Omit<DeploymentEnvironmentRequest, 'body'>

const lockRequestDefaults = {
  alternateTrigger: '.unlock',
  context,
  environment,
  mode: 'lock',
  octokit,
  reactionId: 123,
  trigger: '.lock'
} satisfies Omit<LockEnvironmentRequest, 'body'>

function deploymentRequest(
  requestBody: string,
  overrides: Partial<Omit<DeploymentEnvironmentRequest, 'body' | 'mode'>> = {}
): DeploymentEnvironmentRequest {
  return {...deploymentRequestDefaults, body: requestBody, ...overrides}
}

function lockRequest(requestBody: string): LockEnvironmentRequest {
  return {...lockRequestDefaults, body: requestBody}
}

test('checks the comment body and does not find an explicit environment target', async () => {
  assert.deepStrictEqual(await environmentTargets(deploymentRequest(body)), {
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      noop: false,
      stable_branch_used: false,
      params: null,
      parsed_params: null,
      sha: null
    }
  })

  assertCalledWith(debugMock, 'using default environment for branch deployment')
})

test('checks the comment body and finds an explicit environment target for development', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.deploy development')),
    {
      environment: 'development',
      environmentUrl: null,
      environmentObj: {
        target: 'development',
        noop: false,
        stable_branch_used: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for branch deploy: development'
  )
})

test('checks the comment body and finds an explicit environment target for development with params', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest(
        '.deploy development | something1 something2 something3'
      )
    ),
    {
      environment: 'development',
      environmentUrl: null,
      environmentObj: {
        target: 'development',
        noop: false,
        stable_branch_used: false,
        params: 'something1 something2 something3',
        parsed_params: {_: ['something1', 'something2', 'something3']},
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for branch deploy: development'
  )
  assertCalledWith(
    infoMock,
    `🧮 detected parameters in command: ${COLORS.highlight}"something1 something2 something3"`
  )
  assertCalledWith(setOutputMock, 'params', 'something1 something2 something3')
})

test('escapes multiline parameters before informational logging', async () => {
  const params = 'first\n::error::injected'
  await environmentTargets(deploymentRequest(`.deploy | ${params}`))

  assertCalledWith(
    infoMock,
    `🧮 detected parameters in command: ${COLORS.highlight}${JSON.stringify(params)}`
  )
  assert.ok(
    !infoMock.mock.calls.some(call => String(call.arguments[0]).includes('\n'))
  )
})

test('checks the comment body and finds an explicit environment target and an explicit sha (sha1) for development with params', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest(
        '.deploy 82c238c277ca3df56fe9418a5913d9188eafe3bc development | something1 something2 something3'
      )
    ),
    {
      environment: 'development',
      environmentUrl: null,
      environmentObj: {
        target: 'development',
        noop: false,
        stable_branch_used: false,
        params: 'something1 something2 something3',
        parsed_params: {_: ['something1', 'something2', 'something3']},
        sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc'
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for branch deploy: development'
  )
  assertCalledWith(
    infoMock,
    `🧮 detected parameters in command: ${COLORS.highlight}"something1 something2 something3"`
  )
  assertCalledWith(setOutputMock, 'params', 'something1 something2 something3')
})

test('checks the comment body and finds an explicit environment target and an explicit sha (sha1) for development with params on a noop command', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest(
        '.noop 82c238c277ca3df56fe9418a5913d9188eafe3bc development | something1 something2 something3'
      )
    ),
    {
      environment: 'development',
      environmentUrl: null,
      environmentObj: {
        target: 'development',
        noop: true,
        stable_branch_used: false,
        params: 'something1 something2 something3',
        parsed_params: {_: ['something1', 'something2', 'something3']},
        sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc'
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for noop trigger: development'
  )
  assertCalledWith(
    infoMock,
    `🧮 detected parameters in command: ${COLORS.highlight}"something1 something2 something3"`
  )
  assertCalledWith(setOutputMock, 'params', 'something1 something2 something3')
})

test('checks the comment body and finds an explicit environment target and an explicit sha (sha1) for development with parsed params style params on a noop command', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest(
        '.noop 82c238c277ca3df56fe9418a5913d9188eafe3bc development | --cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
      )
    ),
    {
      environment: 'development',
      environmentUrl: null,
      environmentObj: {
        target: 'development',
        noop: true,
        stable_branch_used: false,
        params:
          '--cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue',
        parsed_params: {
          _: [],
          cpu: 2,
          memory: '4G',
          env: 'development',
          port: 8080,
          name: 'my-app',
          q: 'my-queue'
        },
        sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc'
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for noop trigger: development'
  )
  assertCalledWith(
    infoMock,
    `🧮 detected parameters in command: ${COLORS.highlight}"--cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue"`
  )
  assertCalledWith(
    setOutputMock,
    'params',
    '--cpu=2 --memory=4G --env=development --port=8080 --name=my-app -q my-queue'
  )
})

test('checks the comment body and finds an explicit environment target and an explicit sha (sha1) for development with params on a noop command and the sha is a sha256 hash (64 characters)', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest(
        '.noop f0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b development | something1 something2 something3'
      )
    ),
    {
      environment: 'development',
      environmentUrl: null,
      environmentObj: {
        target: 'development',
        noop: true,
        stable_branch_used: false,
        params: 'something1 something2 something3',
        parsed_params: {_: ['something1', 'something2', 'something3']},
        sha: 'f0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b'
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for noop trigger: development'
  )
  assertCalledWith(
    infoMock,
    `🧮 detected parameters in command: ${COLORS.highlight}"something1 something2 something3"`
  )
  assertCalledWith(setOutputMock, 'params', 'something1 something2 something3')
})

test('checks the comment body and finds an explicit environment target and an explicit sha (sha1) on a noop command with trailing whitespace', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest('.noop 82c238c277ca3df56fe9418a5913d9188eafe3bc       ')
    ),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        noop: true,
        stable_branch_used: false,
        params: null,
        parsed_params: null,
        sha: '82c238c277ca3df56fe9418a5913d9188eafe3bc'
      }
    }
  )

  assertCalledWith(debugMock, 'no parameters detected in command')
  assertCalledWith(debugMock, 'using default environment for noop trigger')
})

test('checks the comment body and finds an explicit environment target for development to stable_branch with params and a custom separator', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest(
        '.deploy main development + something1 | something2 something3',
        {paramSeparator: '+'}
      )
    ),
    {
      environment: 'development',
      environmentUrl: null,
      environmentObj: {
        target: 'development',
        noop: false,
        stable_branch_used: true,
        params: 'something1 | something2 something3',
        parsed_params: {_: ['something1', '|', 'something2', 'something3']},
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for stable branch deploy: development'
  )
  assertCalledWith(
    infoMock,
    `🧮 detected parameters in command: ${COLORS.highlight}"something1 | something2 something3"`
  )
  assertCalledWith(
    setOutputMock,
    'params',
    'something1 | something2 something3'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.noop staging')),
    {
      environment: 'staging',
      environmentUrl: null,
      environmentObj: {
        target: 'staging',
        noop: true,
        stable_branch_used: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for noop trigger: staging'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with the stable branch', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.noop main staging')),
    {
      environment: 'staging',
      environmentUrl: null,
      environmentObj: {
        target: 'staging',
        noop: true,
        stable_branch_used: true,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for stable branch noop trigger: staging'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with environment_urls set', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest('.noop staging', {environmentUrls})
    ),
    {
      environment: 'staging',
      environmentUrl: 'http://staging.example.com',
      environmentObj: {
        target: 'staging',
        noop: true,
        stable_branch_used: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    infoMock,
    `🔗 environment url detected: ${COLORS.highlight}http://staging.example.com`
  )
  assertCalledWith(
    debugMock,
    'found environment target for noop trigger: staging'
  )
  assertCalledWith(
    saveStateMock,
    'environment_url',
    'http://staging.example.com'
  )
  assertCalledWith(saveStateMock, 'params', '')
  assertCalledWith(saveStateMock, 'parsed_params', '')
  assertCalledWith(
    setOutputMock,
    'environment_url',
    'http://staging.example.com'
  )
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with environment_urls set and using the stable branch with "to" - and params!', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest(
        '.noop main to staging | something1 something2 something3',
        {environmentUrls}
      )
    ),
    {
      environment: 'staging',
      environmentUrl: 'http://staging.example.com',
      environmentObj: {
        target: 'staging',
        noop: true,
        stable_branch_used: true,
        params: 'something1 something2 something3',
        parsed_params: {_: ['something1', 'something2', 'something3']},
        sha: null
      }
    }
  )

  assertCalledWith(
    infoMock,
    `🔗 environment url detected: ${COLORS.highlight}http://staging.example.com`
  )
  assertCalledWith(
    debugMock,
    `found environment target for stable branch noop trigger (with 'to'): staging`
  )
  assertCalledWith(
    saveStateMock,
    'environment_url',
    'http://staging.example.com'
  )
  assertCalledWith(saveStateMock, 'params', 'something1 something2 something3')
  assertCalledWith(saveStateMock, 'parsed_params', {
    _: ['something1', 'something2', 'something3']
  })

  assertCalledWith(
    setOutputMock,
    'environment_url',
    'http://staging.example.com'
  )
})

test('checks the comment body and uses the default production environment target with environment_urls set', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.deploy', {environmentUrls})),
    {
      environment: 'production',
      environmentUrl: 'https://example.com',
      environmentObj: {
        target: 'production',
        noop: false,
        stable_branch_used: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    infoMock,
    `🔗 environment url detected: ${COLORS.highlight}https://example.com`
  )
  assertCalledWith(debugMock, 'using default environment for branch deployment')
  assertCalledWith(saveStateMock, 'environment_url', 'https://example.com')
  assertCalledWith(setOutputMock, 'environment_url', 'https://example.com')
})

test('checks the comment body and finds an explicit environment target for a production deploy with environment_urls set but no valid url', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest('.deploy production', {
        environmentUrls:
          'evil-production|example.com,development|dev.example.com,staging|'
      })
    ),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        noop: false,
        params: null,
        parsed_params: null,
        stable_branch_used: false,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for branch deploy: production'
  )
  assertCalledWith(
    warningMock,
    "no valid environment URL found for environment: production - setting environment URL to 'null' - please check your 'environment_urls' input"
  )
  assertCalledWith(saveStateMock, 'environment_url', 'null')
  assertCalledWith(setOutputMock, 'environment_url', 'null')
})

test('checks the comment body and finds an explicit environment target for a production deploy with environment_urls set but a url with a non-http(s) schema is provided', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest('.deploy production', {
        environmentUrls:
          'production|example.com,development|dev.example.com,staging|'
      })
    ),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        stable_branch_used: false,
        noop: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for branch deploy: production'
  )
  assertCalledWith(
    warningMock,
    'environment url does not match http(s) schema: example.com'
  )
  assertCalledWith(
    warningMock,
    "no valid environment URL found for environment: production - setting environment URL to 'null' - please check your 'environment_urls' input"
  )
  assertCalledWith(saveStateMock, 'environment_url', 'null')
  assertCalledWith(setOutputMock, 'environment_url', 'null')
})

test('preserves the legacy error for an environment target without a URL separator', async () => {
  await assert.rejects(
    environmentTargets(
      deploymentRequest('.deploy production', {
        environmentUrls: 'production'
      })
    ),
    TypeError
  )
})

test('checks the comment body and finds an explicit environment target for a production deploy with environment_urls set but the environment url for the given environment is disabled', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      deploymentRequest('.deploy production', {
        environmentUrls:
          'production|disabled,development|dev.example.com,staging|'
      })
    ),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        stable_branch_used: false,
        noop: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for branch deploy: production'
  )
  assertCalledWith(
    infoMock,
    `💡 environment url for ${COLORS.highlight}production${COLORS.reset} is explicitly disabled`
  )
  assertCalledWith(saveStateMock, 'environment_url', 'null')
  assertCalledWith(setOutputMock, 'environment_url', 'null')
})

test('checks the comment body and finds an explicit environment target for staging on a noop deploy with "to"', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.noop to staging')),
    {
      environment: 'staging',
      environmentUrl: null,
      environmentObj: {
        target: 'staging',
        stable_branch_used: false,
        noop: true,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    "found environment target for noop trigger (with 'to'): staging"
  )
})

test('checks the comment body and finds a noop deploy to the stable branch and default environment', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.noop main')),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        stable_branch_used: true,
        noop: true,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'using default environment for stable branch noop trigger'
  )
})

test('checks the comment body and finds a noop deploy to the stable branch and default environment with params', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.noop main | foo=bar')),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        stable_branch_used: true,
        noop: true,
        params: 'foo=bar',
        parsed_params: {_: ['foo=bar']},
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'using default environment for stable branch noop trigger'
  )
})

test('checks the comment body and finds an explicit environment target for production on a branch deploy with "to"', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.deploy to production')),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        stable_branch_used: false,
        noop: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    "found environment target for branch deploy (with 'to'): production"
  )
})

test('checks the comment body on a noop deploy and does not find an explicit environment target', async () => {
  assert.deepStrictEqual(await environmentTargets(deploymentRequest('.noop')), {
    environment: 'production',
    environmentUrl: null,
    environmentObj: {
      target: 'production',
      stable_branch_used: false,
      noop: true,
      params: null,
      parsed_params: null,
      sha: null
    }
  })

  assertCalledWith(debugMock, 'using default environment for noop trigger')
})

test('checks the comment body on a deployment and does not find any matching environment target (fails)', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.deploy to chaos')),
    {
      environment: false,
      environmentUrl: null,
      environmentObj: {
        noop: null,
        params: null,
        parsed_params: null,
        stable_branch_used: null,
        target: false,
        sha: null
      }
    }
  )

  const msg = dedent(`
  No matching environment target found. Please check your command and try again. You can read more about environment targets in the README of this Action.

  > The following environment targets are available: \`production,development,staging\`
  `)

  assertCalledWith(warningMock, msg)
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('checks the comment body on a stable branch deployment and finds a matching environment (with to)', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.deploy main to production')),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        stable_branch_used: true,
        noop: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    "found environment target for stable branch deploy (with 'to'): production"
  )
})

test('checks the comment body on a stable branch deployment and finds a matching environment (without to)', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.deploy main production')),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        stable_branch_used: true,
        noop: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'found environment target for stable branch deploy: production'
  )
})

test('checks the comment body on a stable branch deployment and uses the default environment', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.deploy main')),
    {
      environment: 'production',
      environmentUrl: null,
      environmentObj: {
        target: 'production',
        stable_branch_used: true,
        noop: false,
        params: null,
        parsed_params: null,
        sha: null
      }
    }
  )

  assertCalledWith(
    debugMock,
    'using default environment for stable branch deployment'
  )
})

test('checks the comment body on a stable branch deployment and does not find a matching environment', async () => {
  assert.deepStrictEqual(
    await environmentTargets(deploymentRequest('.deploy main chaos')),
    {
      environment: false,
      environmentUrl: null,
      environmentObj: {
        noop: null,
        params: null,
        parsed_params: null,
        stable_branch_used: null,
        target: false,
        sha: null
      }
    }
  )

  const msg = dedent(`
  No matching environment target found. Please check your command and try again. You can read more about environment targets in the README of this Action.

  > The following environment targets are available: \`production,development,staging\`
  `)

  assertCalledWith(warningMock, msg)
  assertCalledWith(saveStateMock, 'bypass', 'true')
})

test('checks the comment body on a lock request and uses the default environment', async () => {
  assert.deepStrictEqual(await environmentTargets(lockRequest('.lock')), {
    environment: 'production',
    environmentUrl: null
  })
  assertCalledWith(debugMock, 'using default environment for lock request')
})

test('checks the comment body on a lock request with a reason and uses the default environment', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      lockRequest(
        '.lock --reason making a small change to our api because reasons'
      )
    ),
    {environment: 'production', environmentUrl: null}
  )
  assertCalledWith(debugMock, 'using default environment for lock request')
})

test('checks the comment body on a lock request with a reason and uses the explict environment with a bunch of horrible formatting', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      lockRequest(
        '.lock  production    --reason small change to mappings for risk rating - - 92*91-2408|  '
      )
    ),
    {environment: 'production', environmentUrl: null}
  )
  assertCalledWith(
    debugMock,
    'found environment target for lock request: production'
  )
})

test('checks the comment body on an unlock request and uses the default environment', async () => {
  assert.deepStrictEqual(await environmentTargets(lockRequest('.unlock')), {
    environment: 'production',
    environmentUrl: null
  })
  assertCalledWith(debugMock, 'using default environment for unlock request')
})

test('checks the comment body on an unlock request and uses the default environment (and uses --reason) even though it does not need to', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      lockRequest(
        '.unlock --reason oh wait this command does not need a reason.. oops'
      )
    ),
    {environment: 'production', environmentUrl: null}
  )
  assertCalledWith(debugMock, 'using default environment for unlock request')
})

test('checks the comment body on an unlock request and uses the development environment (and uses --reason) even though it does not need to', async () => {
  assert.deepStrictEqual(
    await environmentTargets(
      lockRequest(
        '.unlock development --reason oh wait this command does not need a reason.. oops'
      )
    ),
    {environment: 'development', environmentUrl: null}
  )
  assertCalledWith(
    debugMock,
    'found environment target for unlock request: development'
  )
})

test('checks the comment body on a lock info alias request and uses the default environment', async () => {
  assert.deepStrictEqual(await environmentTargets(lockRequest('.wcid')), {
    environment: 'production',
    environmentUrl: null
  })
  assertCalledWith(debugMock, 'using default environment for lock info request')
})

test('checks the comment body on a lock request and uses the production environment', async () => {
  assert.deepStrictEqual(
    await environmentTargets(lockRequest('.lock production')),
    {environment: 'production', environmentUrl: null}
  )
  assertCalledWith(
    debugMock,
    'found environment target for lock request: production'
  )
})

test('checks the comment body on an unlock request and uses the development environment', async () => {
  assert.deepStrictEqual(
    await environmentTargets(lockRequest('.unlock development')),
    {environment: 'development', environmentUrl: null}
  )
  assertCalledWith(
    debugMock,
    'found environment target for unlock request: development'
  )
})

test('checks the comment body on a lock info alias request and uses the development environment', async () => {
  assert.deepStrictEqual(
    await environmentTargets(lockRequest('.wcid development')),
    {environment: 'development', environmentUrl: null}
  )
  assertCalledWith(
    debugMock,
    'found environment target for lock info request: development'
  )
})

test('checks the comment body on a lock info request and uses the development environment', async () => {
  assert.deepStrictEqual(
    await environmentTargets(lockRequest('.lock --info development')),
    {environment: 'development', environmentUrl: null}
  )
  assertCalledWith(
    debugMock,
    'found environment target for lock request: development'
  )
})

test('checks the comment body on a lock info request and uses the development environment (using -d)', async () => {
  assert.deepStrictEqual(
    await environmentTargets(lockRequest('.lock -d development')),
    {environment: 'development', environmentUrl: null}
  )
  assertCalledWith(
    debugMock,
    'found environment target for lock request: development'
  )
})
