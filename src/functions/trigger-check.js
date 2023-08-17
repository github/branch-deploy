import * as core from '@actions/core'
import {COLORS} from './colors'

// A simple function that checks the body of the message against the trigger
// :param body: The content body of the message being checked (String)
// :param trigger: The "trigger" phrase which is searched for in the body of the message (String)
// :returns: true if a message activates the trigger, false otherwise
export async function triggerCheck(body, trigger) {
  // If the trigger is not activated, set the output to false and return with false
  if (!body.startsWith(trigger)) {
    core.debug(
      `comment body does not start with trigger: ${COLORS.highlight}${trigger}`
    )
    return false
  }

  core.info(
    `✅ comment body starts with trigger: ${COLORS.highlight}${trigger}`
  )
  return true
}
