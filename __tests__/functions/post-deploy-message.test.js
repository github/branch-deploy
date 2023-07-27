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

  process.env.DEPLOY_MESSAGE = null
  process.env.INPUT_ENVIRONMENT_URL_IN_COMMENT = 'true'
  process.env.INPUT_DEPLOY_MESSAGE_PATH = '.github/deployment_message.md'

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

      > **Environment URL:** [${environment_url_simple}](${environment_url})`)
  )
})

test('successfully constructs a post deploy message with the defaults during a "noop" deploy', async () => {
  expect(
    await postDeployMessage(
      context, // context
      environment, // environment
      environment_url, // environment_url
      status, // status
      true, // noop
      ref // ref
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ✅

      **${context.actor}** successfully **noop** deployed branch \`${ref}\` to **${environment}**`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment failure', async () => {
  expect(
    await postDeployMessage(
      context, // context
      environment, // environment
      environment_url, // environment_url
      'failure', // status
      noop, // noop
      ref // ref
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ❌

      **${context.actor}** had a failure when deploying branch \`${ref}\` to **${environment}**`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment with an unknown status', async () => {
  expect(
    await postDeployMessage(
      context, // context
      environment, // environment
      environment_url, // environment_url
      'unknown', // status
      noop, // noop
      ref // ref
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ⚠️

      Warning: deployment status is unknown, please use caution`)
  )
})

test('successfully constructs a post deploy message with a custom env var', async () => {
  process.env.DEPLOY_MESSAGE = 'Deployed 1 shiny new server'

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

      <details><summary>Show Results</summary>

      Deployed 1 shiny new server

      </details>

      > **Environment URL:** [${environment_url_simple}](${environment_url})`)
  )
})

test('successfully constructs a post deploy message with a custom markdown file', async () => {
  process.env.INPUT_DEPLOY_MESSAGE_PATH =
    '__tests__/templates/test_deployment_message.md'
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
    dedent(`### Deployment Results :rocket:

    The following variables are available to use in this template:

    - \`environment\` - The name of the environment (String)
    - \`environment_url\` - The URL of the environment (String) {Optional}
    - \`status\` - The status of the deployment (String) - \`success\`, \`failure\`, or \`unknown\`
    - \`noop\` - Whether or not the deployment is a noop (Boolean)
    - \`ref\` - The ref of the deployment (String)
    - \`actor\` - The GitHub username of the actor who triggered the deployment (String)

    Here is an example:

    monalisa deployed branch \`test-ref\` to the **production** environment. This deployment was a success :rocket:.

    You can view the deployment [here](https://example.com).



    `)
  )
})
