import {relative, resolve, sep} from 'node:path'
import ts from 'typescript'

const SK = ts.SyntaxKind
const TF = ts.TypeFlags
type Checker = ts.TypeChecker
type Expression = ts.Expression
type FunctionNode = ts.FunctionLikeDeclaration
type Node = ts.Node
type Program = ts.Program
type SourceFile = ts.SourceFile
type Type = ts.Type
const is = {
  arrow: ts.isArrowFunction,
  binary: ts.isBinaryExpression,
  call: ts.isCallExpression,
  element: ts.isElementAccessExpression,
  identifier: ts.isIdentifier,
  property: ts.isPropertyAccessExpression,
  return: ts.isReturnStatement,
  variable: ts.isVariableDeclaration
} as const

export const POLICY_IDS = [
  'no-suppressions',
  'no-explicit-any',
  'no-unsafe-any',
  'no-non-null-assertion',
  'no-unsafe-assertion',
  'no-var',
  'strict-equality',
  'export-return-type',
  'promise-safety',
  'strict-boolean',
  'safe-interpolation',
  'safe-string-operations',
  'module-syntax',
  'dangerous-eval',
  'control-flow',
  'no-deprecated'
] as const

export type PolicyId = (typeof POLICY_IDS)[number]
export interface PolicyDiagnostic {
  readonly column: number
  readonly line: number
  readonly message: string
  readonly path: string
  readonly policyId: PolicyId
}

export interface SourceTextPolicyInput {
  readonly path: string
  readonly sourceText: string
}

const TRUST_BOUNDARY = 'src/trust-boundaries.ts'
const INVALID_FIXTURES = '__tests__/unsafe-fixtures.ts'
const ALLOWANCES = [
  ['trust-assertion', TRUST_BOUNDARY, 'no-unsafe-assertion'],
  ['trust-any', TRUST_BOUNDARY, 'no-unsafe-any'],
  ['trust-equality', TRUST_BOUNDARY, 'strict-equality'],
  ['fixture-assertion', INVALID_FIXTURES, 'no-unsafe-assertion']
] as const
type AllowanceId = (typeof ALLOWANCES)[number][0]
const ALLOWED_FLAGS =
  TF.BooleanLike |
  TF.StringLike |
  TF.NumberLike |
  TF.Object |
  TF.NonPrimitive |
  TF.Never

const relativePath = (root: string, path: string): string =>
  relative(root, path).split(sep).join('/')

const hasModifier = (node: Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node)?.some(value => value.kind === kind) ?? false)

function typeParts(type: Type): readonly Type[] {
  return type.isUnionOrIntersection() ? type.types.flatMap(typeParts) : [type]
}

function hasFlag(type: Type, flags: ts.TypeFlags): boolean {
  return typeParts(type).some(value => (value.flags & flags) !== 0)
}

const isAny = (type: Type): boolean => hasFlag(type, TF.Any)

const containsAny = (type: Type): boolean => hasFlag(type, TF.Any | TF.Unknown)

const constrained = (checker: Checker, type: Type): Type =>
  checker.getBaseConstraintOfType(type) ?? type

function isThenable(checker: Checker, type: Type): boolean {
  return typeParts(constrained(checker, type)).some(value => {
    const then = value.getProperty('then')
    return (
      then !== undefined &&
      checker.getTypeOfSymbol(then).getCallSignatures().length > 0
    )
  })
}

function isBooleanCondition(checker: Checker, type: Type): boolean {
  const values = typeParts(constrained(checker, type))
  const present = values.filter(
    value => (value.flags & (TF.Null | TF.Undefined)) === 0
  )
  return (
    present.length > 0 &&
    present.every(value => (value.flags & ALLOWED_FLAGS) !== 0) &&
    (present.length === values.length ||
      present.every(
        value =>
          (value.flags & (TF.Object | TF.NonPrimitive)) !== 0 ||
          (value.isStringLiteral() && value.value !== '')
      ))
  )
}

function contains(
  node: Node,
  predicate: (value: Node) => boolean,
  root = node
): boolean {
  if (node !== root && ts.isFunctionLike(node)) return false
  if (predicate(node)) return true
  return (
    ts.forEachChild(node, child => contains(child, predicate, root)) ?? false
  )
}

