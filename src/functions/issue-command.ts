import {LOCK_METADATA} from './lock-metadata.ts'
import {triggerCheck} from './trigger-check.ts'

export interface IssueCommandConfig {
  readonly globalFlag: string
  readonly helpTrigger: string
  readonly lockInfoAlias: string
  readonly lockTrigger: string
  readonly noopTrigger: string
  readonly paramSeparator: string
  readonly trigger: string
  readonly unlockTrigger: string
}

export interface NakedCommandAnalysis {
  readonly body: string
  readonly globalBypass: boolean
  readonly isNaked: boolean
  readonly params: string
}

export interface IssueCommandAnalysis {
  readonly dispatch:
    | 'deployment'
    | 'help'
    | 'lock'
    | 'lock_info'
    | 'none'
    | 'unlock'
  readonly hasLockInfoFlag: boolean
  readonly matches: {
    readonly deploy: boolean
    readonly help: boolean
    readonly lock: boolean
    readonly lockInfoAlias: boolean
    readonly noop: boolean
    readonly unlock: boolean
  }
  readonly naked: NakedCommandAnalysis
  readonly operation:
    | 'deploy'
    | 'help'
    | 'lock'
    | 'lock_info'
    | 'none'
    | 'noop'
    | 'unlock'
  readonly outputType:
    | 'deploy'
    | 'help'
    | 'lock'
    | 'lock-info-alias'
    | 'unlock'
    | null
}

export function analyzeNakedCommand(
  body: string,
  paramSeparator: string,
  triggers: readonly string[],
  globalFlag: string
): NakedCommandAnalysis {
  let normalized = body.trim()
  if (normalized.includes(globalFlag)) {
    return {body: normalized, globalBypass: true, isNaked: false, params: ''}
  }

  for (const flag of LOCK_METADATA.lockInfoFlags) {
    normalized = normalized.replace(flag, '').trim()
  }
  if (normalized.includes('--reason')) {
    normalized = normalized.slice(0, normalized.indexOf('--reason')).trim()
  }

  const paramParts = normalized.split(paramSeparator)
  paramParts.shift()
  const params = paramParts.join(paramSeparator)
  if (params !== '') {
    normalized = normalized.split(`${paramSeparator}${params}`)[0]?.trim() ?? ''
  }

  return {
    body: normalized,
    globalBypass: false,
    isNaked: triggers.some(trigger => normalized === trigger),
    params
  }
}

export function analyzeIssueCommand(
  body: string,
  config: IssueCommandConfig
): IssueCommandAnalysis {
  const matches = {
    deploy: triggerCheck(body, config.trigger),
    noop: triggerCheck(body, config.noopTrigger),
    lock: triggerCheck(body, config.lockTrigger),
    unlock: triggerCheck(body, config.unlockTrigger),
    help: triggerCheck(body, config.helpTrigger),
    lockInfoAlias: triggerCheck(body, config.lockInfoAlias)
  }
  const hasLockInfoFlag = LOCK_METADATA.lockInfoFlags.some(flag =>
    body.includes(flag)
  )

  let operation: IssueCommandAnalysis['operation'] = 'none'
  let outputType: IssueCommandAnalysis['outputType'] = null
  if (matches.deploy || matches.noop) {
    operation = matches.noop ? 'noop' : 'deploy'
    outputType = 'deploy'
  } else if (matches.lock) {
    operation = hasLockInfoFlag ? 'lock_info' : 'lock'
    outputType = 'lock'
  } else if (matches.unlock) {
    operation = 'unlock'
    outputType = 'unlock'
  } else if (matches.help) {
    operation = 'help'
    outputType = 'help'
  } else if (matches.lockInfoAlias) {
    operation = 'lock_info'
    outputType = 'lock-info-alias'
  }

  const dispatch: IssueCommandAnalysis['dispatch'] = matches.help
    ? 'help'
    : matches.lock || matches.lockInfoAlias
      ? hasLockInfoFlag || matches.lockInfoAlias
        ? 'lock_info'
        : 'lock'
      : matches.unlock
        ? 'unlock'
        : matches.deploy || matches.noop
          ? 'deployment'
          : 'none'

  return {
    dispatch,
    hasLockInfoFlag,
    matches,
    naked: analyzeNakedCommand(
      body,
      config.paramSeparator,
      [
        config.trigger,
        config.noopTrigger,
        config.lockTrigger,
        config.unlockTrigger,
        config.lockInfoAlias
      ],
      config.globalFlag
    ),
    operation,
    outputType
  }
}
