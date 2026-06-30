import * as core from '../actions-core.ts'
import {dedent} from './dedent.ts'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {timestamp} from './timestamp.ts'
import {jsonCodeBlock} from './json-code-block.ts'
import {issueCommentContext, legacyApiError} from '../trust-boundaries.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  DeploymentConfirmationData,
  DeploymentConfirmationResult
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
// :returns: the original actor's confirmation decision or a timeout result
export async function deploymentConfirmation(
  context: BranchDeployContext,
  octokit: DeploymentConfirmationOctokit,
  data: DeploymentConfirmationData
): Promise<DeploymentConfirmationResult> {
  const issueComment = issueCommentContext(context)
  const metadata = {
    type: data.deploymentType.toLowerCase(),
    environment: {
      name: data.environment,
      url:
        data.environmentUrl !== null && data.environmentUrl !== ''
          ? data.environmentUrl
          : null
    },
    deployment: {
      logs: data.log_url
    },
    git: {
      branch: data.ref,
      commit: data.sha,
      verified: data.isVerified,
      committer: String(data.committer),
      html_url: data.commit_html_url
    },
    context: {
      actor: context.actor,
      noop: data.noopMode,
      fork: data.isFork,
      comment: {
        created_at: issueComment.payload.comment.created_at,
        updated_at: issueComment.payload.comment.updated_at,
        body: data.body,
        html_url: issueComment.payload.comment.html_url
      }
    },
    parameters: {
      raw: data.params !== null && data.params !== '' ? data.params : null,
      parsed: data.parsed_params
    }
  }
  const metadataBlock = jsonCodeBlock(metadata)
  const messageHeader = dedent(`
    ### Deployment Confirmation Required 🚦

    In order to proceed with this deployment, __${context.actor}__ must react to this comment with either a 👍 or a 👎.

    - Commit: [\`${data.sha}\`](${data.commit_html_url})
    - Committer: \`${String(data.committer)}\` - **${data.isVerified ? 'verified' : 'unverified'}**
    - Environment: \`${data.environment}\`
    - Branch: \`${data.ref}\`
    - Deployment Type: \`${data.deploymentType}\`

    > You will have \`${data.deployment_confirmation_timeout}\` seconds to confirm this deployment ([logs](${data.log_url})).

  `)
  const message = [
    messageHeader,
    '',
    '<details><summary>Details</summary>',
    '',
    '<!--- deployment-confirmation-metadata-start -->',
    '',
    metadataBlock,
    '',
    '<!--- deployment-confirmation-metadata-end -->',
    '',
    '</details>'
  ].join('\n')

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
  const deadline = startTime + timeoutMs
  let pollInterval = 2000
  let firstPoll = true

  // Poll for reactions until we find a valid one or timeout
  while (firstPoll || Date.now() < deadline) {
    firstPoll = false
    try {
      const decision = await findConfirmationReaction(
        context,
        octokit,
        commentId
      )
      if (decision === 'confirmed') {
        await octokit.rest.issues.updateComment({
          ...context.repo,
          comment_id: commentId,
          body: `${message}\n\n✅ Deployment confirmed by __${context.actor}__ at \`${timestamp()}\` UTC.`,
          headers: API_HEADERS
        })

        core.info(
          `✅ deployment confirmed by ${COLORS.highlight}${context.actor}${COLORS.reset} - sha: ${COLORS.highlight}${data.sha}${COLORS.reset}`
        )
        return 'confirmed'
      }
      if (decision === 'rejected') {
        await octokit.rest.issues.updateComment({
          ...context.repo,
          comment_id: commentId,
          body: `${message}\n\n❌ Deployment rejected by __${context.actor}__ at \`${timestamp()}\` UTC.`,
          headers: API_HEADERS
        })

        core.setFailed(
          `❌ deployment rejected by ${COLORS.highlight}${context.actor}${COLORS.reset}`
        )
        return 'rejected'
      }
    } catch (error) {
      if (!isRetryableConfirmationError(error)) {
        throw error
      }
      core.warning(
        `temporary failure when checking for reactions on the deployment confirmation comment: ${legacyApiError(error).message}`
      )
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      break
    }
    await new Promise<void>(resolve =>
      setTimeout(resolve, Math.min(pollInterval, remainingMs))
    )
    pollInterval = Math.min(pollInterval * 2, 10_000)
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
  return 'timed_out'
}

async function findConfirmationReaction(
  context: BranchDeployContext,
  octokit: DeploymentConfirmationOctokit,
  commentId: number
): Promise<'confirmed' | 'rejected' | null> {
  let page = 1
  while (true) {
    const reactions = await octokit.rest.reactions.listForIssueComment({
      ...context.repo,
      comment_id: commentId,
      per_page: 100,
      page,
      headers: API_HEADERS
    })

    for (const reaction of reactions.data) {
      if (reaction.user === null) {
        core.debug('ignoring reaction from an unknown user')
      } else if (reaction.user.login !== context.actor) {
        core.debug(
          `ignoring reaction from ${reaction.user.login}, expected ${context.actor}`
        )
      } else if (reaction.content === thumbsUp) {
        return 'confirmed'
      } else if (reaction.content === thumbsDown) {
        return 'rejected'
      } else {
        core.debug(`ignoring reaction: ${reaction.content}`)
      }
    }

    if (reactions.data.length < 100) {
      return null
    }
    page += 1
  }
}

function isRetryableConfirmationError(error: unknown): boolean {
  const status = legacyApiError(error).status
  if (status === undefined) {
    return true
  }
  if ([408, 409, 429].includes(status)) {
    return true
  }
  return status >= 500 && status < 600
}
