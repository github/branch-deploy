import {Buffer} from 'node:buffer'
import {URL} from 'node:url'
import type {
  CompletionContext,
  CompletionMetadata,
  CompletionSettings,
  DeploymentResult
} from '../types.ts'

export const MAX_COMPLETION_CONTEXT_BYTES = 64 * 1024

const METADATA_KEYS = [
  'schema_version',
  'repository',
  'run_id',
  'run_attempt',
  'issue_number',
  'trigger_comment_id',
  'trusted_sha',
  'lock_ref_sha',
  'disable_lock'
] as const satisfies readonly (keyof CompletionMetadata)[]

const CONTEXT_KEYS = [
  ...METADATA_KEYS,
  'started_comment_id',
  'deployment_id',
  'reaction_id',
  'noop',
  'ref',
  'sha',
  'environment',
  'environment_url',
  'actor',
  'fork',
  'commit_verified',
  'deployment_start_time',
  'approved_reviews_count',
  'review_decision',
  'params',
  'parsed_params',
  'settings'
] as const satisfies readonly (keyof CompletionContext)[]

const SETTINGS_KEYS = [
  'deploy_message_path',
  'environment_url_in_comment',
  'successful_deploy_labels',
  'failed_deploy_labels',
  'successful_noop_labels',
  'failed_noop_labels',
  'skip_successful_noop_labels_if_approved',
  'skip_successful_deploy_labels_if_approved'
] as const satisfies readonly (keyof CompletionSettings)[]

const RESULT_PRIORITY = {
  success: 0,
  skipped: 1,
  failure: 2,
  cancelled: 3
} as const satisfies Record<DeploymentResult, number>

function invalid(field: string): never {
  throw new Error(`Invalid ${field}`)
}

function checkSize(value: string, field: string): void {
  if (Buffer.byteLength(value, 'utf8') > MAX_COMPLETION_CONTEXT_BYTES) {
    throw new Error(`${field} exceeds the maximum size`)
  }
}

function parseJson(value: string, field: string): unknown {
  checkSize(value, field)
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed
  } catch {
    throw new Error(`${field} must contain valid JSON`)
  }
}

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || isArray(value))
    return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  field: string
): Record<string, unknown> {
  if (!isRecord(value)) invalid(field)
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every(key => Object.hasOwn(value, key))
  ) {
    invalid(`${field} fields`)
  }
  return value
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(field)
  return value
}

function nonemptyString(value: unknown, field: string): string {
  const result = stringValue(value, field)
  if (result.length === 0) invalid(field)
  return result
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(field)
  return value
}

function positiveId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    invalid(field)
  }
  return value
}

function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : positiveId(value, field)
}

function shaValue(value: unknown, field: string): string {
  const sha = stringValue(value, field)
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(sha)) invalid(field)
  return sha
}

function readMetadata(value: Record<string, unknown>): CompletionMetadata {
  if (value['schema_version'] !== 1) invalid('context schema_version')
  const repository = nonemptyString(value['repository'], 'repository')
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(repository)) invalid('repository')
  return {
    schema_version: 1,
    repository,
    run_id: positiveId(value['run_id'], 'run_id'),
    run_attempt: positiveId(value['run_attempt'], 'run_attempt'),
    issue_number: positiveId(value['issue_number'], 'issue_number'),
    trigger_comment_id: positiveId(
      value['trigger_comment_id'],
      'trigger_comment_id'
    ),
    trusted_sha: shaValue(value['trusted_sha'], 'trusted_sha'),
    lock_ref_sha:
      value['lock_ref_sha'] === null
        ? null
        : shaValue(value['lock_ref_sha'], 'lock_ref_sha'),
    disable_lock: booleanValue(value['disable_lock'], 'disable_lock')
  }
}

function readSettings(value: unknown): CompletionSettings {
  const settings = exactRecord(value, SETTINGS_KEYS, 'context settings')
  return {
    deploy_message_path: stringValue(
      settings['deploy_message_path'],
      'deploy_message_path'
    ),
    environment_url_in_comment: stringValue(
      settings['environment_url_in_comment'],
      'environment_url_in_comment'
    ),
    successful_deploy_labels: stringValue(
      settings['successful_deploy_labels'],
      'successful_deploy_labels'
    ),
    failed_deploy_labels: stringValue(
      settings['failed_deploy_labels'],
      'failed_deploy_labels'
    ),
    successful_noop_labels: stringValue(
      settings['successful_noop_labels'],
      'successful_noop_labels'
    ),
    failed_noop_labels: stringValue(
      settings['failed_noop_labels'],
      'failed_noop_labels'
    ),
    skip_successful_noop_labels_if_approved: stringValue(
      settings['skip_successful_noop_labels_if_approved'],
      'skip_successful_noop_labels_if_approved'
    ),
    skip_successful_deploy_labels_if_approved: stringValue(
      settings['skip_successful_deploy_labels_if_approved'],
      'skip_successful_deploy_labels_if_approved'
    )
  }
}

