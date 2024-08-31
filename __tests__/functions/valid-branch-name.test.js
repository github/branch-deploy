import {constructValidBranchName} from '../../src/functions/valid-branch-name'
import * as core from '@actions/core'

const debugMock = jest.spyOn(core, 'debug')

const branchName = 'production'

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

test('does not make any modifications to a valid branch name', async () => {
  expect(constructValidBranchName(branchName)).toBe(branchName)
  expect(debugMock).toHaveBeenCalledWith(
    `constructing valid branch name: ${branchName}`
  )
  expect(debugMock).toHaveBeenCalledWith(
    `constructed valid branch name: ${branchName}`
  )
})

test('replaces spaces with hyphens', async () => {
  expect(constructValidBranchName(`super ${branchName}`)).toBe(
    `super-${branchName}`
  )
  expect(debugMock).toHaveBeenCalledWith(
    `constructing valid branch name: super ${branchName}`
  )
  expect(debugMock).toHaveBeenCalledWith(
    `constructed valid branch name: super-${branchName}`
  )
})

test('replaces multiple spaces with hyphens', async () => {
  expect(constructValidBranchName(`super duper ${branchName}`)).toBe(
    `super-duper-${branchName}`
  )
  expect(debugMock).toHaveBeenCalledWith(
    `constructing valid branch name: super duper ${branchName}`
  )
  expect(debugMock).toHaveBeenCalledWith(
    `constructed valid branch name: super-duper-${branchName}`
  )
})

test('returns null if the branch is null', async () => {
  expect(constructValidBranchName(null)).toBe(null)
})

test('returns undefined if the branch is undefined', async () => {
  expect(constructValidBranchName(undefined)).toBe(undefined)
})
