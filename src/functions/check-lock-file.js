import {LOCK_METADATA} from './lock-metadata'

const LOCK_FILE = LOCK_METADATA.lockFile

// Helper function to check if a lock file exists and decodes it if it does
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param branchName: The name of the branch to check
// :return: The lock file contents if it exists, false if not
export async function checkLockFile(octokit, context, branchName) {
    // If the lock branch exists, check if a lock file exists
    try {
      // Get the lock file contents
      const response = await octokit.rest.repos.getContent({
        ...context.repo,
        path: LOCK_FILE,
        ref: branchName
      })
  
      // decode the file contents to json
      const lockData = JSON.parse(
        Buffer.from(response.data.content, 'base64').toString()
      )
  
      return lockData
    } catch (error) {
      // If the lock file doesn't exist, return false
      if (error.status === 404) {
        return false
      }
  
      // If some other error occurred, throw it
      throw new Error(error)
    }
  }
