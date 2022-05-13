import {triggerCheck} from '../../src/functions/trigger-check'

test('checks a message and finds a prefix trigger', async () => {
  const prefixOnly = true
  const body = '.deploy'
  const trigger = '.deploy'
  expect(await triggerCheck(prefixOnly, body, trigger)).toBe(true)
})
