import * as core from '@actions/core'

// A simple function that checks the body of the message against the trigger
// Returns true if a message trips the trigger
// Returns false if a message does not trip the trigger
export async function triggerCheck(
  prefixOnly: boolean,
  body: string,
  trigger: string
): Promise<boolean> {
  return new Promise(resolve => {
    // Set the output of the comment body for later use with other actions
    core.setOutput('comment_body', body)

    // If the trigger is not activated, set the output to false and return with false
    if ((prefixOnly && !body.startsWith(trigger)) || !body.includes(trigger)) {
      core.setOutput('triggered', 'false')
      return resolve(false)
    }

    // If the trigger is activated, set the output to true and return with true
    core.setOutput('triggered', 'true')
    return resolve(true)
  })
}
