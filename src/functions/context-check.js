import * as core from '@actions/core'

// A simple function that checks the event context to make sure it is valid
// :param context: The GitHub Actions event context
// :returns: Boolean - true if the context is valid, false otherwise
export async function contextCheck(context) {
  // Get the PR event context
  var pr
  try {
    pr = context.payload.issue.pull_request
  } catch (error) {
    throw new Error(`Could not get PR event context: ${error}`)
  }

  // If the context is not valid, return false
  if (context.eventName !== 'issue_comment' || pr == null || pr == undefined) {
    core.saveState('bypass', 'true')
    core.warning(
      'This Action can only be run in the context of a pull request comment'
    )
    return false
  }

  // If the context is valid, return true
  return true
}
