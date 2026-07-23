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

function documentedLines(path: string): readonly string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map(line => (path.endsWith('.yml') ? line.replace(/^# ?/, '') : line))
}

function unsafeInlineScriptLines(lines: readonly string[]): number[] {
  const unsafe: number[] = []

  for (const [index, line] of lines.entries()) {
    const script = /^(\s*)(?:run|script):\s*(.*)$/.exec(line)
    if (script === null) continue

    const indentation = script[1]?.length ?? 0
    let end = index + 1
    if (/^[|>][+-]?(?:\s+#.*)?$/u.test(script[2] ?? '')) {
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
      /\$\{\{[^}]*\b(?:(?:steps|needs)\.[^}]*\.outputs\.|env\.|github\.event\.|inputs\.|matrix\.|secrets\.)[^}]*\}\}/u.test(
        body
      )
    ) {
      unsafe.push(index + 1)
    }
  }

  return unsafe
}

function fixedDeploymentDelimiters(source: string): string[] {
  return source.match(/DEPLOY_MESSAGE<<[A-Za-z_][A-Za-z0-9_.-]*/gu) ?? []
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

test('documented inline scripts do not interpolate untrusted expressions', () => {
  const unsafeScripts: string[] = []

  for (const path of documentedWorkflowFiles) {
    for (const line of unsafeInlineScriptLines(documentedLines(path))) {
      unsafeScripts.push(`${path}:${line}`)
    }
  }

  assert.deepStrictEqual(unsafeScripts, [])
})

test('the inline-script scanner rejects literal, folded, and inline expressions', () => {
  for (const source of [
    'run: echo "${{ github.event.comment.body }}"',
    'run: |\n  echo "${{ steps.branch-deploy.outputs.params }}"',
    'run: |-\n  echo "${{ env.VALUE }}"',
    'run: >\n  echo "${{ needs.deploy.outputs.result }}"',
    'run: >-\n  echo "${{ matrix.value }}"',
    'script: >+\n  console.log("${{ inputs.value }}")',
    'script: |\n  console.log("${{ secrets.VALUE }}")'
  ]) {
    assert.deepStrictEqual(unsafeInlineScriptLines(source.split('\n')), [1])
  }

  assert.deepStrictEqual(
    unsafeInlineScriptLines([
      'env:',
      '  PARAMS: ${{ steps.branch-deploy.outputs.params }}',
      'run: |',
      '  printf \'%s\\n\' "$PARAMS"'
    ]),
    []
  )
})

test('manual deployment examples release only their original non-sticky locks', () => {
  const examples = readFileSync('docs/examples.md', 'utf8')
  const captureSteps =
    examples.match(/^ {6}- name: Capture deployment lock$/gmu) ?? []
  const capturedOutputs =
    examples.match(
      /^ {6}lock_ref_sha: \$\{\{ steps\.capture-lock\.outputs\.sha \}\}$/gmu
    ) ?? []
  const releaseSteps = Array.from(
    examples.matchAll(
      /^ {6}- name: Remove (?:a non-sticky lock|Non-Sticky Lock)\n([\s\S]*?)(?=^ {6}- (?:name:|if:)|^ {2}[a-z]|^```)/gmu
    ),
    match => match[0]
  )

  assert.strictEqual(captureSteps.length, 4)
  assert.strictEqual(capturedOutputs.length, 4)
  assert.strictEqual(releaseSteps.length, 4)

  for (const step of releaseSteps) {
    assert.match(step, /lock\.json\?ref=\$\{LOCK_REF_SHA\}/u)
    assert.match(step, /\.created_by == \$actor/u)
    assert.match(step, /\.environment == \$environment/u)
    assert.match(step, /\.global == false/u)
    assert.match(step, /\.sticky == false/u)
    assert.match(step, /\.link == \$link/u)
    assert.match(step, /updateRefs\(/u)
    assert.match(step, /\$name: GitRefname!/u)
    assert.match(step, /beforeOid: \$before/u)
    assert.match(step, /afterOid: "0{40}"/u)
    assert.match(step, /-f before="\$LOCK_REF_SHA"/u)
    assert.doesNotMatch(step, /global-branch-deploy-lock|--method\s+DELETE/u)
  }
})

test('documented deployment messages do not use fixed delimiters', () => {
  const unsafeDelimiters = documentedWorkflowFiles.flatMap(path =>
    fixedDeploymentDelimiters(readFileSync(path, 'utf8')).map(
      delimiter => `${path}:${delimiter}`
    )
  )

  assert.deepStrictEqual(unsafeDelimiters, [])
})

test('the deployment-message scanner rejects every fixed delimiter', () => {
  assert.deepStrictEqual(
    fixedDeploymentDelimiters(
      [
        'echo \'DEPLOY_MESSAGE<<EOF\' >> "$GITHUB_ENV"',
        'echo \'DEPLOY_MESSAGE<<END_MARKER\' >> "$GITHUB_ENV"',
        'printf \'%s\\n\' "DEPLOY_MESSAGE<<fixed-delimiter"'
      ].join('\n')
    ),
    [
      'DEPLOY_MESSAGE<<EOF',
      'DEPLOY_MESSAGE<<END_MARKER',
      'DEPLOY_MESSAGE<<fixed-delimiter'
    ]
  )
  assert.deepStrictEqual(
    fixedDeploymentDelimiters(
      [
        'printf \'%s\\n\' "DEPLOY_MESSAGE<<$delimiter"',
        'printf \'%s\\n\' "DEPLOY_MESSAGE<<${delimiter}"'
      ].join('\n')
    ),
    []
  )
})
