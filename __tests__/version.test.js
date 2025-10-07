import {VERSION} from '../src/version.js'
import {expect, test} from 'vitest'

const versionRegex = /^v(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/

test('VERSION constant should match the version pattern', () => {
  expect(VERSION).toMatch(versionRegex)
})

test('should validate v1.0.0', () => {
  const version = 'v1.0.0'
  expect(version).toMatch(versionRegex)
})

test('should validate v4.5.1', () => {
  const version = 'v4.5.1'
  expect(version).toMatch(versionRegex)
})

test('should validate v10.123.44', () => {
  const version = 'v10.123.44'
  expect(version).toMatch(versionRegex)
})

test('should validate v1.1.1-rc.1', () => {
  const version = 'v1.1.1-rc.1'
  expect(version).toMatch(versionRegex)
})

test('should validate v15.19.4-rc.35', () => {
  const version = 'v15.19.4-rc.35'
  expect(version).toMatch(versionRegex)
})
