import * as core from '@actions/core'

// A simple function that checks the body of the message against the trigger
// :param prefixOnly: Input that determines if the whole comment should be checked for the trigger or just check if the trigger is the prefix of the message
// :param body: The content body of the message being checked (String)
// :param trigger: The "trigger" phrase which is searched for in the body of the message
// :returns: true if a message activates the trigger, false otherwise
export async function triggerCheck(prefixOnly, body, trigger) {
  // Set the output of the comment body for later use with other actions
  core.setOutput('comment_body', body)

  // If the trigger is not activated, set the output to false and return with false
  if ((prefixOnly && !body.startsWith(trigger)) || !body.includes(trigger)) {
    if (prefixOnly) {
      core.debug(`Trigger "${trigger}" not found as comment prefix`)
    } else {
      core.debug(`Trigger "${trigger}" not found in the comment body`)
    }
    return false
  }

  return true
}
