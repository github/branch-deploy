import * as core from '@actions/core'

// A simple function that checks the body of the message against the trigger
// Returns true if a message trips the trigger
// Returns false if a message does not trip the trigger
export async function triggerCheck(prefixOnly, body, trigger) {
  // Set the output of the comment body for later use with other actions
  core.setOutput('comment_body', body)

  // If the trigger is not activated, set the output to false and return with false
  if ((prefixOnly && !body.startsWith(trigger)) || !body.includes(trigger)) {
    if (prefixOnly) {
      core.info(`Trigger "${trigger}" not found as comment prefix`)
    } else {
      core.info(`Trigger "${trigger}" not found in the comment body`)
    }
    core.setOutput('triggered', 'false')
    return false
  }

  // If the trigger is activated, set the output to true and return with true
  core.setOutput('triggered', 'true')
  return true
}
