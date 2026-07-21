import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {relative, resolve} from 'node:path'
import {test} from 'node:test'
import {load} from 'js-yaml'
import {
  ACTION_INPUT_KEYS,
  ACTION_OUTPUT_KEYS,
  ACTION_STATE_KEYS,
  BOOLEAN_ACTION_INPUT_KEYS,
  INTEGER_ACTION_INPUT_KEYS,
  type ActionInputKey
} from '../src/action-io.ts'
import {
  CHECKS_MODE_VALUES,
  LITERAL_ACTION_INPUT_KEYS,
  LITERAL_ACTION_INPUT_VALUES,
  OUTDATED_MODE_VALUES,
  UPDATE_BRANCH_VALUES
} from '../src/functions/inputs.ts'

interface InputContract {
  readonly default: string
  readonly required: boolean
}

const expectedInputContract = {
  github_token: {default: '${{ github.token }}', required: true},
  status: {default: '${{ job.status }}', required: true},
  environment: {default: 'production', required: false},
  environment_targets: {
    default: 'production,development,staging',
    required: false
  },
  draft_permitted_targets: {default: '', required: false},
  environment_urls: {default: '', required: false},
  environment_url_in_comment: {default: 'true', required: false},
  production_environments: {default: 'production', required: false},
  reaction: {default: 'eyes', required: false},
  trigger: {default: '.deploy', required: false},
  noop_trigger: {default: '.noop', required: false},
  lock_trigger: {default: '.lock', required: false},
  unlock_trigger: {default: '.unlock', required: false},
  help_trigger: {default: '.help', required: false},
  lock_info_alias: {default: '.wcid', required: false},
  permissions: {default: 'write,admin', required: true},
  commit_verification: {default: 'false', required: false},
  param_separator: {default: '|', required: false},
  global_lock_flag: {default: '--global', required: false},
  stable_branch: {default: 'main', required: false},
  update_branch: {default: 'warn', required: false},
  outdated_mode: {default: 'strict', required: false},
  required_contexts: {default: 'false', required: false},
  skip_ci: {default: '', required: false},
  checks: {default: 'all', required: false},
  ignored_checks: {default: '', required: false},
  skip_reviews: {default: '', required: false},
  allow_forks: {default: 'false', required: false},
  admins: {default: 'false', required: false},
  admins_pat: {default: 'false', required: false},
  merge_deploy_mode: {default: 'false', required: false},
  unlock_on_merge_mode: {default: 'false', required: false},
  skip_completing: {default: 'false', required: false},
  deploy_message_path: {
    default: '.github/deployment_message.md',
    required: false
  },
  sticky_locks: {default: 'false', required: false},
  sticky_locks_for_noop: {default: 'false', required: false},
  disable_lock: {default: 'false', required: false},
  allow_sha_deployments: {default: 'false', required: false},
  disable_naked_commands: {default: 'false', required: false},
  successful_deploy_labels: {default: '', required: false},
  successful_noop_labels: {default: '', required: false},
  failed_deploy_labels: {default: '', required: false},
  failed_noop_labels: {default: '', required: false},
  skip_successful_noop_labels_if_approved: {
    default: 'false',
    required: false
  },
  skip_successful_deploy_labels_if_approved: {
    default: 'false',
    required: false
  },
  enforced_deployment_order: {default: '', required: false},
  use_security_warnings: {default: 'true', required: false},
  allow_non_default_target_branch_deployments: {
    default: 'false',
    required: false
  },
  deployment_confirmation: {default: 'false', required: false},
  deployment_confirmation_timeout: {default: '60', required: false}
} as const satisfies Record<string, InputContract>

const expectedBooleanInputKeys = [
  'environment_url_in_comment',
  'commit_verification',
  'allow_forks',
  'merge_deploy_mode',
  'unlock_on_merge_mode',
  'skip_completing',
  'sticky_locks',
  'sticky_locks_for_noop',
  'disable_lock',
  'allow_sha_deployments',
  'disable_naked_commands',
  'skip_successful_noop_labels_if_approved',
  'skip_successful_deploy_labels_if_approved',
  'use_security_warnings',
  'allow_non_default_target_branch_deployments',
  'deployment_confirmation'
] as const satisfies readonly ActionInputKey[]

const expectedIntegerInputKeys = [
  'deployment_confirmation_timeout'
] as const satisfies readonly ActionInputKey[]

const expectedLiteralInputKeys = [
  'update_branch',
  'outdated_mode',
  'checks'
] as const satisfies readonly ActionInputKey[]

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function actionMetadata(): Record<string, unknown> {
  return requireRecord(load(readFileSync('action.yml', 'utf8')), 'action.yml')
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
  })
}

function calledKeys(pattern: RegExp): Set<string> {
  const keys = new Set<string>()
  for (const path of sourceFiles(resolve('src'))) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(pattern)) {
      const key = match.groups?.['key']
      if (key !== undefined) keys.add(key)
    }
  }
  return keys
}

test('action input and output registries exactly match action.yml', () => {
  const metadata = actionMetadata()
  const inputs = requireRecord(metadata['inputs'], 'action.yml inputs')
  const outputs = requireRecord(metadata['outputs'], 'action.yml outputs')

  assert.deepStrictEqual(
    [...ACTION_INPUT_KEYS].sort(),
    Object.keys(inputs).sort()
  )
  assert.deepStrictEqual(
    [...ACTION_OUTPUT_KEYS].sort(),
    Object.keys(outputs).sort()
  )
  assert.strictEqual(ACTION_INPUT_KEYS.length, 50)
  assert.strictEqual(ACTION_OUTPUT_KEYS.length, 41)
})

