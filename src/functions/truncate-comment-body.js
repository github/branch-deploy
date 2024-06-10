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
  if (message.length <= maxCommentLength) {
    return message
  }
  let truncated = message.substring(
    0,
    maxCommentLength - truncatedMessageStart.length - truncatedMessageEnd.length
  )
  return truncatedMessageStart + truncated + truncatedMessageEnd
}
