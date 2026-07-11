import assert from 'node:assert/strict'
import {test} from 'node:test'
import {analyzeIssueCommand} from '../../src/functions/issue-command.ts'

const config = {
  globalFlag: '--global',
  helpTrigger: '.help',
  lockInfoAlias: '.wcid',
  lockTrigger: '.lock',
  noopTrigger: '.noop',
  paramSeparator: '|',
  trigger: '.deploy',
  unlockTrigger: '.unlock'
} as const

test('classifies every supported IssueOps command', () => {
  assert.deepStrictEqual(
    [
      '.deploy',
      '.noop',
      '.lock',
      '.lock --details',
      '.unlock',
      '.help',
      '.wcid',
      '.unknown'
    ].map(body => {
      const result = analyzeIssueCommand(body, config)
      return [result.operation, result.outputType, result.dispatch]
    }),
    [
      ['deploy', 'deploy', 'deployment'],
      ['noop', 'deploy', 'deployment'],
      ['lock', 'lock', 'lock'],
      ['lock_info', 'lock', 'lock_info'],
      ['unlock', 'unlock', 'unlock'],
      ['help', 'help', 'help'],
      ['lock_info', 'lock-info-alias', 'lock_info'],
      ['none', null, 'none']
    ]
  )
})

test('preserves overlapping trigger classification and dispatch precedence', () => {
  const overlap = {
    ...config,
    helpTrigger: '.x',
    lockInfoAlias: '.x',
    lockTrigger: '.x',
    noopTrigger: '.x',
    trigger: '.x',
    unlockTrigger: '.x'
  }
  const result = analyzeIssueCommand('.x', overlap)

  assert.deepStrictEqual(result.matches, {
    deploy: true,
    help: true,
    lock: true,
    lockInfoAlias: true,
    noop: true,
    unlock: true
  })
  assert.strictEqual(result.operation, 'noop')
  assert.strictEqual(result.outputType, 'deploy')
  assert.strictEqual(result.dispatch, 'help')
})

test('preserves permissive lock-info substring matching', () => {
  const result = analyzeIssueCommand('.lock --detailsXYZ', config)
  assert.strictEqual(result.hasLockInfoFlag, true)
  assert.strictEqual(result.operation, 'lock_info')
  assert.strictEqual(result.dispatch, 'lock_info')
})

test('normalizes legacy naked-command modifiers and parameters', () => {
  const result = analyzeIssueCommand(
    '.lock --details --reason because | key=value',
    config
  )
  assert.deepStrictEqual(result.naked, {
    body: '.lock',
    globalBypass: false,
    isNaked: true,
    params: ''
  })
})

test('preserves global substring bypass and empty-global behavior', () => {
  assert.strictEqual(
    analyzeIssueCommand('.lock --globalish', config).naked.globalBypass,
    true
  )
  assert.strictEqual(
    analyzeIssueCommand('.deploy', {...config, globalFlag: ''}).naked
      .globalBypass,
    true
  )
})

test('requires trigger boundaries while preserving prefix overlap', () => {
  assert.strictEqual(
    analyzeIssueCommand('.deploy-two', config).dispatch,
    'none'
  )
  const overlap = analyzeIssueCommand('.ship now', {
    ...config,
    noopTrigger: '.ship now',
    trigger: '.ship'
  })
  assert.strictEqual(overlap.matches.deploy, true)
  assert.strictEqual(overlap.matches.noop, true)
  assert.strictEqual(overlap.operation, 'noop')
})
