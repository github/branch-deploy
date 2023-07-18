import * as core from '@actions/core'
import dedent from 'dedent-js'

// The old and common trigger for noop style deployments
const oldNoopInput = '.deploy noop'
const docsLink =
  'https://github.com/github/branch-deploy/blob/main/docs/deprecated.md'
const thumbsDown = '-1'

// A helper function to check against common inputs to see if they are deprecated
// :param body: The content body of the message being checked (String)
// :param octokit: The octokit object
// :param context: The context of the action
// :returns: true if the input is deprecated, false otherwise
export async function isDeprecated(body, octokit, context) {
  // If the body of the payload starts with the common 'old noop' trigger, warn the user and exit
  if (body.startsWith(oldNoopInput)) {
    core.warning(
      `'${oldNoopInput}' is deprecated. Please view the docs for more information: ${docsLink}#deploy-noop`
    )

    const message = dedent(`
      ### Deprecated Input Detected

      ⚠️ Command is Deprecated ⚠️

      The \`${oldNoopInput}\` command is deprecated. The new default is now \`.noop\`. Please view the docs for more information: ${docsLink}#deploy-noop
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

    return true
  }

  // if we get here, the input is not deprecated
  return false
}