function assignmentIn(node: Node): ts.BinaryExpression | undefined {
  if (ts.isFunctionLike(node)) return undefined
  if (
    is.binary(node) &&
    node.operatorToken.kind >= SK.FirstAssignment &&
    node.operatorToken.kind <= SK.LastAssignment
  ) {
    return node
  }
  return ts.forEachChild(node, assignmentIn)
}

function isFunction(node: Node): node is FunctionNode {
  return ts.isFunctionLike(node) && 'body' in node
}

function isCallLike(node: Node): node is ts.CallExpression | ts.NewExpression {
  return is.call(node) || ts.isNewExpression(node)
}

const isDynamicImport = (node: Node): boolean =>
  is.call(node) && node.expression.kind === SK.ImportKeyword

const isGenerator = (node: FunctionNode): boolean =>
  'asteriskToken' in node && node.asteriskToken !== undefined

const isLogical = (kind: ts.SyntaxKind): boolean =>
  kind === SK.AmpersandAmpersandToken || kind === SK.BarBarToken

const isLooseEquality = (kind: ts.SyntaxKind): boolean =>
  kind === SK.EqualsEqualsToken || kind === SK.ExclamationEqualsToken

function conditionOf(node: Node): Expression | undefined {
  if (ts.isConditionalExpression(node)) return node.condition
  if (ts.isForStatement(node)) return node.condition
  if (
    ts.isIfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  ) {
    return node.expression
  }
  return undefined
}

function usesGlobal(checker: Checker, node: Expression, name: string): boolean {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    node = node.expression
  if (is.identifier(node))
    return (
      node.text === name &&
      checker.getSymbolAtLocation(node) ===
        checker.resolveName(name, undefined, ts.SymbolFlags.Value, false)
    )
  if (
    is.property(node) &&
    node.name.text === name &&
    usesGlobal(checker, node.expression, 'globalThis')
  )
    return true
  if (is.binary(node) && node.operatorToken.kind === SK.CommaToken)
    return usesGlobal(checker, node.right, name)
  if (ts.isConditionalExpression(node))
    return (
      usesGlobal(checker, node.whenTrue, name) ||
      usesGlobal(checker, node.whenFalse, name)
    )
  return (
    (is.property(node) || is.element(node) || is.call(node)) &&
    usesGlobal(checker, node.expression, name)
  )
}

function exportedDeclarations(
  checker: Checker,
  source: SourceFile
): ReadonlySet<Node> {
  const moduleSymbol = checker.getSymbolAtLocation(source)
  if (moduleSymbol === undefined) return new Set()
  return new Set(
    checker.getExportsOfModule(moduleSymbol).flatMap(exported => {
      const symbol =
        (exported.flags & ts.SymbolFlags.Alias) === 0
          ? exported
          : checker.getAliasedSymbol(exported)
      return symbol.declarations ?? []
    })
  )
}

function exportedFunctionNeedsType(
  node: FunctionNode,
  declarations: ReadonlySet<Node>
): boolean {
  if (
    ts.isConstructorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    hasModifier(node, SK.PrivateKeyword)
  )
    return false
  for (let current: Node = node; !ts.isSourceFile(current); ) {
    if (
      current !== node &&
      isFunction(current) &&
      !ts.isConstructorDeclaration(current)
    )
      return false
    if (
      (is.variable(current) || ts.isPropertyDeclaration(current)) &&
      current.type !== undefined
    )
      return false
    if (declarations.has(current)) return true
    current = current.parent
  }
  return false
}

function needsExplicitSerialization(checker: Checker, type: Type): boolean {
  if (hasFlag(type, TF.Any | TF.Unknown)) return false
  return typeParts(constrained(checker, type)).some(value => {
    if ((value.flags & (TF.Object | TF.NonPrimitive)) === 0) return false
    if (checker.isArrayType(value) || checker.isTupleType(value)) return true
    if (['Error', 'RegExp'].includes(checker.typeToString(value))) return false
    const method = value.getProperty('toString')
    return (
      method === undefined ||
      method.declarations?.every(
        declaration =>
          ts.isInterfaceDeclaration(declaration.parent) &&
          declaration.parent.name.text === 'Object' &&
          declaration.parent.getSourceFile().hasNoDefaultLib
      ) !== false
    )
  })
}

