import * as core from '../actions-core.ts'
import {COLORS} from './colors.ts'
import {dedent} from './dedent.ts'
import {API_HEADERS} from './api-headers.ts'
import {getActionInput} from '../action-io.ts'
import {issueCommentContext} from '../trust-boundaries.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'
import {analyzeNakedCommand} from './issue-command.ts'
import type {NakedCommandAnalysis} from './issue-command.ts'

export interface NakedCommandOctokit {
  readonly rest: {
    readonly issues: Pick<
      BranchDeployOctokit['rest']['issues'],
      'createComment'
    >
    readonly reactions: Pick<
      BranchDeployOctokit['rest']['reactions'],
      'createForIssueComment'
    >
  }
}

const thumbsDown = '-1'
const docs =
  'https://github.com/github/branch-deploy/blob/main/docs/naked-commands.md'

// Helper function to check if a naked command was issued
// :param body: The body of the issueops command
// :param param_separator: The separator used to seperate the command from the parameters
// :param triggers: All the triggers for the Action rolled up into an Array
// :returns: true if a naked command was issued, false otherwise
export async function nakedCommandCheck(
  body: string,
  param_separator: string,
  triggers: readonly string[],
  octokit: NakedCommandOctokit,
  context: BranchDeployContext,
  analysis?: NakedCommandAnalysis
): Promise<boolean> {
  core.debug(`before - nakedCommandCheck: body: ${body}`)
  const globalFlag = getActionInput('global_lock_flag').trim()
  const result =
    analysis ?? analyzeNakedCommand(body, param_separator, triggers, globalFlag)
  body = result.body

  // ////// checking for lock flags ////////
  // if the body contains the globalFlag, exit right away as environments are not relevant
  if (result.globalBypass) {
    core.debug('global lock flag found in naked command check')
    return false
  }

  const params = result.params
  if (params !== '') {
    core.debug(
      `params were found and removed for naked command checks: ${params}`
    )
  }

  core.debug(`after - nakedCommandCheck: body: ${body}`)

  if (result.isNaked) {
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
      body: message,
      headers: API_HEADERS
    })

    // add a reaction to the issue_comment to indicate failure
    await octokit.rest.reactions.createForIssueComment({
      ...context.repo,
      comment_id: issueCommentContext(context).payload.comment.id,
      content: thumbsDown,
      headers: API_HEADERS
    })
  }

  return result.isNaked
}
