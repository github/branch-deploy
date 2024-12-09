import * as core from '@actions/core'
import {COLORS} from './colors'

// A helper method to ensure that the commit being used is safe for deployment
// These safety checks are supplemental to the checks found in `src/functions/prechecks.js`
// :param context: The context of the event
// :param data: An object containing data such as the sha, the created_at time for the comment, and more
export async function commitSafetyChecks(context, data) {
  const commit = data.commit
  const inputs = data.inputs
  const sha = data.sha

  const isVerified = commit?.verification?.verified === true ? true : false
  core.debug(`isVerified: ${isVerified}`)
  core.setOutput('commit_verified', isVerified)
  core.saveState('commit_verified', isVerified)

  const comment_created_at = context.payload.comment.created_at
  core.debug(`comment_created_at: ${comment_created_at}`)

  // fetch the timestamp that the commit was authored (format: "2024-10-21T19:10:24Z" - String)
  const commit_created_at = commit.author.date
  core.debug(`commit_created_at: ${commit_created_at}`)

  // check to ensure that the commit was authored before the comment was created
  if (isTimestampOlder(comment_created_at, commit_created_at)) {
    return {
      message: `### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. It was authored after the trigger comment was created.`,
      status: false,
      isVerified: isVerified
    }
  }

  // begin the commit verification checks
  if (isVerified) {
    core.info(`🔑 commit signature is ${COLORS.success}valid${COLORS.reset}`)
  } else if (inputs.commit_verification === true && isVerified === false) {
    core.warning(`🔑 commit signature is ${COLORS.error}invalid${COLORS.reset}`)
  } else {
    // if we make it here, the commit is not valid but that is okay because commit verification is not enabled
    core.debug(
      `🔑 commit does not contain a verified signature but ${COLORS.highlight}commit signing is not required${COLORS.reset} - ${COLORS.success}OK${COLORS.reset}`
    )
  }

  // If commit verification is enabled and the commit signature is not valid (or it is missing / undefined), exit
  if (inputs.commit_verification === true && isVerified === false) {
    return {
      message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`${commit?.verification?.reason}\`\n\n> The commit signature is not valid. Please ensure the commit has been properly signed and try again.`,
      status: false,
      isVerified: isVerified
    }
  }

  // check to ensure that the commit signature was authored before the comment was created
  // even if the commit signature is valid, we still want to reject it if it was authored after the comment was created
  if (
    inputs.commit_verification === true &&
    isTimestampOlder(comment_created_at, commit?.verification?.verified_at)
  ) {
    return {
      message: `### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. The commit signature was verified after the trigger comment was created.`,
      status: false,
      isVerified: isVerified
    }
  }

  // if we make it through all the checks, we can return a success object
  return {
    message: 'success',
    status: true,
    isVerified: isVerified
  }
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
