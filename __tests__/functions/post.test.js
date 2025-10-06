import * as github from '@actions/github'
import {vi, expect, test, beforeEach} from 'vitest'
import * as core from '@actions/core'

import {post} from '../../src/functions/post.js'
import {COLORS} from '../../src/functions/colors.js'
import * as postDeploy from '../../src/functions/post-deploy.js'
import * as contextCheck from '../../src/functions/context-check.js'

const validBooleanInputs = {
  skip_completing: false
}
const validInputs = {
  status: 'success',
  successful_deploy_labels: '',
  successful_noop_labels: '',
  failed_deploy_labels: '',
  failed_noop_labels: '',
  skip_successful_noop_labels_if_approved: 'false',
  skip_successful_deploy_labels_if_approved: 'false'
}

const validStates = {
  sha: 'abc123',
  ref: 'test-ref',
  comment_id: '123',
  noop: 'false',
  deployment_id: '456',
  environment: 'production',
  token: 'test-token',
  approved_reviews_count: '1',
  environment_url: 'https://example.com',
  review_decision: 'APPROVED',
  fork: 'false',
  params: 'LOG_LEVEL=debug --config.db.host=localhost --config.db.port=5432',
  parsed_params: JSON.stringify({
    config: {db: {host: 'localhost', port: 5432}},
    _: ['LOG_LEVEL=debug']
  }),
  deployment_start_time: '2024-01-01T00:00:00Z'
}

const setFailedMock = vi.spyOn(core, 'setFailed').mockImplementation(() => {})
const setWarningMock = vi.spyOn(core, 'warning').mockImplementation(() => {})
const infoMock = vi.spyOn(core, 'info').mockImplementation(() => {})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(core, 'error').mockImplementation(() => {})
  vi.spyOn(core, 'debug').mockImplementation(() => {})
  vi.spyOn(core, 'getBooleanInput').mockImplementation(name => {
    return validBooleanInputs[name]
  })
  vi.spyOn(core, 'getInput').mockImplementation(name => {
    return validInputs[name]
  })
  vi.spyOn(core, 'getState').mockImplementation(name => {
    return validStates[name]
  })

  vi.spyOn(postDeploy, 'postDeploy').mockImplementation(() => {
    return undefined
  })

  vi.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return true
  })

  vi.spyOn(github, 'getOctokit').mockImplementation(() => {
    return true
  })
})

test('successfully runs post() Action logic', async () => {
  expect(await post()).toBeUndefined()
  expect(infoMock).toHaveBeenCalledWith(
    `🧑‍🚀 commit SHA: ${COLORS.highlight}${validStates.sha}${COLORS.reset}`
  )
})

test('successfully runs post() Action logic when environment_url is not defined', async () => {
  const noEnvironmentUrl = {
    environment_url: null
  }

  vi.spyOn(core, 'getState').mockImplementation(name => {
    return noEnvironmentUrl[name]
  })

  expect(await post()).toBeUndefined()
})

test('exits due to an invalid Actions context', async () => {
  vi.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return false
  })

  expect(await post()).toBeUndefined()
})

test('exits due to a bypass being set', async () => {
  const bypassed = {
    bypass: 'true'
  }
  vi.spyOn(core, 'getState').mockImplementation(name => {
    return bypassed[name]
  })
  expect(await post()).toBeUndefined()
  expect(setWarningMock).toHaveBeenCalledWith(
    `⛔ ${COLORS.highlight}bypass${COLORS.reset} set, exiting`
  )
})

test('skips the process of completing a deployment', async () => {
  const skipped = {
    skip_completing: 'true'
  }
  vi.spyOn(core, 'getBooleanInput').mockImplementation(name => {
    return skipped[name]
  })
  expect(await post()).toBeUndefined()
  expect(infoMock).toHaveBeenCalledWith(
    `⏩ ${COLORS.highlight}skip_completing${COLORS.reset} set, exiting`
  )
})

test('throws an error', async () => {
  try {
    vi.spyOn(github, 'getOctokit').mockImplementation(() => {
      throw new Error('test error')
    })
    await post()
  } catch (e) {
    expect(e.message).toBe('test error')
    expect(setFailedMock).toHaveBeenCalledWith('test error')
  }
})
