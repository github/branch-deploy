import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {
  assertCalledWith,
  createMock,
  installModuleMock
} from './node-test-helpers.ts'

type ActionsCore = typeof import('../src/actions-core.ts')

const getInputMock = createMock<ActionsCore['getInput']>()
const getBooleanInputMock = createMock<ActionsCore['getBooleanInput']>()
const setOutputMock = createMock<ActionsCore['setOutput']>()
const saveStateMock = createMock<ActionsCore['saveState']>()
const getStateMock = createMock<ActionsCore['getState']>()

installModuleMock(mock, new URL('../src/actions-core.ts', import.meta.url), {
  getInput: getInputMock,
  getBooleanInput: getBooleanInputMock,
  setOutput: setOutputMock,
  saveState: saveStateMock,
  getState: getStateMock
})

const {
  getActionInput,
  getActionState,
  getBooleanActionInput,
  saveActionState,
  setActionOutput
} = await import('../src/action-io.ts')

beforeEach(() => {
  getInputMock.mock.resetCalls()
  getBooleanInputMock.mock.resetCalls()
  setOutputMock.mock.resetCalls()
  saveStateMock.mock.resetCalls()
  getStateMock.mock.resetCalls()
})

test('typed input wrappers preserve toolkit arguments and results', () => {
  getInputMock.mock.mockImplementation(() => 'production')
  getBooleanInputMock.mock.mockImplementation(() => true)

  assert.strictEqual(
    getActionInput('environment', {required: true}),
    'production'
  )
  assert.strictEqual(getBooleanActionInput('allow_forks'), true)
  assert.strictEqual(
    getBooleanActionInput('allow_forks', {
      required: true,
      trimWhitespace: false
    }),
    true
  )
  assertCalledWith(getInputMock, 'environment', {required: true})
  assertCalledWith(getBooleanInputMock, 'allow_forks', undefined)
  assertCalledWith(getBooleanInputMock, 'allow_forks', {
    required: true,
    trimWhitespace: false
  })
})

test('typed output and state wrappers preserve toolkit value serialization', () => {
  const structuredValue = {environment: 'production', noop: false}
  getStateMock.mock.mockImplementation(() => 'false')

  setActionOutput('parsed_params', structuredValue)
  saveActionState('noop', false)

  assertCalledWith(setOutputMock, 'parsed_params', structuredValue)
  assertCalledWith(saveStateMock, 'noop', false)
  assert.strictEqual(getActionState('noop'), 'false')
  assertCalledWith(getStateMock, 'noop')
})
