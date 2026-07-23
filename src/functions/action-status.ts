import {truncateCommentBody} from './truncate-comment-body.ts'
import {API_HEADERS} from './api-headers.ts'
import * as core from '../actions-core.ts'
import {issueCommentContext, legacyApiError} from '../trust-boundaries.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

// Default failure reaction
const thumbsDown = '-1'
// Default success reaction
const rocket = 'rocket'
// Alt success reaction
const thumbsUp = '+1'
type GitHubReaction =
  | '-1'
  | '+1'
  | 'laugh'
  | 'confused'
  | 'heart'
  | 'hooray'
  | 'rocket'
  | 'eyes'

type CreateCommentMethod =
  BranchDeployOctokit['rest']['issues']['createComment']
type CreateCommentParameters = Parameters<CreateCommentMethod>[0]
type CreateReactionMethod =
  BranchDeployOctokit['rest']['reactions']['createForIssueComment']
type CreateReactionParameters = Parameters<CreateReactionMethod>[0]
type DeleteReactionMethod =
  BranchDeployOctokit['rest']['reactions']['deleteForIssueComment']
type DeleteReactionParameters = Parameters<DeleteReactionMethod>[0]

export interface ActionStatusRequest {
  readonly context: BranchDeployContext
  readonly message: string
  readonly octokit: ActionStatusOctokit
  readonly reactionId: number | null
  readonly result?: 'alternate-success' | 'failure' | 'success'
}

export interface ActionStatusOctokit {
  readonly rest: {
    readonly issues: {
      readonly createComment: (
        parameters?: CreateCommentParameters
      ) => Promise<unknown>
    }
    readonly reactions: {
      readonly createForIssueComment: (
        parameters?: CreateReactionParameters
      ) => Promise<unknown>
      readonly deleteForIssueComment: (
        parameters?: DeleteReactionParameters
      ) => Promise<unknown>
    }
  }
}

// Helper function to add a status update for the action that is running a branch deployment
// It also updates the original comment with a reaction depending on the status of the deployment
// :param context: The context of the action
// :param octokit: The octokit object
// :param reactionId: The id of the original reaction added to our trigger comment (Integer)
// :param message: The message to be added to the action status (String)
// :param success: Boolean indicating whether the deployment was successful (Boolean)
// :param altSuccessReaction: Boolean indicating whether to use the alternate success reaction (Boolean)
// :returns: Nothing
export async function actionStatus({
  context,
  message: originalMessage,
  octokit,
  reactionId,
  result = 'failure'
}: ActionStatusRequest): Promise<void> {
  let message = originalMessage
  // check if message is null or empty
  if (!message || message.length === 0) {
    const log_url = `${String(process.env['GITHUB_SERVER_URL'])}/${context.repo.owner}/${context.repo.repo}/actions/runs/${String(process.env['GITHUB_RUN_ID'])}`
    message = 'Unknown error, [check logs](' + log_url + ') for more details.'
  }

  await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: context.issue.number,
    body: truncateCommentBody(message),
    headers: API_HEADERS
  })

  // Select the reaction to add to the issue_comment
  let reaction: GitHubReaction
  if (result !== 'failure') {
    if (result === 'alternate-success') {
      reaction = thumbsUp
    } else {
      reaction = rocket
    }
  } else {
    reaction = thumbsDown
  }

  if (reactionId !== null) {
    try {
      await octokit.rest.reactions.deleteForIssueComment({
        ...context.repo,
        comment_id: issueCommentContext(context).payload.comment.id,
        reaction_id: reactionId,
        headers: API_HEADERS
      })
    } catch (error) {
      core.warning(
        `failed to remove the initial decorative reaction: ${legacyApiError(error).message}`
      )
    }

    try {
      await octokit.rest.reactions.createForIssueComment({
        ...context.repo,
        comment_id: issueCommentContext(context).payload.comment.id,
        content: reaction,
        headers: API_HEADERS
      })
    } catch (error) {
      core.warning(
        `failed to add the final decorative reaction: ${legacyApiError(error).message}`
      )
    }
  }
}
