export function githubRunAttempt(value) {
  if (value === undefined || value === '') {
    return 1
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('GITHUB_RUN_ATTEMPT must be a positive integer')
  }

  const attempt = Number(value)
  if (!Number.isSafeInteger(attempt)) {
    throw new Error('GITHUB_RUN_ATTEMPT must be a safe integer')
  }

  return attempt
}
