import {triggerCheck} from '../../src/functions/trigger-check.js'
import {vi, expect, test, beforeEach} from 'vitest'
import * as core from '@actions/core'
import {COLORS} from '../../src/functions/colors.js'

const color = COLORS.highlight
const colorReset = COLORS.reset
const infoMock = vi.spyOn(core, 'info')
const debugMock = vi.spyOn(core, 'debug')

beforeEach(() => {
  vi.clearAllMocks()
})

test('checks a message and finds a standard trigger', async () => {
  const body = '.deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(true)
  expect(infoMock).toHaveBeenCalledWith(
    `✅ comment body starts with trigger: ${color}.deploy${colorReset}`
  )
})

test('checks a message and does not find trigger', async () => {
  const body = '.bad'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
  expect(debugMock).toHaveBeenCalledWith(
    `comment body does not start with trigger: ${color}.deploy${colorReset}`
  )
})

test('checks a message and finds a global trigger', async () => {
  const body = 'I want to .deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
  expect(debugMock).toHaveBeenCalledWith(
    `comment body does not start with trigger: ${color}.deploy${colorReset}`
  )
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
    `comment body does not start with trigger: ${color}.deploy${colorReset}`
  )
})

test('does not match when body starts with a longer command sharing prefix', async () => {
  const body = '.deploy-two to prod'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
  expect(debugMock).toHaveBeenCalledWith(
    `comment body starts with trigger but is not complete: ${color}.deploy${colorReset}`
  )
})

test('does not match when immediately followed by alphanumeric', async () => {
  const body = '.deploy1'
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(false)
  expect(debugMock).toHaveBeenCalledWith(
    `comment body starts with trigger but is not complete: ${color}.deploy${colorReset}`
  )
})

test('matches when followed by a newline (whitespace)', async () => {
  const body = `.deploy\ndev`
  const trigger = '.deploy'
  expect(await triggerCheck(body, trigger)).toBe(true)
})
