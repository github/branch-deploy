import assert from 'node:assert/strict'
import {test} from 'node:test'
import {renderDeploymentTemplate} from '../../src/functions/deployment-template.ts'

const variables = {
  actor: 'monalisa',
  approved_reviews_count: 2,
  commit_verified: true,
  deployment_end_time: '2026-07-11T12:00:00Z',
  deployment_id: 123,
  environment: 'production',
  environment_url: null,
  fork: false,
  logs: 'https://github.com/corp/test/actions/runs/123',
  noop: false,
  params: '--target=production',
  parsed_params: '{"target":"production"}',
  ref: 'feature',
  results: 'deployed <strong>successfully</strong>',
  review_decision: 'APPROVED',
  sha: '0123456789abcdef0123456789abcdef01234567',
  status: 'success',
  total_seconds: 8
} as const

test('renders allowlisted scalar variables and null as an empty string', () => {
  assert.strictEqual(
    renderDeploymentTemplate(
      '{{ actor }}|{{ approved_reviews_count }}|{{ commit_verified }}|{{ environment_url }}|{{ fork }}',
      variables
    ),
    'monalisa|2|true||false'
  )
})

test('escapes HTML-significant characters in ordinary variables', () => {
  assert.strictEqual(
    renderDeploymentTemplate('{{ value }}', {
      value: '<tag data-value="quoted">Tom & Jerry\'s</tag>'
    }),
    '&lt;tag data-value=&quot;quoted&quot;&gt;Tom &amp; Jerry&#39;s&lt;/tag&gt;'
  )
})

test('renders results raw and does not evaluate template syntax in its value', () => {
  const results =
    '<details>{{ actor }}{% if commit_verified %}owned{% endif %}{# comment #}</details>'

  assert.strictEqual(
    renderDeploymentTemplate('before {{ results }} after {{ actor }}', {
      ...variables,
      results
    }),
    `before ${results} after monalisa`
  )
})

test('supports truthy, negated, else, and nested conditions', () => {
  assert.strictEqual(
    renderDeploymentTemplate(
      '{% if commit_verified %}status:{% if noop %}noop{% else %}deploy{% endif %}{% endif %}|{% if not fork %}not-fork{% else %}fork{% endif %}',
      variables
    ),
    'status:deploy|not-fork'
  )

  assert.strictEqual(
    renderDeploymentTemplate(
      '{% if noop %}{% if commit_verified %}hidden{% endif %}{{ actor }}{% else %}visible{% endif %}',
      variables
    ),
    'visible'
  )
})

const comparisons = [
  ['status == "success"', 'yes'],
  ['status === "success"', 'yes'],
  ['status != "failure"', 'yes'],
  ['status !== "failure"', 'yes'],
  ['approved_reviews_count === 2', 'yes'],
  ['approved_reviews_count === 2e0', 'yes'],
  ['commit_verified === true', 'yes'],
  ['fork === false', 'yes'],
  ['environment_url === null', 'yes'],
  ['approved_reviews_count == "2"', 'no'],
  ['status === "failure"', 'no']
] as const

for (const [condition, expected] of comparisons) {
  test(`evaluates the comparison ${condition}`, () => {
    assert.strictEqual(
      renderDeploymentTemplate(
        `{% if ${condition} %}yes{% else %}no{% endif %}`,
        variables
      ),
      expected
    )
  })
}

test('supports literal-only ternaries with string, boolean, number, and null results', () => {
  assert.strictEqual(
    renderDeploymentTemplate(
      '{{ "ok" if status === "success" else "bad" }}|{{ false if noop else true }}|{{ 1.5e1 if commit_verified else -2 }}|{{ "unused" if fork else null }}|{{ "line\\nnext" if status === "success" else "" }}',
      variables
    ),
    'ok|true|15||line\nnext'
  )

  assert.strictEqual(
    renderDeploymentTemplate(
      '{{ "unused" if status === "failure" else "fallback" }}',
      variables
    ),
    'fallback'
  )
})

test('supports negative and exponent numeric literals plus escaped string literals', () => {
  assert.strictEqual(
    renderDeploymentTemplate(
      '{% if negative === -2.5e-1 %}negative{% else %}bad{% endif %}|{% if zero === -0 %}zero{% else %}bad{% endif %}|{% if text === "line\\nnext" %}text{% else %}bad{% endif %}|{{ "left\\tright" if enabled else "bad" }}',
      {enabled: true, negative: -0.25, text: 'line\nnext', zero: 0}
    ),
    'negative|zero|text|left\tright'
  )
})

