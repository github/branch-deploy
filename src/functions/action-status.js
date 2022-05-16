// Default failure reaction
const thumbsDown = '-1'
// Default success reaction
const rocket = 'rocket'

// Helper function to add a status update for the action that is running a branch deployment
// It also updates the original comment with a reaction depending on the status of the deployment
// :param context: The context of the action
// :param octokit: The octokit object
// :param reactionId: The id of the original reaction added to our trigger comment (Integer)
// :param message: The message to be added to the action status (String)
// :param success: Boolean indicating whether the deployment was successful (Boolean)
// :returns: Nothing
export async function actionStatus(
  context,
  octokit,
  reactionId,
  message,
  success
) {
  // check if message is null or empty
  if (!message || message.length === 0) {
    const log_url = `${process.env.GITHUB_SERVER_URL}/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
    message = 'Unknown error, [check logs](' + log_url + ') for more details.'
  }

  // add a comment to the issue with the message
  await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: context.issue.number,
    body: message
  })

  // Select the reaction to add to the issue_comment
  var reaction
  if (success) {
    reaction = rocket
  } else {
    reaction = thumbsDown
  }

  // add a reaction to the issue_comment to indicate success or failure
  await octokit.rest.reactions.createForIssueComment({
    ...context.repo,
    comment_id: context.payload.comment.id,
    content: reaction
  })

  // remove the initial reaction on the IssueOp comment that triggered this action
  await octokit.rest.reactions.deleteForIssueComment({
    ...context.repo,
    comment_id: context.payload.comment.id,
    reaction_id: reactionId
  })
}