function timestampValue(value: unknown): string {
  const timestamp = stringValue(value, 'deployment_start_time')
  const parsed = new Date(timestamp)
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== timestamp
  ) {
    invalid('deployment_start_time')
  }
  return timestamp
}

export function parseCompletionMetadata(value: unknown): CompletionMetadata {
  return readMetadata(exactRecord(value, METADATA_KEYS, 'completion metadata'))
}

export function completionMetadata(
  context: CompletionContext
): CompletionMetadata {
  return {
    schema_version: context.schema_version,
    repository: context.repository,
    run_id: context.run_id,
    run_attempt: context.run_attempt,
    issue_number: context.issue_number,
    trigger_comment_id: context.trigger_comment_id,
    trusted_sha: context.trusted_sha,
    lock_ref_sha: context.lock_ref_sha,
    disable_lock: context.disable_lock
  }
}

export function parseCompletionContext(serialized: string): CompletionContext {
  const value = exactRecord(
    parseJson(serialized, 'context'),
    CONTEXT_KEYS,
    'context'
  )
  const noop = booleanValue(value['noop'], 'noop')
  const deploymentId = nullableId(value['deployment_id'], 'deployment_id')
  if (noop !== (deploymentId === null))
    invalid('noop/deployment_id combination')
  const parsedParams = stringValue(value['parsed_params'], 'parsed_params')
  if (
    parsedParams !== '' &&
    !isRecord(parseJson(parsedParams, 'parsed_params'))
  ) {
    invalid('parsed_params object')
  }
  return {
    ...readMetadata(value),
    started_comment_id: positiveId(
      value['started_comment_id'],
      'started_comment_id'
    ),
    deployment_id: deploymentId,
    reaction_id: nullableId(value['reaction_id'], 'reaction_id'),
    noop,
    ref: nonemptyString(value['ref'], 'ref'),
    sha: shaValue(value['sha'], 'sha'),
    environment: nonemptyString(value['environment'], 'environment'),
    environment_url:
      value['environment_url'] === null
        ? null
        : stringValue(value['environment_url'], 'environment_url'),
    actor: nonemptyString(value['actor'], 'actor'),
    fork: booleanValue(value['fork'], 'fork'),
    commit_verified: booleanValue(value['commit_verified'], 'commit_verified'),
    deployment_start_time: timestampValue(value['deployment_start_time']),
    approved_reviews_count: stringValue(
      value['approved_reviews_count'],
      'approved_reviews_count'
    ),
    review_decision: stringValue(value['review_decision'], 'review_decision'),
    params: stringValue(value['params'], 'params'),
    parsed_params: parsedParams,
    settings: readSettings(value['settings'])
  }
}

export function serializeCompletionContext(
  context: CompletionContext
): string | null {
  const settings: Record<string, string> = {}
  for (const key of SETTINGS_KEYS) settings[key] = context.settings[key]
  const value: Record<string, unknown> = {}
  for (const key of CONTEXT_KEYS) {
    value[key] = key === 'settings' ? settings : context[key]
  }
  const serialized = JSON.stringify(value)
  return Buffer.byteLength(serialized, 'utf8') > MAX_COMPLETION_CONTEXT_BYTES
    ? null
    : serialized
}

function isDeploymentResult(value: unknown): value is DeploymentResult {
  return (
    value === 'success' ||
    value === 'failure' ||
    value === 'cancelled' ||
    value === 'skipped'
  )
}

export function parseJobResults(serialized: string): DeploymentResult {
  const values = parseJson(serialized, 'job_results')
  if (!isArray(values) || values.length === 0) invalid('job_results array')
  let result: DeploymentResult = 'success'
  for (const value of values) {
    if (!isDeploymentResult(value)) invalid('job_results value')
    if (RESULT_PRIORITY[value] > RESULT_PRIORITY[result]) result = value
  }
  return result
}

export function validateResultUrl(value: string): string {
  checkSize(value, 'result_url')
  if (
    !/^https:\/\//iu.test(value) ||
    /[\s\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    invalid(
      'result_url: expected an HTTPS URL without credentials or control characters'
    )
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    invalid('result_url: expected a valid HTTPS URL')
  }
  if (url.username !== '' || url.password !== '') {
    invalid('result_url: credentials are not allowed')
  }
  return value
}
