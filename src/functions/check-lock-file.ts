import {LOCK_METADATA} from './lock-metadata.ts'
import {COLORS} from './colors.ts'
import {constructValidBranchName} from './valid-branch-name.ts'
import * as core from '@actions/core'
import {API_HEADERS} from './api-headers.ts'
import {
  decodedLockData,
  legacyApiError,
  repositoryFileContent
} from '../trust-boundaries.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  LockData
} from '../types.ts'

const LOCK_FILE = LOCK_METADATA.lockFile

type GetContentMethod = BranchDeployOctokit['rest']['repos']['getContent']
type GetContentParameters = Parameters<GetContentMethod>[0]

export interface LockFileOctokit {
  readonly rest: {
    readonly repos: {
      readonly getContent: (
        parameters?: GetContentParameters
      ) => Promise<{readonly data: unknown}>
    }
  }
}

// Helper function to check if a lock file exists and decodes it if it does
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param branchName: The name of the branch to check
// :return: The lock file contents if it exists, false if not
export async function checkLockFile(
  octokit: LockFileOctokit,
  context: BranchDeployContext,
  branchName: string
): Promise<false | LockData> {
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
    const lockData = decodedLockData(
      Buffer.from(repositoryFileContent(response.data), 'base64').toString()
    )

    return lockData
  } catch (error) {
    const apiError = legacyApiError(error)
    core.debug(`checkLockFile() error.status: ${String(apiError.status)}`)
    // If the lock file doesn't exist, return false
    if (apiError.status === 404) {
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
    throw new Error(String(error))
  }
}
