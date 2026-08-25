import assert from 'node:assert/strict'
import {Buffer} from 'node:buffer'
import {test} from 'node:test'
import {
  completionMetadata,
  MAX_COMPLETION_CONTEXT_BYTES,
  parseCompletionContext,
  parseCompletionMetadata,
  parseJobResults,
  serializeCompletionContext,
  validateResultUrl
} from '../../src/functions/result-context.ts'
import type {CompletionContext, DeploymentResult} from '../../src/types.ts'
import {createCompletionContext} from '../result-mode-fixtures.ts'

test('round-trips the complete context without changing its values', () => {
  const context = createCompletionContext()
  const serialized = serializeCompletionContext(context)
  assert.ok(serialized !== null)
  assert.deepStrictEqual(parseCompletionContext(serialized), context)
})

test('keeps noop, disabled locking, empty strings, and absent optional IDs', () => {
  const context = createCompletionContext({
    noop: true,
    deployment_id: null,
    reaction_id: null,
    lock_ref_sha: null,
    disable_lock: true,
    environment_url: null,
    fork: true,
    commit_verified: false,
    approved_reviews_count: '',
    review_decision: '',
    params: '',
    parsed_params: ''
  })
  assert.deepStrictEqual(
    parseCompletionContext(JSON.stringify(context)),
    context
  )
})

test('accepts generated ISO UTC timestamps and both supported SHA lengths', () => {
  const context = createCompletionContext({
    trusted_sha: 'ABCDEF01'.repeat(8),
    sha: '1234abcd'.repeat(8),
    lock_ref_sha: 'ABCDEF01'.repeat(5),
    deployment_start_time: new Date('2024-02-29T03:04:05.123Z').toISOString()
  })
  assert.deepStrictEqual(
    parseCompletionContext(JSON.stringify(context)),
    context
  )
})

test('accepts nested arrays in parsed parameter objects', () => {
  const context = createCompletionContext({
    parsed_params: '{"_":[],"options":{"ports":[80,443],"enabled":true}}'
  })
  assert.deepStrictEqual(
    parseCompletionContext(JSON.stringify(context)),
    context
  )
})

for (const url of ['', 'http://example.com', 'legacy value']) {
  test(`does not revalidate inherited environment URL ${JSON.stringify(url)}`, () => {
    const context = createCompletionContext({environment_url: url})
    assert.deepStrictEqual(
      parseCompletionContext(JSON.stringify(context)),
      context
    )
  })
}

test('does not eagerly parse completion setting values', () => {
  const context = createCompletionContext()
  const withRawSettings = {
    ...context,
    settings: {
      ...context.settings,
      deploy_message_path: '',
      environment_url_in_comment: 'not-a-boolean',
      skip_successful_noop_labels_if_approved: '',
      skip_successful_deploy_labels_if_approved: 'future-value'
    }
  }
  const serialized = serializeCompletionContext(withRawSettings)
  assert.ok(serialized !== null)
  assert.deepStrictEqual(parseCompletionContext(serialized), withRawSettings)
})

test('serializes only the explicit context and settings fields', () => {
  const context = createCompletionContext()
  const extra = {
    ...context,
    actionsToken: 'synthetic-token-do-not-serialize',
    bypass: 'false',
    isPost: 'true',
    settings: {...context.settings, actionsToken: 'another-synthetic-token'}
  }
  const serialized = serializeCompletionContext(extra)
  assert.ok(serialized !== null)
  assert.deepStrictEqual(parseCompletionContext(serialized), context)
  assert.ok(!serialized.includes('synthetic-token'))
  assert.ok(!serialized.includes('actionsToken'))
  assert.ok(!serialized.includes('isPost'))
})

test('extracts only the metadata needed to bind the originating run', () => {
  const context = createCompletionContext()
  const metadata = completionMetadata(context)
  assert.deepStrictEqual(metadata, {
    schema_version: 1,
    repository: 'octocat/example',
    run_id: 1200,
    run_attempt: 1,
    issue_number: 7,
    trigger_comment_id: 20,
    trusted_sha: '1'.repeat(40),
    lock_ref_sha: '2'.repeat(40),
    disable_lock: false
  })
  assert.deepStrictEqual(parseCompletionMetadata(metadata), metadata)
  assert.notStrictEqual(parseCompletionMetadata(metadata), metadata)
})

