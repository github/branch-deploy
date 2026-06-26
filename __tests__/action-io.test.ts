import * as core from '@actions/core'
import {beforeEach, expect, test, vi} from 'vitest'
import {
  getActionInput,
  getActionState,
  getBooleanActionInput,
  saveActionState,
  setActionOutput
} from '../src/action-io.ts'

beforeEach(() => {
  vi.clearAllMocks()
})

test('typed input wrappers preserve toolkit arguments and results', () => {
  vi.spyOn(core, 'getInput').mockReturnValue('production')
  vi.spyOn(core, 'getBooleanInput').mockReturnValue(true)

  expect(getActionInput('environment', {required: true})).toBe('production')
  expect(getBooleanActionInput('allow_forks')).toBe(true)
  expect(core.getInput).toHaveBeenCalledWith('environment', {required: true})
  expect(core.getBooleanInput).toHaveBeenCalledWith('allow_forks', undefined)
})

test('typed output and state wrappers preserve toolkit value serialization', () => {
  const structuredValue = {environment: 'production', noop: false}
  vi.spyOn(core, 'setOutput').mockImplementation(() => undefined)
  vi.spyOn(core, 'saveState').mockImplementation(() => undefined)
  vi.spyOn(core, 'getState').mockReturnValue('false')

  setActionOutput('parsed_params', structuredValue)
  saveActionState('noop', false)

  expect(core.setOutput).toHaveBeenCalledWith('parsed_params', structuredValue)
  expect(core.saveState).toHaveBeenCalledWith('noop', false)
  expect(getActionState('noop')).toBe('false')
  expect(core.getState).toHaveBeenCalledWith('noop')
})
