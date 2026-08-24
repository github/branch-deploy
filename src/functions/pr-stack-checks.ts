import {isDeepStrictEqual} from 'node:util'
import {API_HEADERS} from './api-headers.ts'
import type {BranchDeployOctokit} from '../types.ts'

type GetBranchRulesParameters = Parameters<
  BranchDeployOctokit['rest']['repos']['getBranchRules']
>[0]

export interface PrStackRequiredCheck {
  readonly context: string
  readonly appId: number | null
}

export interface PrStackRequiredChecksOctokit {
  readonly rest: {
    readonly repos: {
      readonly getBranchRules: (
        parameters?: GetBranchRulesParameters
      ) => Promise<{readonly data: unknown}>
    }
  }
}

interface RequiredChecksRequest {
  readonly owner: string
  readonly repo: string
  readonly stableBranch: string
  readonly stableSha: string
  readonly branch: unknown
}

function invalid(reason: string): never {
  throw new Error(`Cannot verify pull request stack required checks: ${reason}`)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) invalid('incomplete policy response')
  return value
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function array(value: unknown): readonly unknown[] {
  if (!isUnknownArray(value)) invalid('incomplete required-check inventory')
  return value
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    invalid('invalid string in policy response')
  }
  return value
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid('invalid classic protection state')
  return value
}

function sha(value: unknown): string {
  const result = string(value)
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(result)) {
    invalid('invalid stable commit SHA')
  }
  return result.toLowerCase()
}

function appId(value: unknown): number | null {
  if (value === null || value === -1) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    invalid('invalid required-check app ID')
  }
  return value
}

function requiredCheck(
  value: unknown,
  appKey: 'app_id' | 'integration_id'
): PrStackRequiredCheck {
  const result = record(value)
  const id = result[appKey]
  return {
    context: string(result['context']),
    appId: appKey === 'integration_id' && id === undefined ? null : appId(id)
  }
}

function classicChecks(
  request: RequiredChecksRequest
): readonly PrStackRequiredCheck[] {
  const branch = record(request.branch)
  if (
    string(branch['name']) !== request.stableBranch ||
    sha(record(branch['commit'])['sha']) !== sha(request.stableSha)
  ) {
    invalid('stable branch changed')
  }
  const protection = record(branch['protection'])
  const enabled = boolean(protection['enabled'])
  const policy = record(protection['required_status_checks'])
  const enforcement = policy['enforcement_level']
  if (
    enforcement !== 'off' &&
    enforcement !== 'non_admins' &&
    enforcement !== 'everyone'
  ) {
    invalid('invalid classic check enforcement')
  }
  const contexts = array(policy['contexts']).map(string)
  const checks = array(policy['checks']).map(value =>
    requiredCheck(value, 'app_id')
  )
  if (!enabled && enforcement !== 'off') {
    invalid('inconsistent classic protection state')
  }
  if (enforcement === 'off') return []

  const detailedContexts = new Set(checks.map(check => check.context))
  for (const context of contexts) {
    if (!detailedContexts.has(context)) checks.push({context, appId: null})
  }
  return checks
}

function rulesetChecks(value: unknown): readonly PrStackRequiredCheck[] {
  const rule = record(value)
  const type = string(rule['type'])
  if (type === 'workflows') {
    invalid('required workflows are not supported by this preview')
  }
  if (type !== 'required_status_checks') return []
  const parameters = record(rule['parameters'])
  return array(parameters['required_status_checks']).map(value =>
    requiredCheck(value, 'integration_id')
  )
}

function compareChecks(
  left: PrStackRequiredCheck,
  right: PrStackRequiredCheck
): number {
  if (left.context !== right.context) {
    return left.context < right.context ? -1 : 1
  }
  return (left.appId ?? 0) - (right.appId ?? 0)
}

export async function loadPrStackRequiredChecks(
  octokit: PrStackRequiredChecksOctokit,
  request: RequiredChecksRequest
): Promise<readonly PrStackRequiredCheck[]> {
  const checks = [...classicChecks(request)]
  const previousPages: (readonly unknown[])[] = []
  let page = 1
  while (true) {
    const response = await octokit.rest.repos.getBranchRules({
      owner: request.owner,
      repo: request.repo,
      branch: request.stableBranch,
      per_page: 100,
      page,
      headers: API_HEADERS
    })
    const rules = array(response.data)
    if (rules.length > 100) invalid('invalid ruleset page size')
    if (previousPages.some(previous => isDeepStrictEqual(previous, rules))) {
      invalid('ruleset pagination did not advance')
    }
    for (const rule of rules) checks.push(...rulesetChecks(rule))
    if (rules.length < 100) break
    previousPages.push(rules)
    page += 1
  }

  const unique = new Map<string, PrStackRequiredCheck>()
  for (const check of checks) {
    unique.set(`${String(check.appId)}:${check.context}`, check)
  }
  return [...unique.values()].sort(compareChecks)
}
