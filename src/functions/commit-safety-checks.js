import * as core from '@actions/core'
import {COLORS} from './colors.js'
import {isTimestampOlder} from './is-timestamp-older.js'

// A helper method to ensure that the commit being used is safe for deployment
// These safety checks are supplemental to the checks found in `src/functions/prechecks.js`
// :param context: The context of the event
// :param data: An object containing data such as the sha, the created_at time for the comment, and more
export async function commitSafetyChecks(context, data) {
  const commit = data.commit
  const inputs = data.inputs
  const sha = data.sha
  const comment_created_at = context?.payload?.comment?.created_at
  const commit_created_at = commit?.author?.date // fetch the timestamp that the commit was authored (format: "2024-10-21T19:10:24Z" - String)
  const verified_at = commit?.verification?.verified_at
  core.debug(`comment_created_at: ${comment_created_at}`)
  core.debug(`commit_created_at: ${commit_created_at}`)
  core.debug(`verified_at: ${verified_at}`)

  // Defensive: Ensure required fields exist
  if (!comment_created_at) {
    throw new Error('Missing context.payload.comment.created_at')
  }
  if (!commit_created_at) {
    throw new Error('Missing commit.author.date')
  }

  const isVerified = commit?.verification?.verified === true ? true : false
  core.debug(`isVerified: ${isVerified}`)
  core.setOutput('commit_verified', isVerified)
  core.saveState('commit_verified', isVerified)

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

  // if commit_verification is enabled and the verified_at timestamp is not present, throw an error
  if (inputs.commit_verification === true && !verified_at) {
    return {
      message: `### ⚠️ Cannot proceed with deployment\n\n- commit: \`${sha}\`\n- verification failed reason: \`${commit?.verification?.reason}\`\n\n> The commit signature is not valid as there is no valid \`verified_at\` date. Please ensure the commit has been properly signed and try again.`,
      status: false,
      isVerified: isVerified
    }
  }

  // check to ensure that the commit signature was authored before the comment was created
  // even if the commit signature is valid, we still want to reject it if it was authored after the comment was created
  if (
    inputs.commit_verification === true &&
    isTimestampOlder(comment_created_at, verified_at)
  ) {
    return {
      message: `### ⚠️ Cannot proceed with deployment\n\nThe latest commit is not safe for deployment. The commit signature was verified after the trigger comment was created. Please try again if you recently pushed a new commit.`,
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
