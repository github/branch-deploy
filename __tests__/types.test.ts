import nunjucks from 'nunjucks'
import yargsParser from 'yargs-parser'
import {expectTypeOf, test} from 'vitest'
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
import type {LockResponse, PrecheckResult, RunResult} from '../src/types.ts'

test('action registries expose only their literal key unions', () => {
  expectTypeOf<
    (typeof ACTION_INPUT_KEYS)[number]
  >().toEqualTypeOf<ActionInputKey>()
  expectTypeOf<
    (typeof ACTION_OUTPUT_KEYS)[number]
  >().toEqualTypeOf<ActionOutputKey>()
  expectTypeOf<
    (typeof ACTION_STATE_KEYS)[number]
  >().toEqualTypeOf<ActionStateKey>()
})

test('typed input registries expose exact ActionInputKey subsets', () => {
  expectTypeOf<
    (typeof BOOLEAN_ACTION_INPUT_KEYS)[number]
  >().toEqualTypeOf<BooleanActionInputKey>()
  expectTypeOf<BooleanActionInputKey>().toEqualTypeOf<
    | 'allow_forks'
    | 'allow_non_default_target_branch_deployments'
    | 'allow_sha_deployments'
    | 'commit_verification'
    | 'deployment_confirmation'
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
  >()
  expectTypeOf<BooleanActionInputKey>().toExtend<ActionInputKey>()

  expectTypeOf<
    (typeof INTEGER_ACTION_INPUT_KEYS)[number]
  >().toEqualTypeOf<IntegerActionInputKey>()
  expectTypeOf<IntegerActionInputKey>().toEqualTypeOf<'deployment_confirmation_timeout'>()
  expectTypeOf<IntegerActionInputKey>().toExtend<ActionInputKey>()

  expectTypeOf<
    (typeof LITERAL_ACTION_INPUT_KEYS)[number]
  >().toEqualTypeOf<LiteralActionInputKey>()
  expectTypeOf<LiteralActionInputKey>().toEqualTypeOf<
    'checks' | 'outdated_mode' | 'update_branch'
  >()
  expectTypeOf<LiteralActionInputKey>().toExtend<ActionInputKey>()
  expectTypeOf<
    (typeof LITERAL_ACTION_INPUT_VALUES)['update_branch'][number]
  >().toEqualTypeOf<'disabled' | 'force' | 'warn'>()
  expectTypeOf<
    (typeof LITERAL_ACTION_INPUT_VALUES)['outdated_mode'][number]
  >().toEqualTypeOf<'default_branch' | 'pr_base' | 'strict'>()
  expectTypeOf<
    (typeof LITERAL_ACTION_INPUT_VALUES)['checks'][number]
  >().toEqualTypeOf<'all' | 'required'>()
})

test('state-machine results retain correlated discriminants', () => {
  expectTypeOf<
    Extract<PrecheckResult, {status: true}>['sha']
  >().toEqualTypeOf<string>()
  expectTypeOf<
    Extract<PrecheckResult, {status: false}>['sha']
  >().toEqualTypeOf<undefined>()
  expectTypeOf<
    Extract<LockResponse, {status: 'owner'}>['lockData']
  >().not.toEqualTypeOf<null>()
  expectTypeOf<
    Extract<LockResponse, {status: null | true}>['lockData']
  >().toEqualTypeOf<null>()
})

test('request objects select behavior through literal modes', () => {
  expectTypeOf<
    Extract<EnvironmentTargetsRequest, {mode: 'deployment'}>
  >().toEqualTypeOf<DeploymentEnvironmentRequest>()
  expectTypeOf<
    Extract<EnvironmentTargetsRequest, {mode: 'lock'}>
  >().toEqualTypeOf<LockEnvironmentRequest>()
  expectTypeOf<ActionStatusRequest['result']>().toEqualTypeOf<
    'alternate-success' | 'failure' | 'success' | undefined
  >()
  expectTypeOf<LockRequest['mode']['type']>().toEqualTypeOf<
    'acquire' | 'details'
  >()
  expectTypeOf<
    InteractiveUnlockRequest['mode']
  >().toEqualTypeOf<'interactive'>()
  expectTypeOf<SilentUnlockRequest['mode']>().toEqualTypeOf<'silent'>()
})

test('entrypoints retain their literal result contracts', () => {
  expectTypeOf<Awaited<ReturnType<typeof run>>>().toEqualTypeOf<RunResult>()
  expectTypeOf(post).returns.resolves.toBeVoid()
})

test('local vendor declarations stay intentionally narrow', () => {
  expectTypeOf<typeof nunjucks.configure>().parameter(0).toEqualTypeOf<{
    autoescape?: boolean
  }>()
  expectTypeOf<typeof nunjucks.render>().parameters.toEqualTypeOf<
    [path: string, context: Record<string, unknown>]
  >()
  expectTypeOf(yargsParser).parameter(0).toEqualTypeOf<string>()
  expectTypeOf(yargsParser)
    .returns.toHaveProperty('_')
    .toEqualTypeOf<(number | string)[]>()
})
