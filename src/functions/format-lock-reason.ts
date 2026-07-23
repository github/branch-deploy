// Format an untrusted lock reason as a Markdown code block nested under a list item.
export function formatLockReason(reason: unknown): string {
  const codeBlock = String(reason)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => `      ${line}`)
    .join('\n')

  return `- __Reason__:\n\n${codeBlock}`
}
