import * as core from '@actions/core'
import {triggerCheck} from './functions/trigger-check'
import {contextCheck} from './functions/context-check'
import {reactEmote} from './functions/react-emote'
import * as github from '@actions/github'
import {context} from '@actions/github'

async function run(): Promise<void> {
  try {
    // Get the inputs for the branch-deploy Action
    const trigger: string = core.getInput('trigger')
    const reaction: string = core.getInput('reaction')
    const prefixOnly: boolean = core.getInput('prefix_only') === 'true'
    const token: string = core.getInput('github-token', {required: true})
    const body: string = context?.payload?.comment?.body

    // Check the context of the event to ensure it is valid
    if (!(await contextCheck(context))) {
      core.setFailed(
        'This Action can only be run in the context of a pull request comment or issue comment'
      )
      return
    }

    // Check if the comment body contains the trigger
    if (!(await triggerCheck(prefixOnly, body, trigger))) {
      core.info(`Comment body does not contain trigger phrase: ${trigger}`)
      return
    }

    // Create an octokit client
    const octokit = github.getOctokit(token)

    // Add the reaction to the issue_comment
    await reactEmote(reaction, context, octokit)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

// core.info(`context: ${JSON.stringify(context)}`)
