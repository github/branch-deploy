// Helper function to calculate the time difference between two dates
// :param firstDate: ISO 8601 formatted date string
// :param secondDate: ISO 8601 formatted date string
// :returns: A string in the following format: `${days}d:${hours}h:${minutes}m:${seconds}s`
export async function timeDiff(firstDate, secondDate) {
  const firstDateFmt = new Date(firstDate)
  const secondDateFmt = new Date(secondDate)

  var seconds = Math.floor((secondDateFmt - firstDateFmt) / 1000)
  var minutes = Math.floor(seconds / 60)
  var hours = Math.floor(minutes / 60)
  var days = Math.floor(hours / 24)

  hours = hours - days * 24
  minutes = minutes - days * 24 * 60 - hours * 60
  seconds = seconds - days * 24 * 60 * 60 - hours * 60 * 60 - minutes * 60

  return `${days}d:${hours}h:${minutes}m:${seconds}s`
}
