import * as core from '@actions/core'
import {COLORS} from './colors'

const truncatedMessageStart =
  'The message is too large to be posted as a comment.\n<details><summary>Click to see the truncated message</summary>\n'
const truncatedMessageEnd = '\n</details>'
// The maximum length of an issue comment body
const maxCommentLength = 65536

// Helper function to truncate the body of a comment if it is too long. If the message is too long,
// it will be truncated and wrapped in a details tag. If the message is short enough, it will be
// returned as is.
// :param message: The message to be truncated (String)
export function truncateCommentBody(message) {
  // If the message is short enough, return it as is
  if (message.length <= maxCommentLength) {
    core.debug('comment body is within length limit')
    return message
  }

  // if we make it here, the message is too long, so truncate it
  core.warning(
    `✂️ truncating - comment body is too long - current: ${COLORS.highlight}${message.length}${COLORS.reset} characters - max: ${COLORS.highlight}${maxCommentLength}${COLORS.reset} characters`
  )

  let truncated = message.substring(
    0,
    maxCommentLength - truncatedMessageStart.length - truncatedMessageEnd.length
  )

  // return the truncated message wrapped in a details tag
  return truncatedMessageStart + truncated + truncatedMessageEnd
}
