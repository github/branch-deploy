import * as github from '@actions/github'
import {createOctokit} from '../test-helpers.ts'
import {unsafeInvalidValue} from '../unsafe-fixtures.ts'
import {vi, expect, test, beforeEach} from 'vitest'
import * as core from '../../src/actions-core.ts'
import * as actionIo from '../../src/action-io.ts'
import type {ActionInputKey, ActionStateKey} from '../../src/action-io.ts'

import {post} from '../../src/functions/post.ts'
import {COLORS} from '../../src/functions/colors.ts'
import * as postDeploy from '../../src/functions/post-deploy.ts'
import * as contextCheck from '../../src/functions/context-check.ts'

vi.mock(import('@actions/github'), {spy: true})

const validBooleanInputs: Partial<Record<ActionInputKey, boolean>> = {
  skip_completing: false
}
const validInputs: Partial<Record<ActionInputKey, string>> = {
  status: 'success',
  successful_deploy_labels: '',
  successful_noop_labels: '',
  failed_deploy_labels: '',
  failed_noop_labels: '',
  skip_successful_noop_labels_if_approved: 'false',
  skip_successful_deploy_labels_if_approved: 'false'
}

const validStates: Record<ActionStateKey, string> = {
  actionsToken: 'test-token',
  bypass: 'false',
  sha: 'abc123',
  ref: 'test-ref',
  comment_id: '123',
  reaction_id: '12345',
  noop: 'false',
  deployment_id: '456',
  environment: 'production',
  approved_reviews_count: '1',
  environment_url: 'https://example.com',
  review_decision: 'APPROVED',
  fork: 'false',
  commit_verified: 'false',
  initial_comment_id: '123',
  isPost: 'true',
  params: 'LOG_LEVEL=debug --config.db.host=localhost --config.db.port=5432',
  parsed_params: JSON.stringify({
    config: {db: {host: 'localhost', port: 5432}},
    _: ['LOG_LEVEL=debug']
  }),
  deployment_start_time: '2024-01-01T00:00:00Z'
}

const setFailedMock = vi.spyOn(core, 'setFailed')
const setWarningMock = vi.spyOn(core, 'warning')
const infoMock = vi.spyOn(core, 'info')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(core, 'error')
  vi.spyOn(core, 'debug')
  vi.spyOn(actionIo, 'getBooleanActionInput').mockImplementation(name => {
    return validBooleanInputs[name] ?? false
  })
  vi.spyOn(actionIo, 'getActionInput').mockImplementation(name => {
    return validInputs[name] ?? ''
  })
  vi.spyOn(actionIo, 'getActionState').mockImplementation(name => {
    return validStates[name]
  })

  vi.spyOn(postDeploy, 'postDeploy').mockResolvedValue(undefined)

  vi.spyOn(contextCheck, 'contextCheck').mockReturnValue(true)

  vi.spyOn(github, 'getOctokit').mockReturnValue(createOctokit())
})

test('successfully runs post() Action logic', async () => {
  await expect(post()).resolves.toBeUndefined()
  expect(infoMock).toHaveBeenCalledWith(
    `🧑‍🚀 commit SHA: ${COLORS.highlight}${validStates.sha}${COLORS.reset}`
  )
})

test('successfully runs post() Action logic when environment_url is not defined', async () => {
  vi.spyOn(actionIo, 'getActionState').mockImplementation(name => {
    return name === 'environment_url'
      ? unsafeInvalidValue<string>(null)
      : validStates[name]
  })

  await expect(post()).resolves.toBeUndefined()
  expect(core.debug).toHaveBeenCalledWith(
    'environment_url not set, its value is null'
  )
})

test('exits due to an invalid Actions context', async () => {
  vi.spyOn(contextCheck, 'contextCheck').mockReturnValue(false)

  await expect(post()).resolves.toBeUndefined()
})

test('exits due to a bypass being set', async () => {
  const bypassed: Partial<Record<ActionStateKey, string>> = {
    bypass: 'true'
  }
  vi.spyOn(actionIo, 'getActionState').mockImplementation(name => {
    return bypassed[name] ?? validStates[name]
  })
  await expect(post()).resolves.toBeUndefined()
  expect(setWarningMock).toHaveBeenCalledWith(
    `⛔ ${COLORS.highlight}bypass${COLORS.reset} set, exiting`
  )
})

test('skips the process of completing a deployment', async () => {
  const skipped: Partial<Record<ActionInputKey, boolean>> = {
    skip_completing: true
  }
  vi.spyOn(actionIo, 'getBooleanActionInput').mockImplementation(name => {
    return skipped[name] ?? validBooleanInputs[name] ?? false
  })
  await expect(post()).resolves.toBeUndefined()
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ ${COLORS.highlight}skip_completing${COLORS.reset} set, exiting`
  )
})

test('reports an error', async () => {
  vi.spyOn(github, 'getOctokit').mockImplementation(() => {
    throw new Error('test error')
  })

  await expect(post()).resolves.toBeUndefined()
  expect(setFailedMock).toHaveBeenCalledWith('test error')
})
