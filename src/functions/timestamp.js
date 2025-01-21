// Helper function to generate an ISO 8601 formatted timestamp string
// :returns: An ISO 8601 formatted timestamp string (ex: 2025-01-01T00:00:00.000Z)
export function timestamp() {
  const now = new Date()
  return now.toISOString()
}
