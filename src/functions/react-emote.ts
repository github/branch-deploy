import {API_HEADERS} from './api-headers.ts'
import * as core from '../actions-core.ts'
import {issueCommentContext, legacyApiError} from '../trust-boundaries.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

type CreateReactionMethod =
  BranchDeployOctokit['rest']['reactions']['createForIssueComment']
type CreateReactionParameters = Parameters<CreateReactionMethod>[0]
type FullCreateReactionResponse = Awaited<ReturnType<CreateReactionMethod>>

export interface ReactEmoteOctokit {
  readonly rest: {
    readonly reactions: {
      readonly createForIssueComment: (
        parameters?: CreateReactionParameters
      ) => Promise<{
        readonly data: Pick<FullCreateReactionResponse['data'], 'id'>
      }>
    }
  }
}

// Fixed presets of allowed emote types as defined by GitHub
const presets = [
  '+1',
  '-1',
  'laugh',
  'confused',
  'heart',
  'hooray',
  'rocket',
  'eyes'
] as const

// Helper function to add a reaction to an issue_comment
// :param reaction: A string which determines the reaction to use (String)
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :returns: The reaction ID, or null when reactions are disabled or unavailable
export async function reactEmote(
  reaction: string,
  context: BranchDeployContext,
  octokit: ReactEmoteOctokit
): Promise<number | null> {
  // Get the owner and repo from the context
  const {owner, repo} = context.repo

  // If the reaction is not specified, return
  if (!reaction || reaction.trim() === '') {
    return null
  }

  // Find the reaction in the list of presets, otherwise throw an error
  const preset = presets.find(preset => preset === reaction.trim())
  if (!preset) {
    throw new Error(`Reaction "${reaction}" is not a valid preset`)
  }

  // Add the reaction to the issue_comment
  try {
    const reactRes = await octokit.rest.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: issueCommentContext(context).payload.comment.id,
      content: preset,
      headers: API_HEADERS
    })

    return reactRes.data.id
  } catch (error) {
    core.warning(
      `failed to add the initial reaction; continuing without decorative reactions: ${legacyApiError(error).message}`
    )
    return null
  }
}