function returnTarget(
  checker: Checker,
  node: ts.ArrowFunction | ts.ReturnStatement
): Type | undefined {
  let fn: FunctionNode
  if (is.return(node)) {
    let parent = node.parent
    while (!isFunction(parent)) parent = parent.parent
    fn = parent
  } else fn = node
  if (fn.type !== undefined) return checker.getTypeFromTypeNode(fn.type)
  if (!is.arrow(fn) && !ts.isFunctionExpression(fn)) return undefined
  return checker.getContextualType(fn)?.getCallSignatures()[0]?.getReturnType()
}

function escapesFinally(node: Node, block: ts.Block): boolean {
  if (is.return(node)) return true
  if (ts.isThrowStatement(node)) {
    for (let parent = node.parent; parent !== block; parent = parent.parent)
      if (
        ts.isTryStatement(parent) &&
        parent.catchClause !== undefined &&
        node.pos >= parent.tryBlock.pos &&
        node.end <= parent.tryBlock.end
      )
        return false
    return true
  }
  if (!ts.isBreakStatement(node) && !ts.isContinueStatement(node)) return false
  for (
    let parent: Node | undefined = node.parent;
    parent;
    parent = parent.parent
  ) {
    const labelMatches =
      node.label !== undefined &&
      ts.isLabeledStatement(parent) &&
      parent.label.text === node.label.text
    const unlabeledTarget =
      node.label === undefined &&
      (ts.isIterationStatement(parent, false) ||
        (ts.isBreakStatement(node) && ts.isSwitchStatement(parent)))
    if (labelMatches || unlabeledTarget)
      return parent.pos < block.pos || parent.end > block.end
  }
  return true
}

function isUnsafeAny(checker: Checker, node: Node): boolean {
  const typeAt = (value: Node): Type => checker.getTypeAtLocation(value)
  const unsafe = (value: Node, target?: Type): boolean =>
    isAny(typeAt(value)) && (target === undefined || !containsAny(target))
  if ((is.property(node) || is.element(node)) && isAny(typeAt(node.expression)))
    return true
  if (
    isCallLike(node) &&
    !isDynamicImport(node) &&
    isAny(typeAt(node.expression))
  )
    return true
  if (is.variable(node) && node.initializer !== undefined)
    return unsafe(
      node.initializer,
      node.type === undefined
        ? undefined
        : checker.getTypeFromTypeNode(node.type)
    )
  if (is.binary(node) && assignmentIn(node) === node)
    return unsafe(node.right, typeAt(node.left))
  if (is.return(node) && node.expression !== undefined)
    return unsafe(node.expression, returnTarget(checker, node))
  if (is.arrow(node) && !ts.isBlock(node.body))
    return unsafe(node.body, returnTarget(checker, node))
  if (ts.isAssertionExpression(node))
    return unsafe(node.expression, checker.getTypeFromTypeNode(node.type))
  if (ts.isAwaitExpression(node)) return isAny(typeAt(node.expression))
  return (
    isCallLike(node) &&
    (node.arguments ?? []).some(argument =>
      unsafe(argument, checker.getContextualType(argument))
    )
  )
}

function isDeprecatedUse(checker: Checker, node: ts.Identifier): boolean {
  let symbol = checker.getSymbolAtLocation(node)
  if (
    symbol?.declarations?.some(
      declaration => ts.getNameOfDeclaration(declaration) === node
    ) === true
  )
    return false
  if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0)
    symbol = checker.getAliasedSymbol(symbol)
  return symbol?.getJsDocTags().some(tag => tag.name === 'deprecated') === true
}

function suppressionPositions(source: string): readonly number[] {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source
  )
  const output: number[] = []
  for (
    let token = scanner.scan();
    token !== SK.EndOfFileToken;
    token = scanner.scan()
  ) {
    if (
      token === SK.SingleLineCommentTrivia ||
      token === SK.MultiLineCommentTrivia
    )
      for (const match of scanner
        .getTokenText()
        .matchAll(/@ts-(?:ignore|nocheck|expect-error)\b/g))
        output.push(scanner.getTokenStart() + match.index)
  }
  return output
}

