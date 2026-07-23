import assert from 'node:assert/strict'
import {test} from 'node:test'
import {checkInput} from '../../src/functions/check-input.ts'

test('checks an input an finds that it is valid', () => {
  assert.strictEqual(checkInput('production'), 'production')
})

test('checks an input an finds that it is valid with true/false strings', () => {
  assert.strictEqual(checkInput('true'), 'true')

  assert.strictEqual(checkInput('false'), 'false')
})

test('checks an empty string input an finds that it is invalid', () => {
  assert.strictEqual(checkInput(''), null)
})

test('checks a null object input an finds that it is invalid', () => {
  assert.strictEqual(checkInput(null), null)
})

test('checks a string of null input an finds that it is invalid', () => {
  assert.strictEqual(checkInput('null'), null)
})