test('accepts metadata records with a null prototype', () => {
  const metadata = completionMetadata(createCompletionContext())
  Object.setPrototypeOf(metadata, null)
  assert.deepStrictEqual(
    parseCompletionMetadata(metadata),
    completionMetadata(createCompletionContext())
  )
})

test('rejects metadata records with an inherited prototype', () => {
  const metadata = completionMetadata(createCompletionContext())
  Object.setPrototypeOf(metadata, {unexpected: true})
  assert.throws(
    () => parseCompletionMetadata(metadata),
    /Invalid completion metadata/u
  )
})

for (const value of [null, [], 1, true, 'context']) {
  test(`rejects a non-object context ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => parseCompletionContext(JSON.stringify(value)),
      /Invalid context/u
    )
  })
  test(`rejects non-object metadata ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => parseCompletionMetadata(value),
      /Invalid completion metadata/u
    )
  })
}

for (const field of Object.keys(createCompletionContext())) {
  test(`rejects a missing context field: ${field}`, () => {
    const context: Record<string, unknown> = {...createCompletionContext()}
    delete context[field]
    assert.throws(
      () => parseCompletionContext(JSON.stringify(context)),
      /Invalid context fields/u
    )
  })
}

for (const field of Object.keys(
  completionMetadata(createCompletionContext())
)) {
  test(`rejects a missing metadata field: ${field}`, () => {
    const metadata: Record<string, unknown> = {
      ...completionMetadata(createCompletionContext())
    }
    delete metadata[field]
    assert.throws(
      () => parseCompletionMetadata(metadata),
      /Invalid completion metadata fields/u
    )
  })
}

for (const field of [
  'unexpected',
  '__proto__',
  'constructor',
  'prototype',
  'actionsToken',
  'STATE_bypass'
]) {
  test(`rejects an extra context field: ${field}`, () => {
    const context = {...createCompletionContext(), [field]: 'unexpected'}
    assert.throws(
      () => parseCompletionContext(JSON.stringify(context)),
      /Invalid context fields/u
    )
  })
  test(`rejects an extra metadata field: ${field}`, () => {
    const metadata = {
      ...completionMetadata(createCompletionContext()),
      [field]: 'unexpected'
    }
    assert.throws(
      () => parseCompletionMetadata(metadata),
      /Invalid completion metadata fields/u
    )
  })
}

test('rejects substituted context keys even when the field count is unchanged', () => {
  const {params, ...context} = createCompletionContext()
  assert.throws(
    () => parseCompletionContext(JSON.stringify({...context, unknown: params})),
    /Invalid context fields/u
  )
})

test('rejects symbol metadata keys', () => {
  const metadata = {
    ...completionMetadata(createCompletionContext()),
    [Symbol('extra')]: true
  }
  assert.throws(
    () => parseCompletionMetadata(metadata),
    /Invalid completion metadata fields/u
  )
})

