import {expect, test} from 'vitest'
import {githubJob} from '../../src/functions/github-job.js'

test('returns a nonempty GitHub job name', () => {
  expect(githubJob('branch-deploy')).toBe('branch-deploy')
})

test.each([undefined, null, '', '   '])(
  'rejects an empty GitHub job name: %s',
  value => {
    expect(() => githubJob(value)).toThrow('GITHUB_JOB must not be empty')
  }
)
