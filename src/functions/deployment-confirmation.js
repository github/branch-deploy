import * as core from '@actions/core'
import dedent from 'dedent-js'
import {COLORS} from './colors'
import {API_HEADERS} from './api-headers'
import {timestamp} from './timestamp'

const thumbsUp = '+1'
const thumbsDown = '-1'

// Helper function to allow the original actor to confirm the deployment by adding a reaction to a comment
// :param context: The context of the action
// :param octokit: The octokit object
// :returns: true if the deployment has been confirmed by the original actor, false otherwise
export async function deploymentConfirmation(context, octokit, data) {
  const message = dedent(`
    ### Deployment Confirmation Required 🚦

    In order to proceed with this deployment, __${context.actor}__ must react to this comment with either a 👍 or a 👎.

    - Commit: [\`${data.sha}\`](${data.commit_html_url})
    - Committer: \`${data.committer}\` - **${data.isVerified ? 'verified' : 'unverified'}**
    - Environment: \`${data.environment}\`
    - Branch: \`${data.ref}\`
    - Deployment Type: \`${data.deploymentType}\`

    > You will have \`${data.deployment_confirmation_timeout}\` seconds to confirm this deployment ([logs](${data.log_url})).

    <details><summary>Details</summary>

    <!--- deployment-confirmation-metadata-start -->

    \`\`\`json
    {
      "type": "${data.deploymentType.toLowerCase()}",
      "environment": {
        "name": "${data.environment}",
        "url": ${data.environmentUrl ? `"${data.environmentUrl}"` : null}
      },
      "deployment": {
        "logs": "${data.log_url}"
      },
      "git": {
        "branch": "${data.ref}",
        "commit": "${data.sha}",
        "verified": ${data.isVerified},
        "committer": "${data.committer}",
        "html_url": "${data.commit_html_url}"
      },
      "context": {
        "actor": "${context.actor}",
        "noop": ${data.noopMode},
        "fork": ${data.isFork},
        "comment": {
          "created_at": "${context.payload.comment.created_at}",
          "updated_at": "${context.payload.comment.updated_at}",
          "body": "${data.body}",
          "html_url": "${context.payload.comment.html_url}"
        }
      },
      "parameters": {
        "raw": ${data.params ? `"${data.params}"` : null},
        "parsed": ${data.parsed_params ? `${JSON.stringify(data.parsed_params)}` : null}
      }
    }
    \`\`\`

    <!--- deployment-confirmation-metadata-end -->

    </details>
  `)

  const comment = await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: context.issue.number,
    body: message,
    headers: API_HEADERS
  })

  const commentId = comment.data.id
  core.debug(`deployment confirmation comment id: ${commentId}`)

  core.info(
    `🕒 waiting ${COLORS.highlight}${data.deployment_confirmation_timeout}${COLORS.reset} seconds for deployment confirmation`
  )

  // Convert timeout to milliseconds for setTimeout
  const timeoutMs = data.deployment_confirmation_timeout * 1000
  const startTime = Date.now()
  const pollInterval = 2000 // Check every 2 seconds

  // Poll for reactions until we find a valid one or timeout
  while (Date.now() - startTime < timeoutMs) {
    try {
      // Get all reactions on the confirmation comment
      const reactions = await octokit.rest.reactions.listForIssueComment({
        ...context.repo,
        comment_id: commentId,
        headers: API_HEADERS
      })

      // Look for thumbs up or thumbs down from the original actor
      for (const reaction of reactions.data) {
        if (reaction.user.login === context.actor) {
          if (reaction.content === thumbsUp) {
            // Update confirmation comment with success message
            await octokit.rest.issues.updateComment({
              ...context.repo,
              comment_id: commentId,
              body: `${message}\n\n✅ Deployment confirmed by __${context.actor}__ at \`${timestamp()}\` UTC.`,
              headers: API_HEADERS
            })

            core.info(
              `✅ deployment confirmed by ${COLORS.highlight}${context.actor}${COLORS.reset} - sha: ${COLORS.highlight}${data.sha}${COLORS.reset}`
            )

            return true
          } else if (reaction.content === thumbsDown) {
            // Update confirmation comment with cancellation message
            await octokit.rest.issues.updateComment({
              ...context.repo,
              comment_id: commentId,
              body: `${message}\n\n❌ Deployment rejected by __${context.actor}__ at \`${timestamp()}\` UTC.`,
              headers: API_HEADERS
            })

            core.setFailed(
              `❌ deployment rejected by ${COLORS.highlight}${context.actor}${COLORS.reset}`
            )

            return false
          } else {
            core.debug(`ignoring reaction: ${reaction.content}`)
          }
        } else {
          core.debug(
            `ignoring reaction from ${reaction.user.login}, expected ${context.actor}`
          )
        }
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    } catch (error) {
      core.warning(
        `temporary failure when checking for reactions on the deployment confirmation comment: ${error.message}`
      )
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }

  // Timeout reached without confirmation
  await octokit.rest.issues.updateComment({
    ...context.repo,
    comment_id: commentId,
    body: `${message}\n\n⏱️ Deployment confirmation timed out after \`${data.deployment_confirmation_timeout}\` seconds. The deployment request has been rejected at \`${timestamp()}\` UTC.`,
    headers: API_HEADERS
  })

  core.setFailed(
    `⏱️ deployment confirmation timed out after ${COLORS.highlight}${data.deployment_confirmation_timeout}${COLORS.reset} seconds`
  )
  return false
}