const invalidFields = [
  {field: 'schema_version', values: [0, 2, '1', true]},
  {
    field: 'repository',
    values: ['', 'example', 'owner/repo/extra', 'owner/re po', false]
  },
  {
    field: 'trusted_sha',
    values: ['', 'a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40), 10]
  },
  {field: 'lock_ref_sha', values: ['', 'b'.repeat(63), 'b'.repeat(65), false]},
  {field: 'disable_lock', values: ['false', 0, null]},
  {field: 'noop', values: ['false', 0, null]},
  {field: 'ref', values: ['', false, null]},
  {field: 'sha', values: ['', 'not-a-sha', true]},
  {field: 'environment', values: ['', true, null]},
  {field: 'environment_url', values: [false, 0, {}]},
  {field: 'actor', values: ['', false, null]},
  {field: 'fork', values: ['false', 0, null]},
  {field: 'commit_verified', values: ['true', 1, null]},
  {
    field: 'deployment_start_time',
    values: [
      '',
      'not-a-date',
      '2026-01-02T03:04:05Z',
      '2026-01-02T03:04:05.000+00:00',
      '2025-02-29T03:04:05.000Z',
      10
    ]
  },
  {field: 'approved_reviews_count', values: [1, false, null]},
  {field: 'review_decision', values: [1, false, null]},
  {field: 'params', values: [1, false, null]},
  {
    field: 'parsed_params',
    values: [1, false, null, '{', 'null', '[]', 'true', '1', '"text"']
  },
  {field: 'settings', values: [null, [], 'settings', {}]}
] as const satisfies readonly {
  readonly field: keyof CompletionContext
  readonly values: readonly unknown[]
}[]

for (const {field, values} of invalidFields) {
  for (const value of values) {
    test(`rejects invalid ${field}: ${JSON.stringify(value)}`, () => {
      const context = {...createCompletionContext(), [field]: value}
      assert.throws(
        () => parseCompletionContext(JSON.stringify(context)),
        /Invalid|must contain valid JSON/u
      )
    })
  }
}

for (const field of [
  'run_id',
  'run_attempt',
  'issue_number',
  'trigger_comment_id',
  'started_comment_id',
  'deployment_id',
  'reaction_id'
]) {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '10', true]) {
    test(`requires a positive safe integer ${field}: ${String(value)}`, () => {
      const context = {...createCompletionContext(), [field]: value}
      assert.throws(
        () => parseCompletionContext(JSON.stringify(context)),
        /Invalid/u
      )
    })
  }
}

for (const value of [NaN, Infinity, -Infinity]) {
  test(`rejects non-finite metadata IDs: ${String(value)}`, () => {
    assert.throws(
      () =>
        parseCompletionMetadata({
          ...completionMetadata(createCompletionContext()),
          run_id: value
        }),
      /Invalid run_id/u
    )
  })
}

for (const overrides of [{noop: true}, {deployment_id: null}]) {
  test(`rejects inconsistent noop/deployment IDs: ${JSON.stringify(overrides)}`, () => {
    assert.throws(
      () =>
        parseCompletionContext(
          JSON.stringify(createCompletionContext(overrides))
        ),
      /Invalid noop\/deployment_id combination/u
    )
  })
}

for (const field of Object.keys(createCompletionContext().settings)) {
  test(`requires string completion setting: ${field}`, () => {
    const context = createCompletionContext()
    const settings = {...context.settings, [field]: false}
    assert.throws(
      () => parseCompletionContext(JSON.stringify({...context, settings})),
      /Invalid/u
    )
  })
  test(`rejects a missing completion setting: ${field}`, () => {
    const context = createCompletionContext()
    const settings: Record<string, unknown> = {...context.settings}
    delete settings[field]
    assert.throws(
      () => parseCompletionContext(JSON.stringify({...context, settings})),
      /Invalid context settings fields/u
    )
  })
}

for (const field of ['__proto__', 'constructor', 'prototype', 'unexpected']) {
  test(`rejects an extra completion setting: ${field}`, () => {
    const context = createCompletionContext()
    const settings = {...context.settings, [field]: 'unexpected'}
    assert.throws(
      () => parseCompletionContext(JSON.stringify({...context, settings})),
      /Invalid context settings fields/u
    )
  })
}

test('rejects malformed JSON without exposing its contents', () => {
  const marker = 'SYNTHETIC_PRIVATE_VALUE'
  for (const parse of [parseCompletionContext, parseJobResults]) {
    assert.throws(
      () => parse(`{"${marker}":`),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /must contain valid JSON/u)
        assert.ok(!error.message.includes(marker))
        assert.ok(!String(error.stack).includes(marker))
        return true
      }
    )
  }
  const context = createCompletionContext({parsed_params: `{"${marker}":`})
  assert.throws(
    () => parseCompletionContext(JSON.stringify(context)),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /parsed_params must contain valid JSON/u)
      assert.ok(!error.message.includes(marker))
      return true
    }
  )
})

test('accepts exactly the context byte limit and omits oversized serialized contexts', () => {
  const base = createCompletionContext({params: ''})
  const baseLength = Buffer.byteLength(JSON.stringify(base), 'utf8')
  const context = {
    ...base,
    params: 'x'.repeat(MAX_COMPLETION_CONTEXT_BYTES - baseLength)
  }
  const serialized = serializeCompletionContext(context)
  assert.ok(serialized !== null)
  assert.strictEqual(
    Buffer.byteLength(serialized, 'utf8'),
    MAX_COMPLETION_CONTEXT_BYTES
  )
  assert.deepStrictEqual(parseCompletionContext(serialized), context)
  const oversized = {...context, params: `${context.params}x`}
  assert.strictEqual(serializeCompletionContext(oversized), null)
  assert.throws(
    () => parseCompletionContext(JSON.stringify(oversized)),
    /context exceeds the maximum size/u
  )
})

