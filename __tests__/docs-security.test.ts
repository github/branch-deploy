import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from 'vitest'

const markdownFiles = [
  'README.md',
  ...readdirSync('docs', {withFileTypes: true})
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join('docs', entry.name))
]

function checkoutSteps(path: string) {
  const lines = readFileSync(path, 'utf8').split('\n')
  const steps = []

  for (const [index, line] of lines.entries()) {
    if (!line.includes('uses: actions/checkout@')) continue

    const indentation = /^\s*/.exec(line)?.[0].length ?? 0
    const stepIndentation = line.trimStart().startsWith('- uses:')
      ? indentation
      : Math.max(0, indentation - 2)
    let end = index + 1

    while (end < lines.length) {
      const nextLine = lines[end]
      if (nextLine === undefined) break
      const nextStep = /^(\s*)-\s/.exec(nextLine)
      if (nextLine.trim() === '```') break
      if (
        (nextStep?.[1]?.length ?? Number.POSITIVE_INFINITY) <= stepIndentation
      )
        break
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
