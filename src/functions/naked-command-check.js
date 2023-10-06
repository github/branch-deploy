import * as core from '@actions/core'
import {COLORS} from './colors'
import dedent from 'dedent-js'
import {LOCK_METADATA} from './lock-metadata'

const thumbsDown = '-1'
const docs =
  'https://github.com/github/branch-deploy/blob/main/docs/naked-commands.md'

// Helper function to check if a naked command was issued
// :param body: The body of the issueops command
// :param param_separator: The separator used to seperate the command from the parameters
// :param triggers: All the triggers for the Action rolled up into an Array
// :returns: true if a naked command was issued, false otherwise
export async function nakedCommandCheck(
  body,
  param_separator,
  triggers,
  octokit,
  context
) {
  var nakedCommand = false
  core.debug(`before - nakedCommandCheck: body: ${body}`)
  body = body.trim()

  // ////// checking for lock flags ////////
  // if the body contains the globalFlag, exit right away as environments are not relevant
  const globalFlag = core.getInput('global_lock_flag').trim()
  if (body.includes(globalFlag)) {
    core.debug('global lock flag found in naked command check')
    return nakedCommand
  }

  // remove any lock flags from the body
  LOCK_METADATA.lockInfoFlags.forEach(flag => {
    body = body.replace(flag, '').trim()
  })

  // remove the --reason <text> from the body if it exists
  if (body.includes('--reason')) {
    core.debug(
      `'--reason' found in comment body: ${body} - attempting to remove for naked command checks`
    )
    body = body.split('--reason')[0].trim()
    core.debug(`comment body after '--reason' removal: ${body}`)
  }
  ////////// end lock flag checks //////////

  // first remove any params
  // Seperate the issueops command on the 'param_separator'
  var paramCheck = body.split(param_separator)
  paramCheck.shift() // remove everything before the 'param_separator'
  const params = paramCheck.join(param_separator) // join it all back together (in case there is another separator)
  // if there is anything after the 'param_separator'; output it, log it, and remove it from the body for env checks
  if (params !== '') {
    body = body.split(`${param_separator}${params}`)[0].trim()
    core.debug(
      `params were found and removed for naked command checks: ${params}`
    )
  }

  core.debug(`after - nakedCommandCheck: body: ${body}`)

  // loop through all the triggers and check to see if the command is a naked command
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

      #### Suggestion

      \`\`\`text
      ${body} <environment>
      \`\`\`

      #### Explanation

      This style of command is known as a "naked command" and is not allowed based on your configuration. "Naked commands" are commands that do not explicitly specify an environment, for example \`${body}\` would be a "naked command" whereas \`${body} <environment>\` would not be.

      > View the [documentation](${docs}) to learn more
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
