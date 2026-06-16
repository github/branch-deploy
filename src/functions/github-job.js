export function githubJob(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('GITHUB_JOB must not be empty')
  }

  return value
}
