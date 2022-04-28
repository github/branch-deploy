import * as core from '@actions/core'
// import {wait} from './wait'
// import * as GitHub from '@actions/github'

async function run(): Promise<void> {
  try {
    const trigger: string = core.getInput('trigger')
    const reaction: string = core.getInput('reaction')
    const token: string = core.getInput('github-token', {required: true})

    core.info(`trigger: ${trigger}`)
    core.info(`reaction: ${reaction}`)

    core.setOutput('triggered', 'true')
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
