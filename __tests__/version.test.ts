import assert from 'node:assert/strict'
import {test} from 'node:test'
import {VERSION} from '../src/version.ts'

const versionRegex = /^v(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/

test('VERSION constant should match the version pattern', () => {
  assert.match(VERSION, versionRegex)
})

test('should validate v1.0.0', () => {
  const version = 'v1.0.0'
  assert.match(version, versionRegex)
})

test('should validate v4.5.1', () => {
  const version = 'v4.5.1'
  assert.match(version, versionRegex)
})

test('should validate v10.123.44', () => {
  const version = 'v10.123.44'
  assert.match(version, versionRegex)
})

test('should validate v1.1.1-rc.1', () => {
  const version = 'v1.1.1-rc.1'
  assert.match(version, versionRegex)
})

test('should validate v15.19.4-rc.35', () => {
  const version = 'v15.19.4-rc.35'
  assert.match(version, versionRegex)
})
