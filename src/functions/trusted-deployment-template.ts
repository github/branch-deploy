import {posix} from 'node:path'
import {API_HEADERS} from './api-headers.ts'
import {legacyApiError} from '../trust-boundaries.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

type GetContentMethod = BranchDeployOctokit['rest']['repos']['getContent']
type GetContentParameters = Parameters<GetContentMethod>[0]

export interface TrustedTemplateOctokit {
  readonly rest: {
    readonly repos: {
      readonly getContent: (
        parameters?: GetContentParameters
      ) => Promise<{readonly data: unknown}>
    }
  }
}

function validRepositoryPath(path: string): boolean {
  return (
    path !== '' &&
    !posix.isAbsolute(path) &&
    !path.includes('\\') &&
    path
      .split('/')
      .every(segment => segment !== '' && segment !== '.' && segment !== '..')
  )
}

function decodeTemplate(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    value.type !== 'file' ||
    !('encoding' in value) ||
    value.encoding !== 'base64' ||
    !('content' in value) ||
    typeof value.content !== 'string'
  ) {
    throw new Error('Trusted deployment template response is not a file')
  }
  return Buffer.from(value.content, 'base64').toString('utf8')
}

export async function loadTrustedDeploymentTemplate(
  octokit: TrustedTemplateOctokit,
  context: BranchDeployContext,
  path: string,
  trustedSha: string
): Promise<string | null> {
  if (!validRepositoryPath(path)) {
    throw new Error(
      'deploy_message_path must be a repository-relative path without traversal segments'
    )
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(trustedSha)) {
    throw new Error('Trusted deployment template SHA is invalid')
  }

  try {
    const response = await octokit.rest.repos.getContent({
      ...context.repo,
      path,
      ref: trustedSha,
      headers: API_HEADERS
    })
    return decodeTemplate(response.data)
  } catch (error) {
    if (legacyApiError(error).status === 404) return null
    throw error
  }
}
