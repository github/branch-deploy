import {mock, test} from 'node:test'
import {
  assertNotCalled,
  createMock,
  installModuleMock
} from './node-test-helpers.ts'

type ActionsCore = typeof import('../src/actions-core.ts')

const getStateMock = createMock<ActionsCore['getState']>(() => '')
const infoMock = createMock<ActionsCore['info']>()

installModuleMock(mock, new URL('../src/actions-core.ts', import.meta.url), {
  debug: createMock<ActionsCore['debug']>(),
  error: createMock<ActionsCore['error']>(),
  getBooleanInput: createMock<ActionsCore['getBooleanInput']>(() => false),
  getInput: createMock<ActionsCore['getInput']>(() => ''),
  getState: getStateMock,
  info: infoMock,
  saveState: createMock<ActionsCore['saveState']>(),
  setFailed: createMock<ActionsCore['setFailed']>(),
  setOutput: createMock<ActionsCore['setOutput']>(),
  warning: createMock<ActionsCore['warning']>()
})

const originalCi = process.env['CI']
const originalSentinel = process.env['BRANCH_DEPLOY_VITEST_TEST']
try {
  process.env['CI'] = 'true'
  process.env['BRANCH_DEPLOY_VITEST_TEST'] = 'true'
  await import('../src/main.ts')
} finally {
  if (originalCi === undefined) delete process.env['CI']
  else process.env['CI'] = originalCi
  if (originalSentinel === undefined) {
    delete process.env['BRANCH_DEPLOY_VITEST_TEST']
  } else {
    process.env['BRANCH_DEPLOY_VITEST_TEST'] = originalSentinel
  }
}

test('import bypasses normal dispatch under the test sentinel', () => {
  assertNotCalled(infoMock)
})