test('action input defaults, required flags, and accepted literals stay fixed', () => {
  const inputs = requireRecord(actionMetadata()['inputs'], 'action.yml inputs')
  const inputContract = Object.fromEntries(
    Object.entries(inputs).map(([name, input]) => {
      const definition = requireRecord(input, `input ${name}`)
      return [
        name,
        {default: definition['default'], required: definition['required']}
      ]
    })
  )

  assert.deepStrictEqual(inputContract, expectedInputContract)
  assert.deepStrictEqual(UPDATE_BRANCH_VALUES, ['disabled', 'warn', 'force'])
  assert.deepStrictEqual(OUTDATED_MODE_VALUES, [
    'pr_base',
    'default_branch',
    'strict'
  ])
  assert.deepStrictEqual(CHECKS_MODE_VALUES, ['all', 'required'])
})

test('typed input registries stay complete and exact', () => {
  assert.deepStrictEqual(BOOLEAN_ACTION_INPUT_KEYS, expectedBooleanInputKeys)
  assert.strictEqual(BOOLEAN_ACTION_INPUT_KEYS.length, 16)
  assert.deepStrictEqual(INTEGER_ACTION_INPUT_KEYS, expectedIntegerInputKeys)
  assert.deepStrictEqual(LITERAL_ACTION_INPUT_KEYS, expectedLiteralInputKeys)
  assert.deepStrictEqual(LITERAL_ACTION_INPUT_VALUES, {
    update_branch: ['disabled', 'warn', 'force'],
    outdated_mode: ['pr_base', 'default_branch', 'strict'],
    checks: ['all', 'required']
  })

  const registeredInputs: ReadonlySet<string> = new Set(ACTION_INPUT_KEYS)
  for (const key of [
    ...BOOLEAN_ACTION_INPUT_KEYS,
    ...INTEGER_ACTION_INPUT_KEYS,
    ...LITERAL_ACTION_INPUT_KEYS
  ]) {
    assert.strictEqual(registeredInputs.has(key), true)
  }
})

test('runner entrypoints remain the Node 24 committed ESM bundle', () => {
  const runs = requireRecord(actionMetadata()['runs'], 'action.yml runs')
  assert.deepStrictEqual(
    {using: runs['using'], main: runs['main'], post: runs['post']},
    {
      using: 'node24',
      main: 'dist/index.js',
      post: 'dist/index.js'
    }
  )
})

test('the committed distribution stays an exact ESM package', () => {
  const distribution = readdirSync('dist', {withFileTypes: true})
  assert.deepStrictEqual(distribution.map(entry => entry.name).sort(), [
    'index.js',
    'index.js.map',
    'licenses.txt',
    'package.json',
    'sourcemap-register.cjs',
    'sourcemap-register.js'
  ])
  assert.strictEqual(
    distribution.every(entry => entry.isFile()),
    true
  )

  const packageMetadata: unknown = JSON.parse(
    readFileSync('dist/package.json', 'utf8')
  )
  assert.deepStrictEqual(packageMetadata, {type: 'module'})
  assert.match(
    readFileSync('dist/index.js', 'utf8'),
    /^import ['"]\.\/sourcemap-register\.cjs['"];?/u
  )
})

test('raw action input, output, and state calls stay inside action-io', () => {
  const rawCalls = sourceFiles(resolve('src'))
    .filter(path => relative(resolve('src'), path) !== 'action-io.ts')
    .flatMap(path => {
      const source = readFileSync(path, 'utf8')
      const matches = [
        ...source.matchAll(
          /\bcore\.(?:getInput|getBooleanInput|setOutput|saveState|getState)\s*\(/gu
        )
      ]
      return matches.map(
        match => `${relative(process.cwd(), path)}:${String(match.index)}`
      )
    })

  assert.deepStrictEqual(rawCalls, [])
})

test('declared outputs and written outputs are exactly equal', () => {
  const writtenOutputs = calledKeys(
    /\bsetActionOutput\(\s*['"](?<key>[^'"]+)['"]/g
  )
  assert.deepStrictEqual(
    [...writtenOutputs].sort(),
    [...ACTION_OUTPUT_KEYS].sort()
  )
})

test('all post state has a producer and only initial_comment_id is write-only', () => {
  const producedState = calledKeys(
    /\bsaveActionState\(\s*['"](?<key>[^'"]+)['"]/g
  )
  const consumedState = calledKeys(
    /\bgetActionState\(\s*['"](?<key>[^'"]+)['"]/g
  )
  const registeredState: ReadonlySet<string> = new Set(ACTION_STATE_KEYS)

  assert.deepStrictEqual(
    [...consumedState].filter(key => !producedState.has(key)),
    []
  )
  assert.deepStrictEqual(
    [...producedState].sort(),
    [...ACTION_STATE_KEYS].sort()
  )
  assert.deepStrictEqual(
    [...producedState].filter(key => !registeredState.has(key)),
    []
  )
  assert.deepStrictEqual(
    [...consumedState].filter(key => !registeredState.has(key)),
    []
  )
  assert.deepStrictEqual(
    [...producedState].filter(key => !consumedState.has(key)),
    ['initial_comment_id']
  )
})
