import * as core from '@actions/core'

// A helper method to ensure that the commit being used is safe for deployment
// These safety checks are supplemental to the checks found in `src/functions/prechecks.js`
// :param context: The context of the event
// :param data: An object containing data such as the sha, the created_at time for the comment, and more
export async function commitSafetyChecks(context, data) {
  const comment_created_at = context.payload.comment.created_at
  core.debug(`comment_created_at: ${comment_created_at}`)

  // fetch the timestamp that the commit was authored (format: "2024-10-21T19:10:24Z" - String)
  const commit_created_at = data.commit.author.date
  core.debug(`commit_created_at: ${commit_created_at}`)

  // check to ensure that the commit was authored before the comment was created
  if (isTimestampOlder(comment_created_at, commit_created_at)) {
    return {
      message: `### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. It was authored after the trigger comment was created.`,
      status: false
    }
  }

  // if we make it through all the checks, we can return a success object
  return {message: 'success', status: true}
}

// A helper method that checks if timestamp A is older than timestamp B
// :param timestampA: The first timestamp to compare (String - format: "2024-10-21T19:10:24Z")
// :param timestampB: The second timestamp to compare (String - format: "2024-10-21T19:10:24Z")
// :returns: true if timestampA is older than timestampB, false otherwise
function isTimestampOlder(timestampA, timestampB) {
  // Parse the date strings into Date objects
  const timestampADate = new Date(timestampA)
  const timestampBDate = new Date(timestampB)

  // Check if the parsed dates are valid
  if (isNaN(timestampADate) || isNaN(timestampBDate)) {
    throw new Error(
      'Invalid date format. Please ensure the dates are valid UTC timestamps.'
    )
  }

  const result = timestampADate < timestampBDate

  if (result) {
    core.debug(`${timestampA} is older than ${timestampB}`)
  } else {
    core.debug(`${timestampA} is not older than ${timestampB}`)
  }

  return result
}
