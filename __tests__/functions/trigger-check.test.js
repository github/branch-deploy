import {triggerCheck} from '../../src/functions/trigger-check'

test('checks a message and finds a prefix trigger', async () => {
  const prefixOnly = true
  const body = '.deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(true)
})

test('checks a message and does not find prefix trigger', async () => {
  const prefixOnly = true
  const body = '.bad'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(false)
})

test('checks a message and finds a global trigger', async () => {
  const prefixOnly = false
  const body = 'I want to .deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(true)
})

test('checks a message and does not find global trigger', async () => {
  const prefixOnly = false
  const body = 'I want to .ping a website'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(false)
})