function checkFiles(
  program: Program,
  root: string,
  files: readonly SourceFile[],
  requireBoundaries: boolean
): PolicyDiagnostic[] {
  const checker = program.getTypeChecker()
  const output: PolicyDiagnostic[] = []
  const usedAllowances = new Set<AllowanceId>()
  const errorSymbol = checker.resolveName(
    'Error',
    undefined,
    ts.SymbolFlags.Type,
    false
  )
  const errorType =
    errorSymbol === undefined
      ? checker.getNeverType()
      : checker.getDeclaredTypeOfSymbol(errorSymbol)

  for (const source of files) {
    const path = relativePath(root, source.fileName)
    const checkedConditions = new Set<Node>()
    const exported = exportedDeclarations(checker, source)
    const typeAt = (node: Node): Type => checker.getTypeAtLocation(node)

    function addAt(
      position: number,
      policyId: PolicyId,
      message: string
    ): void {
      const location = source.getLineAndCharacterOfPosition(position)
      output.push({
        column: location.character + 1,
        line: location.line + 1,
        message,
        path,
        policyId
      })
    }

    function add(node: Node, policyId: PolicyId, message: string): void {
      addAt(node.getStart(source), policyId, message)
    }

    function checkCondition(node: Expression): void {
      checkedConditions.add(node)
      if (is.binary(node) && isLogical(node.operatorToken.kind)) {
        checkCondition(node.left)
        checkCondition(node.right)
      } else if (!isBooleanCondition(checker, typeAt(node))) {
        add(node, 'strict-boolean', 'condition must have a boolean type')
      }
    }

    function visit(node: Node): void {
      if (node.kind === SK.AnyKeyword)
        add(node, 'no-explicit-any', 'explicit any is prohibited')
      if (ts.isNonNullExpression(node))
        add(node, 'no-non-null-assertion', 'non-null assertions are prohibited')
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
        const allowance =
          path === TRUST_BOUNDARY
            ? 'trust-assertion'
            : path === INVALID_FIXTURES
              ? 'fixture-assertion'
              : undefined
        if (allowance !== undefined) usedAllowances.add(allowance)
        if (path === TRUST_BOUNDARY && isAny(typeAt(node.expression))) {
          usedAllowances.add('trust-any')
        }
        if (
          allowance === undefined &&
          !ts.isConstTypeReference(node.type) &&
          (ts.isAsExpression(node.expression) ||
            ts.isTypeAssertionExpression(node.expression) ||
            !checker.isTypeAssignableTo(
              typeAt(node.expression),
              checker.getTypeFromTypeNode(node.type)
            ))
        ) {
          add(node, 'no-unsafe-assertion', 'unsafe type assertion')
        }
      }
      if (
        ts.isVariableDeclarationList(node) &&
        (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0
      )
        add(node, 'no-var', 'var declarations are prohibited')
      if (is.binary(node) && isLooseEquality(node.operatorToken.kind)) {
        if (path === TRUST_BOUNDARY) usedAllowances.add('trust-equality')
        else add(node.operatorToken, 'strict-equality', 'use strict equality')
      }
      if (
        isFunction(node) &&
        node.type === undefined &&
        exportedFunctionNeedsType(node, exported)
      )
        add(node, 'export-return-type', 'exported function needs a return type')

      if (ts.isExpressionStatement(node)) {
        const value = node.expression
        const registration =
          path.startsWith('__tests__/') &&
          is.call(value) &&
          is.identifier(value.expression) &&
          /^(?:after|afterEach|before|beforeEach|describe|it|test)$/.test(
            value.expression.text
          )
        if (
          !registration &&
          !ts.isVoidExpression(value) &&
          isThenable(checker, typeAt(value))
        ) {
          add(value, 'promise-safety', 'floating Promise')
        }
      }
      if (
        ts.isAwaitExpression(node) &&
        !hasFlag(typeAt(node.expression), TF.Any) &&
        !isThenable(checker, typeAt(node.expression))
      )
        add(node, 'promise-safety', 'await requires a thenable')
      if (
        isFunction(node) &&
        hasModifier(node, SK.AsyncKeyword) &&
        !isGenerator(node) &&
        node.body !== undefined &&
        !contains(
          node.body,
          child =>
            ts.isAwaitExpression(child) ||
            (ts.isForOfStatement(child) && child.awaitModifier !== undefined)
        )
      )
        add(node, 'promise-safety', 'async function requires await')
      if (isCallLike(node)) {
        for (const argument of node.arguments ?? []) {
          const contextual = checker.getContextualType(argument)
          const expectedVoid =
            contextual !== undefined &&
            contextual.getCallSignatures().length > 0 &&
            contextual
              .getCallSignatures()
              .every(value => (value.getReturnType().flags & TF.Void) !== 0)
          const returnsPromise = typeAt(argument)
            .getCallSignatures()
            .some(value => isThenable(checker, value.getReturnType()))
          if (expectedVoid && returnsPromise) {
            add(argument, 'promise-safety', 'Promise used as void callback')
          }
        }
      }
      if (
        ts.isNewExpression(node) &&
        usesGlobal(checker, node.expression, 'Promise') &&
        node.arguments?.[0] !== undefined &&
        hasModifier(node.arguments[0], SK.AsyncKeyword)
      )
        add(node.arguments[0], 'promise-safety', 'async Promise executor')

      const condition = conditionOf(node)
      if (condition !== undefined) {
        checkCondition(condition)
        const assignment = assignmentIn(condition)
        if (assignment !== undefined) {
          add(assignment, 'control-flow', 'assignment in condition')
        }
      }
      if (
        ts.isPrefixUnaryExpression(node) &&
        node.operator === SK.ExclamationToken
      ) {
        checkCondition(node.operand)
      }
      if (
        is.binary(node) &&
        isLogical(node.operatorToken.kind) &&
        !checkedConditions.has(node.left)
      ) {
        checkCondition(node.left)
      }

      if (ts.isTemplateSpan(node)) {
        const allowed =
          TF.StringLike | TF.NumberLike | TF.BooleanLike | TF.Never
        if (
          !typeParts(constrained(checker, typeAt(node.expression))).every(
            value => (value.flags & allowed) !== 0
          )
        ) {
          add(node.expression, 'safe-interpolation', 'unsafe template value')
        }
      }
      if (
        is.call(node) &&
        usesGlobal(checker, node.expression, 'String') &&
        node.arguments[0] !== undefined &&
        needsExplicitSerialization(checker, typeAt(node.arguments[0]))
      )
        add(
          node,
          'safe-string-operations',
          'object needs explicit serialization'
        )
      if (is.binary(node) && node.operatorToken.kind === SK.PlusToken) {
        const left = typeAt(node.left)
        const right = typeAt(node.right)
        if (
          (hasFlag(left, TF.StringLike) && hasFlag(right, TF.NumberLike)) ||
          (hasFlag(left, TF.NumberLike) && hasFlag(right, TF.StringLike))
        ) {
          add(
            node,
            'safe-string-operations',
            'mixed string and number addition'
          )
        }
      }

      if (
        ts.isImportEqualsDeclaration(node) ||
        (ts.isExportAssignment(node) && node.isExportEquals === true) ||
        (is.call(node) && usesGlobal(checker, node.expression, 'require'))
      )
        add(node, 'module-syntax', 'CommonJS syntax is prohibited')
      if (
        isCallLike(node) &&
        (usesGlobal(checker, node.expression, 'eval') ||
          usesGlobal(checker, node.expression, 'Function'))
      )
        add(node, 'dangerous-eval', 'dynamic evaluation is prohibited')

      if (ts.isDebuggerStatement(node))
        add(node, 'control-flow', 'debugger is prohibited')
      if (
        is.call(node) &&
        is.property(node.expression) &&
        /^(?:hasOwnProperty|isPrototypeOf|propertyIsEnumerable)$/.test(
          node.expression.name.text
        )
      )
        add(node, 'control-flow', 'unsafe prototype method call')
      if (
        is.binary(node) &&
        node.operatorToken.kind >= SK.LessThanToken &&
        node.operatorToken.kind <= SK.ExclamationEqualsEqualsToken &&
        (usesGlobal(checker, node.left, 'NaN') ||
          usesGlobal(checker, node.right, 'NaN'))
      )
        add(node, 'control-flow', 'use Number.isNaN')
      if (ts.isTryStatement(node) && node.finallyBlock !== undefined) {
        const finallyBlock = node.finallyBlock
        const abrupt = (value: Node): void => {
          if (value !== finallyBlock && ts.isFunctionLike(value)) return
          if (escapesFinally(value, finallyBlock)) {
            add(value, 'control-flow', 'abrupt completion in finally')
          }
          ts.forEachChild(value, abrupt)
        }
        abrupt(node.finallyBlock)
      }
      if (ts.isThrowStatement(node) && node.expression !== undefined) {
        const value = typeAt(node.expression)
        if (
          !hasFlag(value, TF.Any | TF.Unknown) &&
          !checker.isTypeAssignableTo(value, errorType)
        ) {
          add(node, 'control-flow', 'only Error values may be thrown')
        }
      }

      if (is.identifier(node) && isDeprecatedUse(checker, node))
        add(node, 'no-deprecated', 'deprecated symbol')

      if (isUnsafeAny(checker, node)) {
        if (path === TRUST_BOUNDARY) usedAllowances.add('trust-any')
        else add(node, 'no-unsafe-any', 'unsafe any flow')
      }
      ts.forEachChild(node, visit)
    }

    for (const position of suppressionPositions(source.text))
      addAt(position, 'no-suppressions', 'TypeScript suppression directive')
    visit(source)
  }

  if (requireBoundaries) {
    for (const [id, path, policyId] of ALLOWANCES) {
      if (!usedAllowances.has(id)) {
        output.push({
          column: 1,
          line: 1,
          message: `stale trust-boundary allowance: ${id}`,
          path,
          policyId
        })
      }
    }
  }
  const unique = new Map(
    output.map(value => [formatDiagnostic(value), value] as const)
  )
  return [...unique.values()].sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.line - b.line ||
      a.column - b.column ||
      a.policyId.localeCompare(b.policyId) ||
      a.message.localeCompare(b.message)
  )
}

