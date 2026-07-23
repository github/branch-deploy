import assert from 'node:assert/strict'
import {test} from 'node:test'
import {dedent} from '../../src/functions/dedent.ts'

const interpolatedLines = 'beta\n  gamma'

const cases = [
  {
    name: 'removes a leading newline, common indentation, and trailing newline',
    input: '\n  alpha\n  beta\n',
    expected: 'alpha\nbeta'
  },
  {
    name: 'preserves CRLF line endings',
    input: '\r\n\talpha\r\n\tbeta\r\n\t',
    expected: 'alpha\r\nbeta'
  },
  {
    name: 'counts mixed tabs and spaces as indentation characters',
    input: '\n \talpha\n   beta\n',
    expected: 'alpha\n beta'
  },
  {
    name: 'preserves indentation beyond the common minimum',
    input: '\n  alpha\n    beta\n',
    expected: 'alpha\n  beta'
  },
  {
    name: 'preserves unindented blank lines',
    input: '\n    alpha\n\n    beta\n',
    expected: 'alpha\n\nbeta'
  },
  {
    name: 'removes only one outer newline',
    input: '\n\n  alpha\n  beta\n\n',
    expected: '\nalpha\nbeta\n'
  },
  {
    name: 'does not let an unindented line force the common indentation to zero',
    input: '\n  alpha\n  beta\ngamma\n',
    expected: 'alpha\nbeta\ngamma'
  },
  {
    name: 'lets a whitespace-only line participate in common indentation',
    input: '\n    alpha\n      \n    beta\n',
    expected: 'alpha\n  \nbeta'
  },
  {
    name: 'does not strip leading spaces without a leading newline',
    input: '  alpha',
    expected: '  alpha'
  },
  {
    name: 'does not strip indentation from the first line',
    input: '  alpha\n    beta\n',
    expected: '  alpha\nbeta'
  },
  {
    name: 'includes already-interpolated lines when finding indentation',
    input: `\n  alpha\n  ${interpolatedLines}\n`,
    expected: 'alpha\nbeta\ngamma'
  },
  {
    name: 'leaves an inline string unchanged',
    input: 'alpha beta',
    expected: 'alpha beta'
  }
] as const

for (const {name, input, expected} of cases) {
  test(name, () => {
    assert.strictEqual(dedent(input), expected)
  })
}
