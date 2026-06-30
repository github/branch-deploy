import * as github from '@actions/github'
import {mock, test} from 'node:test'
import type {ActionInputs} from '../src/types.ts'
import {
  assertCalledWith,
  createMock,
  installModuleMock
} from './node-test-helpers.ts'
import {unsafeInvalidValue} from './unsafe-fixtures.ts'

type ActionsCore = typeof import('../src/actions-core.ts')
type InputsModule = typeof import('../src/functions/inputs.ts')
type ContextCheckModule = typeof import('../src/functions/context-check.ts')

const getStateMock = createMock<ActionsCore['getState']>(() => '')
const getInputMock = createMock<ActionsCore['getInput']>(() => 'faketoken')
const infoMock = createMock<ActionsCore['info']>()
const debugMock = createMock<ActionsCore['debug']>()
const saveStateMock = createMock<ActionsCore['saveState']>()
const getInputsMock = createMock<InputsModule['getInputs']>(() =>
  unsafeInvalidValue<ActionInputs>({
    environment: 'production',
    mergeDeployMode: false,
    unlockOnMergeMode: false
  })
)
const contextCheckMock = createMock<ContextCheckModule['contextCheck']>(
  () => false
)

installModuleMock(mock, new URL('../src/actions-core.ts', import.meta.url), {
  debug: debugMock,
  error: createMock<ActionsCore['error']>(),
  getBooleanInput: createMock<ActionsCore['getBooleanInput']>(() => false),
  getInput: getInputMock,
  getState: getStateMock,
  info: infoMock,
  saveState: saveStateMock,
  setFailed: createMock<ActionsCore['setFailed']>(),
  setOutput: createMock<ActionsCore['setOutput']>(),
  warning: createMock<ActionsCore['warning']>()
})
installModuleMock(
  mock,
  new URL('../src/functions/inputs.ts', import.meta.url),
  {
    getInputs: getInputsMock
  }
)
installModuleMock(
  mock,
  new URL('../src/functions/context-check.ts', import.meta.url),
  {contextCheck: contextCheckMock}
)

github.context.actor = 'monalisa'
github.context.payload = {
  issue: {number: 1},
  comment: {
    body: '.deploy',
    created_at: '2025-01-01T00:00:00Z',
    html_url: 'https://github.com/corp/test/pull/1#issuecomment-1',
    id: 1,
    updated_at: '2025-01-01T00:00:00Z',
    user: {login: 'monalisa'}
  }
}

const originalCi = process.env['CI']
const originalRepository = process.env['GITHUB_REPOSITORY']
const originalSentinel = process.env['BRANCH_DEPLOY_VITEST_TEST']
try {
  process.env['CI'] = 'true'
  process.env['GITHUB_REPOSITORY'] = 'corp/test'
  process.env['BRANCH_DEPLOY_VITEST_TEST'] = 'false'
  await import('../src/main.ts')
} finally {
  if (originalCi === undefined) delete process.env['CI']
  else process.env['CI'] = originalCi
  if (originalRepository === undefined) delete process.env['GITHUB_REPOSITORY']
  else process.env['GITHUB_REPOSITORY'] = originalRepository
  if (originalSentinel === undefined) {
    delete process.env['BRANCH_DEPLOY_VITEST_TEST']
  } else {
    process.env['BRANCH_DEPLOY_VITEST_TEST'] = originalSentinel
  }
}

test('import dispatches the normal action outside the test sentinel', () => {
  assertCalledWith(saveStateMock, 'isPost', 'true')
  assertCalledWith(saveStateMock, 'actionsToken', 'faketoken')
  assertCalledWith(saveStateMock, 'bypass', 'true')
})
