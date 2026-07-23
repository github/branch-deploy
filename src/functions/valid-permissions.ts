import {API_HEADERS} from './api-headers.ts'
import {setActionOutput} from '../action-io.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

type PermissionMethod =
  BranchDeployOctokit['rest']['repos']['getCollaboratorPermissionLevel']
type PermissionParameters = Parameters<PermissionMethod>[0]
type PermissionResponse = Awaited<ReturnType<PermissionMethod>>

export interface CollaboratorPermissionResponse {
  readonly data: Pick<PermissionResponse['data'], 'permission'>
  readonly status: number
}

export interface PermissionsOctokit {
  readonly rest: {
    readonly repos: {
      readonly getCollaboratorPermissionLevel: (
        parameters?: PermissionParameters
      ) => Promise<CollaboratorPermissionResponse>
    }
  }
}

// Helper function to check if an actor has permissions to use this Action in a given repository
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param validPermissionsArray: An array of permissions that the actor must have
// :returns: An error string if the actor doesn't have permissions, otherwise true
export async function validPermissions(
  octokit: PermissionsOctokit,
  context: BranchDeployContext,
  validPermissionsArray: readonly string[]
): Promise<string | true> {
  // fetch the defined permissions from the Action input

  setActionOutput('actor', context.actor)

  // Get the permissions of the user who made the comment
  const permissionRes = await octokit.rest.repos.getCollaboratorPermissionLevel(
    {
      ...context.repo,
      username: context.actor,
      headers: API_HEADERS
    }
  )

  // Check permission API call status code
  if (permissionRes.status !== 200) {
    return `Permission check returns non-200 status: ${permissionRes.status}`
  }

  // Check to ensure the user has at least write permission on the repo
  const actorPermission = permissionRes.data.permission
  if (!validPermissionsArray.includes(actorPermission)) {
    return `👋 @${
      context.actor
    }, that command requires the following permission(s): \`${validPermissionsArray.join(
      '/'
    )}\`\n\nYour current permissions: \`${actorPermission}\``
  }

  // Return true if the user has permissions
  return true
}
