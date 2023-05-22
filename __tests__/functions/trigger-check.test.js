import {triggerCheck} from '../../src/functions/trigger-check'
import * as core from '@actions/core'

const setOutputMock = jest.spyOn(core, 'setOutput')
const debugMock = jest.spyOn(core, 'debug')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

test('checks a message and finds a prefix trigger', async () => {
  const prefixOnly = true
  const body = '.deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
})

test('checks a message and does not find prefix trigger', async () => {
  const prefixOnly = true
  const body = '.bad'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(false)
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.bad')
  expect(debugMock).toHaveBeenCalledWith(
    'Trigger ".deploy" not found as comment prefix'
  )
})

test('checks a message and finds a global trigger', async () => {
  const prefixOnly = false
  const body = 'I want to .deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    'I want to .deploy'
  )
})

test('checks a message and finds a global trigger with an environment', async () => {
  const prefixOnly = false
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, 'something .deploy dev', trigger)).toBe(
    true
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    'something .deploy dev'
  )

  expect(await triggerCheck(prefixOnly, 'something .deploy', trigger)).toBe(
    true
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    'something .deploy'
  )

  expect(await triggerCheck(prefixOnly, '.deploy dev something', trigger)).toBe(
    true
  )
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.deploy dev something'
  )

  expect(
    await triggerCheck(prefixOnly, 'something .deploy dev something', trigger)
  ).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    'something .deploy dev something'
  )
})

test('checks a message and does not find global trigger', async () => {
  const prefixOnly = false
  const body = 'I want to .ping a website'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(false)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    'I want to .ping a website'
  )
  expect(debugMock).toHaveBeenCalledWith(
    'Trigger ".deploy" not found in the comment body'
  )
})
