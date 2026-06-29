import {randomUUID} from 'node:crypto'
import {appendFileSync, existsSync} from 'node:fs'
import {EOL} from 'node:os'

export interface InputOptions {
  required?: boolean
  trimWhitespace?: boolean
}

const TRUE_INPUTS = ['true', 'True', 'TRUE'] as const
const FALSE_INPUTS = ['false', 'False', 'FALSE'] as const

function toCommandValue(input: string | undefined): string
function toCommandValue(input: unknown): string | undefined
function toCommandValue(input: unknown): string | undefined {
  if (input === null || input === undefined) {
    return ''
  }
  if (typeof input === 'string' || input instanceof String) {
    return String(input)
  }
  return JSON.stringify(input)
}

function escapeData(input: string | undefined): string {
  return toCommandValue(input)
    .replace(/%/gu, '%25')
    .replace(/\r/gu, '%0D')
    .replace(/\n/gu, '%0A')
}

function escapeProperty(input: string): string {
  return escapeData(input).replace(/:/gu, '%3A').replace(/,/gu, '%2C')
}

function issueCommand(
  command: string,
  name: string | undefined,
  message: string | undefined
): void {
  const property =
    name !== undefined && name !== '' ? ` name=${escapeProperty(name)}` : ''
  process.stdout.write(`::${command}${property}::${escapeData(message)}${EOL}`)
}

function prepareKeyValueMessage(key: string, value: unknown): string {
  const delimiter = `ghadelimiter_${randomUUID()}`
  const convertedValue = toCommandValue(value)

  if (key.includes(delimiter)) {
    throw new Error(
      `Unexpected input: name should not contain the delimiter "${delimiter}"`
    )
  }
  if (convertedValue === undefined) {
    throw new TypeError(
      "Cannot read properties of undefined (reading 'includes')"
    )
  }
  if (convertedValue.includes(delimiter)) {
    throw new Error(
      `Unexpected input: value should not contain the delimiter "${delimiter}"`
    )
  }

  return `${key}<<${delimiter}${EOL}${convertedValue}${EOL}${delimiter}`
}

function issueFileCommand(filePath: string, message: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Missing file at path: ${filePath}`)
  }
  appendFileSync(filePath, `${message}${EOL}`, {encoding: 'utf8'})
}

export function getInput(name: string, options?: InputOptions): string {
  const value =
    process.env[`INPUT_${name.replace(/ /gu, '_').toUpperCase()}`] ?? ''

  if (options?.required === true && value === '') {
    throw new Error(`Input required and not supplied: ${name}`)
  }
  return options?.trimWhitespace === false ? value : value.trim()
}

export function getBooleanInput(name: string, options?: InputOptions): boolean {
  const value = getInput(name, options)

  if (TRUE_INPUTS.some(input => input === value)) {
    return true
  }
  if (FALSE_INPUTS.some(input => input === value)) {
    return false
  }
  throw new TypeError(
    `Input does not meet YAML 1.2 "Core Schema" specification: ${name}\n` +
      'Support boolean input list: `true | True | TRUE | false | False | FALSE`'
  )
}

export function setOutput(name: string, value: unknown): void {
  const filePath = process.env['GITHUB_OUTPUT'] ?? ''
  if (filePath !== '') {
    issueFileCommand(filePath, prepareKeyValueMessage(name, value))
    return
  }

  process.stdout.write(EOL)
  issueCommand('set-output', name, toCommandValue(value))
}

export function saveState(name: string, value: unknown): void {
  const filePath = process.env['GITHUB_STATE'] ?? ''
  if (filePath !== '') {
    issueFileCommand(filePath, prepareKeyValueMessage(name, value))
    return
  }

  issueCommand('save-state', name, toCommandValue(value))
}

export function getState(name: string): string {
  return process.env[`STATE_${name}`] ?? ''
}

export function debug(message: string): void {
  issueCommand('debug', undefined, message)
}

export function info(message: string): void {
  process.stdout.write(`${message}${EOL}`)
}

export function warning(message: string | Error): void {
  issueCommand(
    'warning',
    undefined,
    message instanceof Error ? message.toString() : message
  )
}

export function error(message: string | Error): void {
  issueCommand(
    'error',
    undefined,
    message instanceof Error ? message.toString() : message
  )
}

export function setFailed(message: string | Error): void {
  process.exitCode = 1
  error(message)
}
