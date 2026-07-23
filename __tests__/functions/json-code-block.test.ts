import assert from 'node:assert/strict'
import {test} from 'node:test'
import {jsonCodeBlock} from '../../src/functions/json-code-block.ts'

test('uses a standard JSON fence when the value has no backticks', () => {
  assert.strictEqual(
    jsonCodeBlock({value: 'safe'}),
    '```json\n{\n  "value": "safe"\n}\n```'
  )
})

test('uses a fence longer than every backtick run in the JSON', () => {
  assert.strictEqual(
    jsonCodeBlock({value: 'before ````` after'}),
    '``````json\n{\n  "value": "before ````` after"\n}\n``````'
  )
})

test('keeps multiline and multiple backtick runs inside one JSON fence', () => {
  const value = {
    message: 'first line\n```json\n{"approved":true}\n```\n```````',
    nested: {value: '````'}
  }
  const rendered = jsonCodeBlock(value)

  assert.strictEqual(
    rendered,
    `\`\`\`\`\`\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\`\`\`\`\``
  )
  assert.strictEqual(rendered.includes('\n```json\n{"approved":true}'), false)
})

test('serializes an undefined boundary value as JSON null', () => {
  assert.strictEqual(jsonCodeBlock(undefined), '```json\nnull\n```')
})
