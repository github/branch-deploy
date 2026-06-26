import {readdirSync, readFileSync} from 'node:fs'
import {relative, resolve} from 'node:path'
import ts from 'typescript'
import {expect, test} from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')
const checkedRoots = ['src', '__tests__'] as const
const unsafeAssertionAllowlist = new Set([
  'src/trust-boundaries.ts',
  '__tests__/unsafe-fixtures.ts'
])

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return typescriptFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
  })
}

test('unsafe TypeScript escape hatches stay at named trust boundaries', () => {
  const violations: string[] = []

  for (const root of checkedRoots) {
    for (const path of typescriptFiles(resolve(projectRoot, root))) {
      const projectPath = relative(projectRoot, path)
      const sourceText = readFileSync(path, 'utf8')
      const sourceFile = ts.createSourceFile(
        path,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      )

      if (
        sourceText.includes(['@ts-', 'ignore'].join('')) ||
        sourceText.includes(['@ts-', 'nocheck'].join(''))
      ) {
        violations.push(`${projectPath}: TypeScript suppression directive`)
      }

      function visit(node: ts.Node): void {
        if (!unsafeAssertionAllowlist.has(projectPath)) {
          if (ts.isNonNullExpression(node)) {
            const {line} = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile)
            )
            violations.push(`${projectPath}:${line + 1}: non-null assertion`)
          }

          if (ts.isAsExpression(node) && ts.isAsExpression(node.expression)) {
            const {line} = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile)
            )
            violations.push(`${projectPath}:${line + 1}: nested type assertion`)
          }

          if (
            ts.isAsExpression(node) &&
            node.type.kind === ts.SyntaxKind.AnyKeyword
          ) {
            const {line} = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile)
            )
            violations.push(
              `${projectPath}:${line + 1}: explicit any assertion`
            )
          }
        }

        if (
          ts.isVariableDeclarationList(node) &&
          (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0
        ) {
          const {line} = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          )
          violations.push(`${projectPath}:${line + 1}: var declaration`)
        }

        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
    }
  }

  expect(violations).toStrictEqual([])
})
