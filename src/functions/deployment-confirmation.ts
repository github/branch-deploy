import * as core from '../actions-core.ts'
import {dedent} from './dedent.ts'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {timestamp} from './timestamp.ts'
import {
  issueCommentContext,
  legacyApiError,
  legacyReactionUser
} from '../trust-boundaries.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  DeploymentConfirmationData
} from '../types.ts'

const thumbsUp = '+1'
const thumbsDown = '-1'

type CreateCommentMethod =
  BranchDeployOctokit['rest']['issues']['createComment']
type CreateCommentParameters = Parameters<CreateCommentMethod>[0]
type FullCreateCommentResponse = Awaited<ReturnType<CreateCommentMethod>>
type UpdateCommentMethod =
  BranchDeployOctokit['rest']['issues']['updateComment']
type UpdateCommentParameters = Parameters<UpdateCommentMethod>[0]
type ListReactionsMethod =
  BranchDeployOctokit['rest']['reactions']['listForIssueComment']
type ListReactionsParameters = Parameters<ListReactionsMethod>[0]
type FullListReactionsResponse = Awaited<ReturnType<ListReactionsMethod>>
type Reaction = FullListReactionsResponse['data'][number]

export interface DeploymentConfirmationOctokit {
  readonly rest: {
    readonly issues: {
      readonly createComment: (
        parameters?: CreateCommentParameters
      ) => Promise<{
        readonly data: Pick<FullCreateCommentResponse['data'], 'id'>
      }>
      readonly updateComment: (
        parameters?: UpdateCommentParameters
      ) => Promise<unknown>
    }
    readonly reactions: {
      readonly listForIssueComment: (
        parameters?: ListReactionsParameters
      ) => Promise<{
        readonly data: readonly (Pick<Reaction, 'content'> & {
          readonly user: null | Pick<NonNullable<Reaction['user']>, 'login'>
        })[]
      }>
    }
  }
}

// Helper function to allow the original actor to confirm the deployment by adding a reaction to a comment
// :param context: The context of the action
// :param octokit: The octokit object
// :returns: true if the deployment has been confirmed by the original actor, false otherwise
export async function deploymentConfirmation(
  context: BranchDeployContext,
  octokit: DeploymentConfirmationOctokit,
  data: DeploymentConfirmationData
): Promise<boolean> {
  const issueComment = issueCommentContext(context)
  const message = dedent(`
    ### Deployment Confirmation Required 🚦

    In order to proceed with this deployment, __${context.actor}__ must react to this comment with either a 👍 or a 👎.

    - Commit: [\`${data.sha}\`](${data.commit_html_url})
    - Committer: \`${String(data.committer)}\` - **${data.isVerified ? 'verified' : 'unverified'}**
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
        "url": ${data.environmentUrl !== null && data.environmentUrl !== '' ? `"${data.environmentUrl}"` : 'null'}
      },
      "deployment": {
        "logs": "${data.log_url}"
      },
      "git": {
        "branch": "${data.ref}",
        "commit": "${data.sha}",
        "verified": ${data.isVerified},
        "committer": "${String(data.committer)}",
        "html_url": "${data.commit_html_url}"
      },
      "context": {
        "actor": "${context.actor}",
        "noop": ${data.noopMode},
        "fork": ${data.isFork},
        "comment": {
          "created_at": "${issueComment.payload.comment.created_at}",
          "updated_at": "${issueComment.payload.comment.updated_at}",
          "body": "${data.body}",
          "html_url": "${issueComment.payload.comment.html_url}"
        }
      },
      "parameters": {
        "raw": ${data.params !== null && data.params !== '' ? `"${data.params}"` : 'null'},
        "parsed": ${data.parsed_params !== null ? JSON.stringify(data.parsed_params) : 'null'}
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
    `⏰ waiting ${COLORS.highlight}${data.deployment_confirmation_timeout}${COLORS.reset} seconds for deployment confirmation`
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
        const reactionUser = legacyReactionUser(reaction.user)
        if (reactionUser.login === context.actor) {
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
            `ignoring reaction from ${reactionUser.login}, expected ${context.actor}`
          )
        }
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    } catch (error) {
      core.warning(
        `temporary failure when checking for reactions on the deployment confirmation comment: ${legacyApiError(error).message}`
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
