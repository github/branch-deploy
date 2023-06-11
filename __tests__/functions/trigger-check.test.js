import {triggerCheck} from '../../src/functions/trigger-check'
import * as core from '@actions/core'

const setOutputMock = jest.spyOn(core, 'setOutput')
const infoMock = jest.spyOn(core, 'info')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
})

test('checks a message and finds a standard trigger', async () => {
  const body = '.deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
})

test('checks a message and does not find trigger', async () => {
  const body = '.bad'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.bad')
  expect(infoMock).toHaveBeenCalledWith(
    'Trigger ".deploy" not found in the comment body'
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
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.deploy dev something'
  )

  expect(await triggerCheck('.deploy something', trigger)).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.deploy dev something'
  )

  expect(await triggerCheck('.deploy dev something', trigger)).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.deploy dev something'
  )

  expect(await triggerCheck('.deploy dev something', trigger)).toBe(true)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.deploy dev something'
  )
})

test('checks a message and does not find global trigger', async () => {
  const body = 'I want to .ping a website'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    'I want to .ping a website'
  )
  expect(infoMock).toHaveBeenCalledWith(
    'Trigger ".deploy" not found in the comment body'
  )
})
