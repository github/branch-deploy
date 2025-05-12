import * as core from '@actions/core'

// A helper method that checks if timestamp A is older than timestamp B
// :param timestampA: The first timestamp to compare (String - format: "2024-10-21T19:10:24Z")
// :param timestampB: The second timestamp to compare (String - format: "2024-10-21T19:10:24Z")
// :returns: true if timestampA is older than timestampB, false otherwise
export function isTimestampOlder(timestampA, timestampB) {
  // Defensive: handle null/undefined/empty
  if (!timestampA || !timestampB) {
    throw new Error('One or both timestamps are missing or empty.')
  }

  // Strict ISO 8601 UTC format: YYYY-MM-DDTHH:MM:SSZ
  const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
  if (
    typeof timestampA !== 'string' ||
    typeof timestampB !== 'string' ||
    !ISO_UTC_REGEX.test(timestampA) ||
    !ISO_UTC_REGEX.test(timestampB)
  ) {
    throw new Error(
      `Timestamps must be strings in the format YYYY-MM-DDTHH:MM:SSZ. Received: '${timestampA}', '${timestampB}'`
    )
  }

  // Parse the date strings into Date objects
  const timestampADate = new Date(timestampA)
  const timestampBDate = new Date(timestampB)

  const result = timestampADate < timestampBDate

  if (result) {
    core.debug(`${timestampA} is older than ${timestampB}`)
  } else {
    core.debug(`${timestampA} is not older than ${timestampB}`)
  }

  return result
}
