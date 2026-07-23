import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  analyzeIssueCommand,
  analyzeNakedCommand
} from '../../src/functions/issue-command.ts'

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

test('classifies custom commands and preserves repeated custom separators in parameters', () => {
  const custom = {
    ...config,
    globalFlag: '--everywhere',
    helpTrigger: '/assist',
    lockInfoAlias: '/who',
    lockTrigger: '/hold',
    noopTrigger: '/plan',
    paramSeparator: '::',
    trigger: '/ship',
    unlockTrigger: '/release'
  }

  const deployment = analyzeIssueCommand('/ship :: --tag=a::b', custom)
  assert.strictEqual(deployment.dispatch, 'deployment')
  assert.strictEqual(deployment.operation, 'deploy')
  assert.deepStrictEqual(deployment.naked, {
    body: '/ship',
    globalBypass: false,
    isNaked: true,
    params: ' --tag=a::b'
  })

  const lockInfo = analyzeIssueCommand('/hold --details :: reason', custom)
  assert.strictEqual(lockInfo.dispatch, 'lock_info')
  assert.strictEqual(lockInfo.operation, 'lock_info')
  assert.strictEqual(lockInfo.naked.body, '/hold')
})

test('accepts whitespace trigger boundaries and rejects punctuation or leading whitespace', () => {
  const custom = {...config, trigger: '/ship'}

  assert.strictEqual(
    analyzeIssueCommand('/ship\tproduction', custom).dispatch,
    'deployment'
  )
  assert.strictEqual(
    analyzeIssueCommand('/ship\nproduction', custom).dispatch,
    'deployment'
  )
  assert.strictEqual(analyzeIssueCommand('/ship-now', custom).dispatch, 'none')
  assert.strictEqual(
    analyzeIssueCommand(' /ship production', custom).dispatch,
    'none'
  )
})

test('fails closed when splitting a custom parameter suffix returns no command', context => {
  const originalSplit: (
    this: string,
    separator: string | RegExp,
    limit?: number
  ) => string[] = String.prototype.split
  context.mock.method(
    String.prototype,
    'split',
    function (this: string, separator: string | RegExp, limit?: number) {
      if (separator === ':: --flag=true') return []
      return originalSplit.call(this, separator, limit)
    }
  )

  assert.deepStrictEqual(
    analyzeNakedCommand('/ship :: --flag=true', '::', ['/ship'], '--global'),
    {body: '', globalBypass: false, isNaked: false, params: ' --flag=true'}
  )
})
