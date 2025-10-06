import {constructValidBranchName} from '../../src/functions/valid-branch-name.js'
import {vi, expect, describe, test, beforeEach, afterEach} from 'vitest'
import * as core from '@actions/core'

const debugMock = vi.spyOn(core, 'debug')

const branchName = 'production'

beforeEach(() => {
  vi.clearAllMocks()
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
