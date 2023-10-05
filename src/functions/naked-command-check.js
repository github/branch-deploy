import * as core from '@actions/core'
import {COLORS} from './colors'
import dedent from 'dedent-js'

const thumbsDown = '-1'
const docs = 'https://github.com/github/branch-deploy/blob/main/docs/naked-commands.md'

// Helper function to check if a naked command was issued
// :param body: The body of the issueops command
// :param param_separator: The separator used to seperate the command from the parameters
// :param triggers: All the triggers for the Action rolled up into an Array
// :returns: true if a naked command was issued, false otherwise
export async function nakedCommandCheck(body, param_separator, triggers, octokit, context) {
  body = body.trim()

  // first remove any params
  // Seperate the issueops command on the 'param_separator'
  var paramCheck = body.split(param_separator)
  paramCheck.shift() // remove everything before the 'param_separator'
  const params = paramCheck.join(param_separator) // join it all back together (in case there is another separator)
  // if there is anything after the 'param_separator'; output it, log it, and remove it from the body for env checks
  if (params !== '') {
    body = body.split(`${param_separator}${params}`)[0].trim()
  }

  // loop through all the triggers and check to see if the command is a naked command
  var nakedCommand = false
  for (const trigger of triggers) {
    if (body === trigger) {
      nakedCommand = true
      core.warning(
        `🩲 naked commands are ${COLORS.warning}not${COLORS.reset} allowed based on your configuration: ${COLORS.highlight}${body}${COLORS.reset}`
      )
      core.warning(
        `📚 view the documentation around ${COLORS.highlight}naked commands${COLORS.reset} to learn more: ${docs}`
      )


      const message = dedent(`
      ### Missing Explicit Environment

      This style of command is known as a "naked command" and is not allowed based on your configuration. "Naked commands" are commands that do not explicitly specify an environment, for example \`.deploy\` would be a "naked command" whereas \`.deploy production\` would not be.
    `)

    // add a comment to the issue with the message
    await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: context.issue.number,
      body: message
    })

    // add a reaction to the issue_comment to indicate failure
    await octokit.rest.reactions.createForIssueComment({
      ...context.repo,
      comment_id: context.payload.comment.id,
      content: thumbsDown
    })


      break
    }
  }

  return nakedCommand
}
