import {postDeployMessage} from '../../src/functions/post-deploy-message'
import * as core from '@actions/core'
import dedent from 'dedent-js'

// const debugMock = jest.spyOn(core, 'debug')

var context
var environment
var environment_url
var environment_url_simple
var status
var noop
var ref

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'debug').mockImplementation(() => {})

  process.env.INPUT_TMP = "/home/runner/work/_temp"
  process.env.INPUT_ENVIRONMENT_URL_IN_COMMENT = 'true'
  process.env.INPUT_DEPLOY_MESSAGE_FILENAME = 'DEPLOYMENT_MESSAGE.md'

  environment = 'production'
  environment_url = 'https://example.com'
  environment_url_simple = 'example.com'
  status = 'success'
  noop = false
  ref = 'test-ref'

  context = {
    actor: 'monalisa',
    eventName: 'issue_comment',
    workflow: 'test-workflow',
    repo: {
      owner: 'corp',
      repo: 'test'
    },
    payload: {
      comment: {
        id: '1'
      }
    }
  }
})

test('successfully constructs a post deploy message with the defaults', async () => {
  expect(
    await postDeployMessage(
      context, // context
      environment, // environment
      environment_url, // environment_url
      status, // status
      noop, // noop
      ref // ref
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ✅

      **${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**

      > **Environment URL:** [${environment_url_simple}](${environment_url})
`)
  )
})
