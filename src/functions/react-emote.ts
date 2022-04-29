import { Context } from '@actions/github/lib/context'


// Helper function to add a reaction to an issue_comment
export async function reactEmote(reaction: string, context: Context, octokit: any): Promise<void> {
  return new Promise(async () => {
    // Get the owner and repo from the context
    const { owner, repo } = context.repo

    // If the reaction is not specified, return
    if (!reaction || reaction.trim() === "") {
      return;
    }

    // Add the reaction to the issue_comment
    await octokit.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: context?.payload?.comment?.id,
      content: reaction
    })
  }
  )
}
