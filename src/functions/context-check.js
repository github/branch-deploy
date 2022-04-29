import * as core from '@actions/core'

// A simple function that checks the event context to make sure it is valid
export async function contextCheck(context) {
  // If the context is not valid, return false
  if (context.eventName !== 'issue_comment') {
    core.setFailed(
      'This Action can only be run in the context of a pull request comment or issue comment'
    )
    return false
  }

  // If the context is valid, return true
  return true
}