test('limits UTF-8 bytes rather than JavaScript character counts', () => {
  const context = createCompletionContext({
    params: 'é'.repeat(MAX_COMPLETION_CONTEXT_BYTES / 2)
  })
  const serialized = JSON.stringify(context)
  assert.ok(serialized.length < MAX_COMPLETION_CONTEXT_BYTES)
  assert.strictEqual(serializeCompletionContext(context), null)
  assert.throws(
    () => parseCompletionContext(serialized),
    /context exceeds the maximum size/u
  )
})

const resultPriorities = {
  success: 0,
  skipped: 1,
  failure: 2,
  cancelled: 3
} as const satisfies Record<DeploymentResult, number>
const jobResults: readonly DeploymentResult[] = [
  'success',
  'skipped',
  'failure',
  'cancelled'
]

for (const first of jobResults) {
  test(`accepts one ${first} job result`, () => {
    assert.strictEqual(parseJobResults(JSON.stringify([first])), first)
  })
  for (const second of jobResults) {
    test(`aggregates ${first} and ${second} in precedence order`, () => {
      const expected =
        resultPriorities[first] > resultPriorities[second] ? first : second
      assert.strictEqual(
        parseJobResults(JSON.stringify([first, second])),
        expected
      )
    })
  }
}

for (const value of [
  null,
  {},
  {deploy: {result: 'success'}},
  'success',
  true,
  1,
  []
]) {
  test(`rejects job results outside a nonempty array: ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => parseJobResults(JSON.stringify(value)),
      /Invalid job_results array/u
    )
  })
}

for (const value of [
  'SUCCESS',
  'Failure',
  'canceled',
  'unknown',
  '',
  null,
  true,
  1,
  {},
  []
]) {
  test(`rejects invalid job result after cancellation: ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => parseJobResults(JSON.stringify(['cancelled', value])),
      /Invalid job_results value/u
    )
  })
}

test('limits job result JSON by the same byte bound', () => {
  const serialized = '["success"]'
  const atLimit =
    serialized + ' '.repeat(MAX_COMPLETION_CONTEXT_BYTES - serialized.length)
  assert.strictEqual(parseJobResults(atLimit), 'success')
  assert.throws(
    () => parseJobResults(`${atLimit} `),
    /job_results exceeds the maximum size/u
  )
})

for (const url of [
  'https://example.com',
  'HTTPS://example.com/path?q=one%20two#result',
  'https://127.0.0.1:8443/report'
]) {
  test(`validates HTTPS result URL without changing it: ${url}`, () => {
    assert.strictEqual(validateResultUrl(url), url)
  })
}

for (const url of [
  '',
  'http://example.com',
  '//example.com',
  'https:example.com',
  ' https://example.com',
  'https://example.com/a b',
  'https://example.com/\nreport',
  'https://example.com/\u0000report',
  'https://example.com/\u007freport',
  'https://example.com/\u0085report',
  'https://[invalid',
  'https://user@example.com',
  'https://user:password@example.com',
  'https://:password@example.com'
]) {
  test(`rejects invalid result URL ${JSON.stringify(url)}`, () => {
    assert.throws(() => validateResultUrl(url), /Invalid result_url/u)
  })
}

test('does not expose invalid URL credentials in errors', () => {
  const marker = 'SYNTHETIC_PRIVATE_VALUE'
  assert.throws(
    () => validateResultUrl(`https://:${marker}@example.com`),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(!error.message.includes(marker))
      assert.ok(!String(error.stack).includes(marker))
      return true
    }
  )
})

test('rejects oversized result URLs', () => {
  assert.throws(
    () =>
      validateResultUrl(
        `https://example.com/${'x'.repeat(MAX_COMPLETION_CONTEXT_BYTES)}`
      ),
    /result_url exceeds the maximum size/u
  )
})
