import {checkInput} from '../../src/functions/check-input'

test('checks an input an finds that it is valid', async () => {
  expect(await checkInput('production')).toStrictEqual('production')
})

test('checks an input an finds that it is valid with true/false strings', async () => {
  expect(await checkInput('true')).toStrictEqual('true')

  expect(await checkInput('false')).toStrictEqual('false')
})

test('checks an empty string input an finds that it is invalid', async () => {
  expect(await checkInput('')).toStrictEqual(null)
})

test('checks a null object input an finds that it is invalid', async () => {
  expect(await checkInput(null)).toStrictEqual(null)
})

test('checks a string of null input an finds that it is invalid', async () => {
  expect(await checkInput('null')).toStrictEqual(null)
})
