import * as core from '@actions/core'

// A simple function that checks the body of the message against the trigger
// :param body: The content body of the message being checked (String)
// :param trigger: The "trigger" phrase which is searched for in the body of the message
// :returns: true if a message activates the trigger, false otherwise
export async function triggerCheck(body, trigger) {
  // Set the output of the comment body for later use with other actions
  core.setOutput('comment_body', body)

  // If the trigger is not activated, set the output to false and return with false
  if (!body.startsWith(trigger)) {
    core.info(`Trigger "${trigger}" not found in the comment body`)
    return false
  }

  return true
}