export function checkSourceText(
  sourceText: string,
  path = '__tests__/fixtures/typescript-policy/fixture.ts',
  moduleDetection: 'force' | 'legacy' = 'force',
  includeNodeTypes = true
): PolicyDiagnostic[] {
  return checkSourceTexts(
    [{path, sourceText}],
    moduleDetection,
    includeNodeTypes
  )
}

export function checkSourceTexts(
  files: readonly SourceTextPolicyInput[],
  moduleDetection: 'force' | 'legacy' = 'force',
  includeNodeTypes = true
): PolicyDiagnostic[] {
  const root = process.cwd()
  const sourceTexts = new Map(
    files.map(file => [resolve(root, file.path), file.sourceText] as const)
  )
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleDetection:
      moduleDetection === 'force'
        ? ts.ModuleDetectionKind.Force
        : ts.ModuleDetectionKind.Legacy,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022
  }
  if (!includeNodeTypes) options.types = []
  const host = ts.createCompilerHost(options)
  const readSource = host.getSourceFile.bind(host)
  host.getSourceFile = (value, version, onError, createNew) => {
    const sourceText = sourceTexts.get(value)
    if (sourceText !== undefined) {
      return ts.createSourceFile(
        value,
        sourceText,
        version,
        true,
        ts.ScriptKind.TS
      )
    }
    return readSource(value, version, onError, createNew)
  }
  const program = ts.createProgram({
    host,
    options,
    rootNames: [...sourceTexts.keys()]
  })
  const sources = program
    .getSourceFiles()
    .filter(source => sourceTexts.has(source.fileName))
  return checkFiles(program, root, sources, false)
}

