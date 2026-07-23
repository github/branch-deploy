import yargsParser from 'yargs-parser'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  ACTION_INPUT_KEYS,
  ACTION_OUTPUT_KEYS,
  ACTION_STATE_KEYS,
  BOOLEAN_ACTION_INPUT_KEYS,
  INTEGER_ACTION_INPUT_KEYS,
  type ActionInputKey,
  type BooleanActionInputKey,
  type IntegerActionInputKey,
  type ActionOutputKey,
  type ActionStateKey
} from '../src/action-io.ts'
import {
  LITERAL_ACTION_INPUT_KEYS,
  LITERAL_ACTION_INPUT_VALUES,
  type LiteralActionInputKey
} from '../src/functions/inputs.ts'
import type {ActionStatusRequest} from '../src/functions/action-status.ts'
import type {
  DeploymentEnvironmentRequest,
  EnvironmentTargetsRequest,
  LockEnvironmentRequest
} from '../src/functions/environment-targets.ts'
import type {LockRequest} from '../src/functions/lock.ts'
import type {
  InteractiveUnlockRequest,
  SilentUnlockRequest
} from '../src/functions/unlock.ts'
import {post} from '../src/functions/post.ts'
import {run} from '../src/main.ts'
import {OPERATION_REASON_CODES} from '../src/operation-result.ts'
import type {
  DeploymentConfirmationResult,
  LockResponse,
  OperationDecision,
  OperationReasonCode,
  OperationResultV1,
  PrecheckResult,
  RunResult
} from '../src/types.ts'
import type {Assert, Equal, Extends, Not} from './node-test-helpers.ts'

function assertType<Condition extends true>(
  condition: Assert<Condition>
): void {
  assert.strictEqual(condition, true)
}

test('action registries expose only their literal key unions', () => {
  assertType<Equal<(typeof ACTION_INPUT_KEYS)[number], ActionInputKey>>(true)
  assertType<Equal<(typeof ACTION_OUTPUT_KEYS)[number], ActionOutputKey>>(true)
  assertType<Equal<(typeof ACTION_STATE_KEYS)[number], ActionStateKey>>(true)
})

test('typed input registries expose exact ActionInputKey subsets', () => {
  type ExpectedBooleanInputKey =
    | 'allow_forks'
    | 'allow_non_default_target_branch_deployments'
    | 'allow_sha_deployments'
    | 'commit_verification'
    | 'deployment_confirmation'
    | 'disable_lock'
    | 'disable_naked_commands'
    | 'environment_url_in_comment'
    | 'merge_deploy_mode'
    | 'skip_completing'
    | 'skip_successful_deploy_labels_if_approved'
    | 'skip_successful_noop_labels_if_approved'
    | 'sticky_locks'
    | 'sticky_locks_for_noop'
    | 'unlock_on_merge_mode'
    | 'use_security_warnings'

  assertType<
    Equal<(typeof BOOLEAN_ACTION_INPUT_KEYS)[number], BooleanActionInputKey>
  >(true)
  assertType<Equal<BooleanActionInputKey, ExpectedBooleanInputKey>>(true)
  assertType<Extends<BooleanActionInputKey, ActionInputKey>>(true)
  assertType<
    Equal<(typeof INTEGER_ACTION_INPUT_KEYS)[number], IntegerActionInputKey>
  >(true)
  assertType<Equal<IntegerActionInputKey, 'deployment_confirmation_timeout'>>(
    true
  )
  assertType<Extends<IntegerActionInputKey, ActionInputKey>>(true)
  assertType<
    Equal<(typeof LITERAL_ACTION_INPUT_KEYS)[number], LiteralActionInputKey>
  >(true)
  assertType<
    Equal<LiteralActionInputKey, 'checks' | 'outdated_mode' | 'update_branch'>
  >(true)
  assertType<Extends<LiteralActionInputKey, ActionInputKey>>(true)
  assertType<
    Equal<
      (typeof LITERAL_ACTION_INPUT_VALUES)['update_branch'][number],
      'disabled' | 'force' | 'warn'
    >
  >(true)
  assertType<
    Equal<
      (typeof LITERAL_ACTION_INPUT_VALUES)['outdated_mode'][number],
      'default_branch' | 'pr_base' | 'strict'
    >
  >(true)
  assertType<
    Equal<
      (typeof LITERAL_ACTION_INPUT_VALUES)['checks'][number],
      'all' | 'required'
    >
  >(true)
})

test('state-machine results retain correlated discriminants', () => {
  assertType<Equal<Extract<PrecheckResult, {status: true}>['sha'], string>>(
    true
  )
  assertType<Equal<Extract<PrecheckResult, {status: false}>['sha'], undefined>>(
    true
  )
  assertType<
    Not<Equal<Extract<LockResponse, {status: 'owner'}>['lockData'], null>>
  >(true)
  assertType<
    Equal<Extract<LockResponse, {status: null | true}>['lockData'], null>
  >(true)
  assertType<
    Equal<(typeof OPERATION_REASON_CODES)[number], OperationReasonCode>
  >(true)
  assertType<Equal<OperationResultV1['schema_version'], 1>>(true)
  assertType<Equal<OperationResultV1['decision'], OperationDecision>>(true)
  assertType<
    Equal<DeploymentConfirmationResult, 'confirmed' | 'rejected' | 'timed_out'>
  >(true)
})

test('request objects select behavior through literal modes', () => {
  assertType<
    Equal<
      Extract<EnvironmentTargetsRequest, {mode: 'deployment'}>,
      DeploymentEnvironmentRequest
    >
  >(true)
  assertType<
    Equal<
      Extract<EnvironmentTargetsRequest, {mode: 'lock'}>,
      LockEnvironmentRequest
    >
  >(true)
  assertType<
    Equal<
      ActionStatusRequest['result'],
      'alternate-success' | 'failure' | 'success' | undefined
    >
  >(true)
  assertType<Equal<LockRequest['mode']['type'], 'acquire' | 'details'>>(true)
  assertType<Equal<InteractiveUnlockRequest['mode'], 'interactive'>>(true)
  assertType<Equal<SilentUnlockRequest['mode'], 'silent'>>(true)
})

test('entrypoints retain their literal result contracts', () => {
  assertType<Equal<Awaited<ReturnType<typeof run>>, RunResult>>(true)
  assertType<Equal<Awaited<ReturnType<typeof post>>, void>>(true)
})

test('local vendor declarations stay intentionally narrow', () => {
  assertType<Equal<Parameters<typeof yargsParser>[0], string>>(true)
  assertType<Equal<ReturnType<typeof yargsParser>['_'], (number | string)[]>>(
    true
  )
})
