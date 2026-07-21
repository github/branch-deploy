import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

const markdownFiles = [
  'README.md',
  ...readdirSync('docs', {withFileTypes: true})
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join('docs', entry.name))
]

const documentedWorkflowFiles = [
  ...markdownFiles,
  '.github/workflows/old/sample-workflow.yml'
]

function checkoutSteps(path: string) {
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map(line => (path.endsWith('.yml') ? line.replace(/^# ?/, '') : line))
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
  const checkouts = documentedWorkflowFiles.flatMap(checkoutSteps)
  const unsafeCheckouts = checkouts
    .filter(
      ({body}) => !/^\s*persist-credentials:\s*false\s*(?:#.*)?$/m.test(body)
    )
    .map(({path, line}) => `${path}:${line}`)

  assert.ok(checkouts.length > 0)
  assert.deepStrictEqual(unsafeCheckouts, [])
})

test('documented inline scripts do not interpolate step or job outputs', () => {
  const unsafeScripts: string[] = []

  for (const path of markdownFiles) {
    const lines = readFileSync(path, 'utf8').split('\n')

    for (const [index, line] of lines.entries()) {
      const script = /^(\s*)(?:run|script):\s*(.*)$/.exec(line)
      if (script === null) continue

      const indentation = script[1]?.length ?? 0
      let end = index + 1
      if (script[2] === '|' || script[2] === '|-' || script[2] === '|+') {
        while (end < lines.length) {
          const nextLine = lines[end]
          if (nextLine === undefined) break
          const nextIndentation = /^\s*/.exec(nextLine)?.[0].length ?? 0
          if (nextLine.trim() !== '' && nextIndentation <= indentation) break
          end += 1
        }
      }

      const body = lines.slice(index, end).join('\n')
      if (
        /\$\{\{[^}]*\b(?:(?:steps|needs)\.[^}]*\.outputs\.|env\.)[^}]*\}\}/u.test(
          body
        )
      ) {
        unsafeScripts.push(`${path}:${index + 1}`)
      }
    }
  }

  assert.deepStrictEqual(unsafeScripts, [])
})

test('documented deployment messages do not use a fixed EOF delimiter', () => {
  const unsafeDelimiters = markdownFiles.filter(path =>
    readFileSync(path, 'utf8').includes('DEPLOY_MESSAGE<<EOF')
  )

  assert.deepStrictEqual(unsafeDelimiters, [])
})
