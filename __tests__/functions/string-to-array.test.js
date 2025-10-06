import {stringToArray} from '../../src/functions/string-to-array.js'
import {vi, expect, describe, test, beforeEach, afterEach} from 'vitest'
import * as core from '@actions/core'

const debugMock = vi.spyOn(core, 'debug')

beforeEach(() => {
  vi.clearAllMocks()
})

test('successfully converts a string to an array', async () => {
  expect(stringToArray('production,staging,development')).toStrictEqual([
    'production',
    'staging',
    'development'
  ])
})

test('successfully converts a single string item string to an array', async () => {
  expect(stringToArray('production,')).toStrictEqual(['production'])

  expect(stringToArray('production')).toStrictEqual(['production'])
})

test('successfully converts an empty string to an empty array', async () => {
  expect(stringToArray('')).toStrictEqual([])

  expect(debugMock).toHaveBeenCalledWith(
    'in stringToArray(), an empty String was found so an empty Array was returned'
  )
})

test('successfully converts garbage to an empty array', async () => {
  expect(stringToArray(',,,')).toStrictEqual([])
})
