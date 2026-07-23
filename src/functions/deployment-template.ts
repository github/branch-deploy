import {
  decodedDeploymentTemplateLiteral,
  regexCapture
} from '../trust-boundaries.ts'

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u
const COMPARISON =
  /^([a-z_][a-z0-9_]*)\s*(===|==|!==|!=)\s*("(?:[^"\\]|\\.)*"|true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$/u
const TERNARY =
  /^("(?:[^"\\]|\\.)*"|true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)\s+if\s+(.+?)\s+else\s+("(?:[^"\\]|\\.)*"|true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$/u

export type DeploymentTemplateVariables = Readonly<
  Record<string, boolean | null | number | string>
>

interface ConditionalFrame {
  readonly condition: boolean
  readonly parentActive: boolean
  seenElse: boolean
}

function parseLiteral(value: string): boolean | null | number | string {
  return decodedDeploymentTemplateLiteral(value)
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function variable(
  variables: DeploymentTemplateVariables,
  name: string
): boolean | null | number | string {
  if (!Object.hasOwn(variables, name)) {
    throw new Error(`Unknown deployment template variable: ${name}`)
  }
  return variables[name] ?? null
}

function evaluateCondition(
  expression: string,
  variables: DeploymentTemplateVariables
): boolean {
  const trimmed = expression.trim()
  if (trimmed.startsWith('not ')) {
    const name = trimmed.slice(4).trim()
    if (!IDENTIFIER.test(name)) {
      throw new Error(`Unsupported deployment template condition: ${trimmed}`)
    }
    const value = variable(variables, name)
    if (typeof value !== 'boolean') {
      throw new Error(
        `Deployment template condition is not boolean: ${trimmed}`
      )
    }
    return !value
  }
  if (IDENTIFIER.test(trimmed)) {
    const value = variable(variables, trimmed)
    if (typeof value !== 'boolean') {
      throw new Error(
        `Deployment template condition is not boolean: ${trimmed}`
      )
    }
    return value
  }

  const comparison = trimmed.match(COMPARISON)
  if (comparison === null) {
    throw new Error(`Unsupported deployment template condition: ${trimmed}`)
  }
  const name = regexCapture(comparison, 1)
  const operator = regexCapture(comparison, 2)
  const literal = regexCapture(comparison, 3)
  const equal = variable(variables, name) === parseLiteral(literal)
  return operator === '===' || operator === '==' ? equal : !equal
}

function renderExpression(
  expression: string,
  variables: DeploymentTemplateVariables
): string {
  const trimmed = expression.trim()
  if (IDENTIFIER.test(trimmed)) {
    const value = variable(variables, trimmed)
    const rendered = value === null ? '' : String(value)
    return trimmed === 'results' ? rendered : htmlEscape(rendered)
  }

  const ternary = trimmed.match(TERNARY)
  if (ternary === null) {
    throw new Error(`Unsupported deployment template expression: ${trimmed}`)
  }
  const whenTrue = regexCapture(ternary, 1)
  const condition = regexCapture(ternary, 2)
  const whenFalse = regexCapture(ternary, 3)
  const value = evaluateCondition(condition, variables)
    ? parseLiteral(whenTrue)
    : parseLiteral(whenFalse)
  return value === null ? '' : String(value)
}

export function renderDeploymentTemplate(
  template: string,
  variables: DeploymentTemplateVariables
): string {
  const tokenPattern = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/gu
  const frames: ConditionalFrame[] = []
  let active = true
  let cursor = 0
  let output = ''

  for (const match of template.matchAll(tokenPattern)) {
    const token = match[0]
    const index = match.index
    const text = template.slice(cursor, index)
    if (text.includes('{{') || text.includes('{%') || text.includes('{#')) {
      throw new Error('Malformed deployment template syntax')
    }
    if (active) output += text

    if (token.startsWith('{{')) {
      const rendered = renderExpression(token.slice(2, -2), variables)
      if (active) output += rendered
    } else {
      const statement = token.slice(2, -2).trim()
      if (statement.startsWith('if ')) {
        const frame: ConditionalFrame = {
          condition: evaluateCondition(statement.slice(3), variables),
          parentActive: active,
          seenElse: false
        }
        frames.push(frame)
        active = frame.parentActive && frame.condition
      } else if (statement === 'else') {
        const frame = frames.at(-1)
        if (frame === undefined || frame.seenElse) {
          throw new Error('Unexpected deployment template else statement')
        }
        frame.seenElse = true
        active = frame.parentActive && !frame.condition
      } else if (statement === 'endif') {
        const frame = frames.pop()
        if (frame === undefined) {
          throw new Error('Unexpected deployment template endif statement')
        }
        active = frame.parentActive
      } else {
        throw new Error(
          `Unsupported deployment template statement: ${statement}`
        )
      }
    }
    cursor = index + token.length
  }

  const remaining = template.slice(cursor)
  if (
    remaining.includes('{{') ||
    remaining.includes('{%') ||
    remaining.includes('{#')
  ) {
    throw new Error('Malformed deployment template syntax')
  }
  if (frames.length !== 0) {
    throw new Error('Unclosed deployment template if statement')
  }
  if (active) output += remaining
  return output
}
