import {postDeployMessage} from '../../src/functions/post-deploy-message'
import * as core from '@actions/core'
import dedent from 'dedent-js'

const debugMock = jest.spyOn(core, 'debug')

var context
var environment
var environment_url
var environment_url_simple
var status
var noop
var ref
var approved_reviews_count
var sha
var deployment_id
var data
var review_decision

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
  sha = 'abc123'
  approved_reviews_count = '4'
  deployment_id = 456
  review_decision = 'APPROVED'

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

  data = {
    environment: environment,
    environment_url: environment_url,
    status: status,
    noop: noop,
    ref: ref,
    sha: sha,
    approved_reviews_count: approved_reviews_count,
    deployment_id: deployment_id,
    review_decision: review_decision
  }
})

test('successfully constructs a post deploy message with the defaults', async () => {
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ✅

      **${context.actor}** successfully deployed branch \`${ref}\` to **${environment}**

      > **Environment URL:** [${environment_url_simple}](${environment_url})`)
  )
})

test('successfully constructs a post deploy message with the defaults during a "noop" deploy', async () => {
  data.noop = true
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ✅

      **${context.actor}** successfully **noop** deployed branch \`${ref}\` to **${environment}**`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment failure', async () => {
  data.status = 'failure'
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ❌

      **${context.actor}** had a failure when deploying branch \`${ref}\` to **${environment}**`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment with an unknown status', async () => {
  data.status = 'unknown'
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ⚠️

      Warning: deployment status is unknown, please use caution`)
  )
})

test('successfully constructs a post deploy message with the defaults during a deployment with an unknown status and the DEPLOY_MESSAGE_PATH is unset', async () => {
  process.env.INPUT_DEPLOY_MESSAGE_PATH = ''
  data.status = 'unknown'
  expect(
    await postDeployMessage(
      context, // context
      data
    )
  ).toStrictEqual(
    dedent(`
      ### Deployment Results ⚠️

      Warning: deployment status is unknown, please use caution`)
  )

  expect(debugMock).toHaveBeenCalledWith('deployMessagePath is not set - null')
})

test('successfully constructs a post deploy message with a custom env var', async () => {
  process.env.DEPLOY_MESSAGE = 'Deployed 1 shiny new server'

  expect(
    await postDeployMessage(
      context, // context
      data
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
      data
    )
  ).toStrictEqual(
    dedent(`### Deployment Results :rocket:

    The following variables are available to use in this template:

    - \`environment\` - The name of the environment (String)
    - \`environment_url\` - The URL of the environment (String) {Optional}
    - \`status\` - The status of the deployment (String) - \`success\`, \`failure\`, or \`unknown\`
    - \`noop\` - Whether or not the deployment is a noop (Boolean)
    - \`ref\` - The ref of the deployment (String)
    - \`sha\` - The exact commit SHA of the deployment (String)
    - \`actor\` - The GitHub username of the actor who triggered the deployment (String)
    - \`approved_reviews_count\` - The number of approved reviews on the pull request at the time of deployment (String of a number)
    - \`deployment_id\` - The ID of the deployment (String)
    - \`review_decision\` - The decision of the review (String or null) - \`"APPROVED"\`, \`"REVIEW_REQUIRED"\`, \`null\`, etc.

    Here is an example:

    monalisa deployed branch \`test-ref\` to the **production** environment. This deployment was a success :rocket:.

    The exact commit sha that was used for the deployment was \`${sha}\`.

    The exact deployment ID for this deployment was \`${deployment_id}\`.

    The review decision for this deployment was \`${review_decision}\`.

    You can view the deployment [here](https://example.com).



    > This deployment had \`4\` approvals.

    `)
  )
})
