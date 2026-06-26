import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from 'vitest'

const markdownFiles = [
  'README.md',
  ...readdirSync('docs', {withFileTypes: true})
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join('docs', entry.name))
]

function checkoutSteps(path) {
  const lines = readFileSync(path, 'utf8').split('\n')
  const steps = []

  for (const [index, line] of lines.entries()) {
    if (!line.includes('uses: actions/checkout@')) continue

    const indentation = line.match(/^\s*/)[0].length
    const stepIndentation = line.trimStart().startsWith('- uses:')
      ? indentation
      : Math.max(0, indentation - 2)
    let end = index + 1

    while (end < lines.length) {
      const nextLine = lines[end]
      const nextStep = nextLine.match(/^(\s*)-\s/)
      if (nextLine.trim() === '```') break
      if (nextStep && nextStep[1].length <= stepIndentation) break
      end += 1
    }

    steps.push({
      path,
      line: index + 1,
      body: lines.slice(index, end).join('\n')
    })
  }

  return steps
}

test('documented checkout steps do not persist credentials', () => {
  const checkouts = markdownFiles.flatMap(checkoutSteps)
  const unsafeCheckouts = checkouts
    .filter(
      ({body}) => !/^\s*persist-credentials:\s*false\s*(?:#.*)?$/m.test(body)
    )
    .map(({path, line}) => `${path}:${line}`)

  expect(checkouts.length).toBeGreaterThan(0)
  expect(unsafeCheckouts).toEqual([])
})
