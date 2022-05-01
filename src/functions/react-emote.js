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
]

// Helper function to add a reaction to an issue_comment
// :param reaction: A string which determines the reaction to use (String)
// :param context: The GitHub Actions event context
// :param octokit: The octokit client
// :returns: The reactRes object which contains the reaction ID among other things. Returns nil if no reaction was specified, or throws an error if it fails
export async function reactEmote(reaction, context, octokit) {
  // Get the owner and repo from the context
  const {owner, repo} = context.repo

  // If the reaction is not specified, return
  if (!reaction || reaction.trim() === '') {
    return
  }

  // Find the reaction in the list of presets, otherwise throw an error
  const preset = presets.find(preset => preset === reaction.trim())
  if (!preset) {
    throw new Error(`Reaction "${reaction}" is not a valid preset`)
  }

  // Add the reaction to the issue_comment
  const reactRes = await octokit.rest.reactions.createForIssueComment({
    owner,
    repo,
    comment_id: context.payload.comment.id,
    content: preset
  })

  // Return the reactRes which contains the id for reference later
  return reactRes
}
