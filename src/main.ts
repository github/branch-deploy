import * as core from '@actions/core'
import {context} from '@actions/github'
// import {wait} from './wait'

async function run(): Promise<void> {
  try {
    const trigger: string = core.getInput('trigger')
    const reaction: string = core.getInput('reaction')
    const token: string = core.getInput('github-token', {required: true})
    const body: string = context?.payload?.comment?.body

    // core.info(`context: ${JSON.stringify(context)}`)

    core.setOutput('triggered', 'true')
    core.setOutput('comment_body', body)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