test('rejects inherited template variables', () => {
  const inheritedVariables = {visible: 'value'}
  Reflect.setPrototypeOf(inheritedVariables, {secret: 'inherited'})

  assert.strictEqual(
    renderDeploymentTemplate('{{ visible }}', inheritedVariables),
    'value'
  )
  assert.throws(
    () => renderDeploymentTemplate('{{ secret }}', inheritedVariables),
    new Error('Unknown deployment template variable: secret')
  )
})

test('rejects unknown variables', () => {
  assert.throws(
    () => renderDeploymentTemplate('{{ constructor }}', variables),
    new Error('Unknown deployment template variable: constructor')
  )
  assert.throws(
    () =>
      renderDeploymentTemplate(
        '{% if missing %}unexpected{% endif %}',
        variables
      ),
    new Error('Unknown deployment template variable: missing')
  )
})

test('rejects unsupported expressions in inactive branches', () => {
  assert.throws(
    () =>
      renderDeploymentTemplate(
        '{% if fork %}{{ actor.toString() }}{% endif %}',
        variables
      ),
    new Error('Unsupported deployment template expression: actor.toString()')
  )
})

for (const condition of ['status', 'not environment_url']) {
  test(`rejects non-boolean condition ${condition}`, () => {
    assert.throws(
      () =>
        renderDeploymentTemplate(
          `{% if ${condition} %}unexpected{% endif %}`,
          variables
        ),
      new Error(`Deployment template condition is not boolean: ${condition}`)
    )
  })
}

const unsupportedTemplates = [
  [
    'filters',
    '{{ actor | safe }}',
    'Unsupported deployment template expression: actor | safe'
  ],
  [
    'property access',
    '{{ actor.constructor }}',
    'Unsupported deployment template expression: actor.constructor'
  ],
  [
    'function calls',
    '{{ actor() }}',
    'Unsupported deployment template expression: actor()'
  ],
  [
    'variable ternary branches',
    '{{ actor if status else ref }}',
    'Unsupported deployment template expression: actor if status else ref'
  ],
  [
    'boolean operators',
    '{% if status and commit_verified %}x{% endif %}',
    'Unsupported deployment template condition: status and commit_verified'
  ],
  [
    'invalid negation',
    '{% if not actor.name %}x{% endif %}',
    'Unsupported deployment template condition: not actor.name'
  ],
  [
    'leading-zero numeric literal',
    '{% if approved_reviews_count === 02 %}x{% endif %}',
    'Unsupported deployment template condition: approved_reviews_count === 02'
  ],
  [
    'non-finite numeric literal',
    '{% if approved_reviews_count === Infinity %}x{% endif %}',
    'Unsupported deployment template condition: approved_reviews_count === Infinity'
  ],
  [
    'unsupported statement',
    '{% for item in results %}x{% endfor %}',
    'Unsupported deployment template statement: for item in results'
  ],
  [
    'orphan else',
    '{% else %}',
    'Unexpected deployment template else statement'
  ],
  [
    'duplicate else',
    '{% if commit_verified %}a{% else %}b{% else %}c{% endif %}',
    'Unexpected deployment template else statement'
  ],
  [
    'orphan endif',
    '{% endif %}',
    'Unexpected deployment template endif statement'
  ],
  [
    'unclosed if',
    '{% if commit_verified %}x',
    'Unclosed deployment template if statement'
  ],
  ['template comments', '{# hidden #}', 'Malformed deployment template syntax'],
  [
    'malformed syntax before a valid token',
    '{# hidden #}{{ actor }}',
    'Malformed deployment template syntax'
  ],
  ['unclosed expression', '{{ actor', 'Malformed deployment template syntax'],
  [
    'unclosed statement',
    '{% if status',
    'Malformed deployment template syntax'
  ],
  [
    'trailing malformed syntax',
    '{{ actor }} {% broken',
    'Malformed deployment template syntax'
  ]
] as const

for (const [name, template, message] of unsupportedTemplates) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => renderDeploymentTemplate(template, variables),
      new Error(message)
    )
  })
}
