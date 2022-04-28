import * as core from '@actions/core'
import {context} from '@actions/github'
import {triggerCheck} from './trigger-check'

async function run(): Promise<void> {
  try {
    const trigger: string = core.getInput('trigger')
    const reaction: string = core.getInput('reaction')
    const prefixOnly: boolean = core.getInput('prefix_only') === 'true'
    const token: string = core.getInput('github-token', {required: true})
    const body: string = context?.payload?.comment?.body

    const triggerResult = await triggerCheck(prefixOnly, body, trigger)

    core.info(`prefixOnly: ${prefixOnly}`)
    core.info(`triggerResult: ${triggerResult}`)
    core.setOutput('comment_body', body)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

// core.info(`context: ${JSON.stringify(context)}`)
