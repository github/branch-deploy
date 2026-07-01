import {LOCK_METADATA} from './lock-metadata.ts'
import {COLORS} from './colors.ts'
import {constructValidBranchName} from './valid-branch-name.ts'
import * as core from '../actions-core.ts'
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

export class InvalidLockFileError extends Error {}

function isLockData(value: unknown): value is LockData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'reason' in value &&
    'branch' in value &&
    (typeof value.branch === 'string' || value.branch === null) &&
    'created_at' in value &&
    typeof value.created_at === 'string' &&
    'created_by' in value &&
    typeof value.created_by === 'string' &&
    'sticky' in value &&
    (typeof value.sticky === 'boolean' || value.sticky === null) &&
    'environment' in value &&
    (typeof value.environment === 'string' || value.environment === null) &&
    'global' in value &&
    typeof value.global === 'boolean' &&
    'unlock_command' in value &&
    typeof value.unlock_command === 'string' &&
    'link' in value &&
    typeof value.link === 'string' &&
    (!('schema_version' in value) || value.schema_version === 1) &&
    (!('claim_id' in value) ||
      (typeof value.claim_id === 'string' &&
        /^sha256:[0-9a-f]{64}$/u.test(value.claim_id)))
  )
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
  let response: {readonly data: unknown}

  // If the lock branch exists, check if a lock file exists
  try {
    // Get the lock file contents
    response = await octokit.rest.repos.getContent({
      ...context.repo,
      path: LOCK_FILE,
      ref: branchName,
      headers: API_HEADERS
    })
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

  let lockData: LockData
  try {
    // decode the file contents to json
    lockData = decodedLockData(
      Buffer.from(repositoryFileContent(response.data), 'base64').toString()
    )
  } catch (error) {
    throw new InvalidLockFileError(String(error))
  }
  if (!isLockData(lockData)) {
    throw new InvalidLockFileError(
      'Lock data does not match the expected shape'
    )
  }
  return lockData
}
