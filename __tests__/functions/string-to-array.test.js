import {stringToArray} from '../../src/functions/string-to-array.js'
import {vi,expect,test,beforeEach} from 'vitest'
import * as core from '@actions/core'

const debugMock = vi.spyOn(core, 'debug')
const errorMock = vi.spyOn(core, 'error')

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

test('throws an error when string processing fails', async () => {
  // Pass a non-string value to trigger the error
  expect(() => stringToArray(null)).toThrow('could not convert String to Array')
  expect(errorMock).toHaveBeenCalled()
})
