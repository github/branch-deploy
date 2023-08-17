import {triggerCheck} from '../../src/functions/trigger-check'
import * as core from '@actions/core'
import {COLORS} from '../../src/functions/colors'

const color = COLORS.highlight
const infoMock = jest.spyOn(core, 'info')
const debugMock = jest.spyOn(core, 'debug')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

test('checks a message and finds a standard trigger', async () => {
  const body = '.deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(true)
  expect(infoMock).toHaveBeenCalledWith(
    `✅ comment body starts with trigger: ${color}.deploy`
  )
})

test('checks a message and does not find trigger', async () => {
  const body = '.bad'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
  expect(debugMock).toHaveBeenCalledWith(
    `comment body does not start with trigger: ${color}.deploy`
  )
})

test('checks a message and finds a global trigger', async () => {
  const body = 'I want to .deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
})

test('checks a message and finds a trigger with an environment and a variable', async () => {
  const trigger = '.deploy'
  expect(await triggerCheck('.deploy dev something', trigger)).toBe(true)
  expect(await triggerCheck('.deploy something', trigger)).toBe(true)
  expect(await triggerCheck('.deploy dev something', trigger)).toBe(true)
  expect(await triggerCheck('.deploy dev something', trigger)).toBe(true)
})

test('checks a message and does not find global trigger', async () => {
  const body = 'I want to .ping a website'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
  expect(debugMock).toHaveBeenCalledWith(
    `comment body does not start with trigger: ${color}.deploy`
  )
})