export function checkProject(root = process.cwd()): PolicyDiagnostic[] {
  const configHost: ts.ParseConfigFileHost = {
    fileExists: ts.sys.fileExists,
    getCurrentDirectory: () => root,
    onUnRecoverableConfigFileDiagnostic: () => undefined,
    readDirectory: ts.sys.readDirectory,
    readFile: ts.sys.readFile,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames
  }
  const config = resolve(root, 'tsconfig.json')
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, configHost)
  if (parsed === undefined) throw new Error('could not parse tsconfig.json')
  const program = ts.createProgram({
    options: parsed.options,
    rootNames: parsed.fileNames
  })
  const roots = ['src/', '__tests__/', 'tools/']
  const files = program.getSourceFiles().filter(source => {
    const path = relativePath(root, source.fileName)
    return (
      !source.isDeclarationFile && roots.some(value => path.startsWith(value))
    )
  })
  return checkFiles(program, root, files, true)
}

export function formatDiagnostic(value: PolicyDiagnostic): string {
  return `${value.path}:${value.line}:${value.column}: ${value.policyId}: ${value.message}`
}

export function runPolicy(
  diagnostics: readonly PolicyDiagnostic[] = checkProject()
): number {
  for (const value of diagnostics) console.error(formatDiagnostic(value))
  return diagnostics.length === 0 ? 0 : 1
}
