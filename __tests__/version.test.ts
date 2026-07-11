import assert from 'node:assert/strict'
import {test} from 'node:test'
import {VERSION} from '../src/version.ts'

const stableVersionRegex = /^v\d+\.\d+\.\d+$/

test('VERSION constant should match the stable version pattern', () => {
  assert.match(VERSION, stableVersionRegex)
})

for (const version of ['v1.0.0', 'v4.5.1', 'v10.123.44']) {
  test(`should validate stable version ${version}`, () => {
    assert.match(version, stableVersionRegex)
  })
}

for (const version of [
  'v1.1.1-rc.1',
  'v15.19.4-rc.35',
  'v1.2.3-beta.1',
  'v1.2',
  '1.2.3',
  'v1.two.3'
]) {
  test(`should reject non-stable version ${version}`, () => {
    assert.doesNotMatch(version, stableVersionRegex)
  })
}
