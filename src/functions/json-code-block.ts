export function jsonCodeBlock(value: unknown): string {
  const json = JSON.stringify(value, null, 2) ?? 'null'
  let longestBacktickRun = 0
  for (const match of json.matchAll(/`+/g)) {
    longestBacktickRun = Math.max(longestBacktickRun, match[0].length)
  }
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1))
  return `${fence}json\n${json}\n${fence}`
}
