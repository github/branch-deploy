import {checkInput} from '../../src/functions/check-input.ts'
import {expect, test} from 'vitest'

test('checks an input an finds that it is valid', () => {
  expect(checkInput('production')).toStrictEqual('production')
})

test('checks an input an finds that it is valid with true/false strings', () => {
  expect(checkInput('true')).toStrictEqual('true')

  expect(checkInput('false')).toStrictEqual('false')
})

test('checks an empty string input an finds that it is invalid', () => {
  expect(checkInput('')).toStrictEqual(null)
})

test('checks a null object input an finds that it is invalid', () => {
  expect(checkInput(null)).toStrictEqual(null)
})

test('checks a string of null input an finds that it is invalid', () => {
  expect(checkInput('null')).toStrictEqual(null)
})
