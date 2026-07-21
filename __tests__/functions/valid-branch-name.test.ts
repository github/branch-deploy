import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'
import {installModuleMock} from '../node-test-helpers.ts'

type ActionsCore = typeof import('../../src/actions-core.ts')

const debugMock = mock.fn<ActionsCore['debug']>()

installModuleMock(mock, new URL('../../src/actions-core.ts', import.meta.url), {
  debug: debugMock
})

const {constructValidBranchName} =
  await import('../../src/functions/valid-branch-name.ts')

const branchName = 'production'

beforeEach(() => {
  debugMock.mock.resetCalls()
})

test('does not make any modifications to a valid branch name', () => {
  assert.strictEqual(constructValidBranchName(branchName), branchName)
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [
      [`constructing valid branch name: ${branchName}`],
      [`constructed valid branch name: ${branchName}`]
    ]
  )
})

test('replaces spaces with hyphens', () => {
  assert.strictEqual(
    constructValidBranchName(`super ${branchName}`),
    `super-${branchName}`
  )
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [
      [`constructing valid branch name: super ${branchName}`],
      [`constructed valid branch name: super-${branchName}`]
    ]
  )
})

test('replaces multiple spaces with hyphens', () => {
  assert.strictEqual(
    constructValidBranchName(`super duper ${branchName}`),
    `super-duper-${branchName}`
  )
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [
      [`constructing valid branch name: super duper ${branchName}`],
      [`constructed valid branch name: super-duper-${branchName}`]
    ]
  )
})

test('replaces tabs, line breaks, and Unicode whitespace with hyphens', () => {
  assert.strictEqual(
    constructValidBranchName('production\twest\r\nblue\u00a0green'),
    'production-west--blue-green'
  )
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [
      ['constructing valid branch name: production\twest\r\nblue\u00a0green'],
      ['constructed valid branch name: production-west--blue-green']
    ]
  )
})

test('returns null if the branch is null', () => {
  assert.strictEqual(constructValidBranchName(null), null)
})

test('returns undefined if the branch is undefined', () => {
  constructValidBranchName(undefined)
  assert.deepStrictEqual(
    debugMock.mock.calls.map(call => call.arguments),
    [['constructing valid branch name: undefined']]
  )
})
