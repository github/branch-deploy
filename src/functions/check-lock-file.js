import {LOCK_METADATA} from './lock-metadata'
import {COLORS} from './colors'
import {constructValidBranchName} from './valid-branch-name'
import * as core from '@actions/core'
import {API_HEADERS} from './api-headers'

const LOCK_FILE = LOCK_METADATA.lockFile

// Helper function to check if a lock file exists and decodes it if it does
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param branchName: The name of the branch to check
// :return: The lock file contents if it exists, false if not
export async function checkLockFile(octokit, context, branchName) {
  branchName = constructValidBranchName(branchName)

  core.debug(`checking if lock file exists on branch: ${branchName}`)
  // If the lock branch exists, check if a lock file exists
  try {
    // Get the lock file contents
    const response = await octokit.rest.repos.getContent({
      ...context.repo,
      path: LOCK_FILE,
      ref: branchName,
      headers: API_HEADERS
    })

    // decode the file contents to json
    const lockData = JSON.parse(
      Buffer.from(response.data.content, 'base64').toString()
    )

    return lockData
  } catch (error) {
    core.debug(`checkLockFile() error.status: ${error.status}`)
    // If the lock file doesn't exist, return false
    if (error.status === 404) {
      const lockFileNotFoundMsg = `🔍 lock file does not exist on branch: ${COLORS.highlight}${branchName}`
      if (branchName === LOCK_METADATA.globalLockBranch) {
        // since we jump out directly to the 'lock file' without checking the branch (only on global locks), we get this error often so we just want it to be a debug message
        core.debug(lockFileNotFoundMsg)
      } else {
        core.info(lockFileNotFoundMsg)
      }
      return false
    }

    // If some other error occurred, throw it
    throw new Error(error)
  }
}
