import * as core from '../actions-core.ts'
import * as github from '@actions/github'
import {retry} from '@octokit/plugin-retry'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {getActionInput} from '../action-io.ts'
import {legacyApiError, legacyArrayElement} from '../trust-boundaries.ts'
import type {BranchDeployContext, BranchDeployOctokit} from '../types.ts'

const GITHUB_USERNAME_REGEX =
  /^(?:[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}|[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*(_[a-zA-Z0-9]+))$/i

type GetOrganizationMethod = BranchDeployOctokit['rest']['orgs']['get']
type GetOrganizationParameters = Parameters<GetOrganizationMethod>[0]
type FullGetOrganizationResponse = Awaited<ReturnType<GetOrganizationMethod>>
type GetTeamMethod = BranchDeployOctokit['rest']['teams']['getByName']
type GetTeamParameters = Parameters<GetTeamMethod>[0]
type FullGetTeamResponse = Awaited<ReturnType<GetTeamMethod>>

export interface AdminOctokit {
  readonly request: (route: string) => Promise<{readonly status: number}>
  readonly rest: {
    readonly orgs: {
      readonly get: (parameters?: GetOrganizationParameters) => Promise<{
        readonly data: Pick<FullGetOrganizationResponse['data'], 'id'>
      }>
    }
    readonly teams: {
      readonly getByName: (
        parameters?: GetTeamParameters
      ) => Promise<{readonly data: Pick<FullGetTeamResponse['data'], 'id'>}>
    }
  }
}

export type AdminOctokitFactory = (token: string) => AdminOctokit

export const defaultAdminOctokitFactory: AdminOctokitFactory = token =>
  github.getOctokit(token, {additionalPlugins: [retry]})

// Helper function to check if a user exists in an org team
// :param actor: The user to check
// :param orgTeams: An array of org/team names
// :returns: True if the user is in the org team, false otherwise
async function orgTeamCheck(
  actor: string,
  orgTeams: readonly string[],
  createClient: AdminOctokitFactory
): Promise<boolean> {
  // This pat needs org read permissions if you are using org/teams to define admins
  const adminsPat = getActionInput('admins_pat')

  // If no admin_pat is provided, then we cannot check for org team memberships
  if (!adminsPat || adminsPat.length === 0 || adminsPat === 'false') {
    core.warning(
      `🚨 no ${COLORS.highlight}admins_pat${COLORS.reset} provided, skipping admin check for org team membership`
    )
    return false
  }

  // Create a new octokit client with the admins_pat and the retry plugin
  const octokit = createClient(adminsPat)

  // Loop through all org/team names
  for (const orgTeam of orgTeams) {
    // Split the org/team name into org and team
    const [org, team] = orgTeam.split('/')

    try {
      // Make an API call to get the org id
      const orgData = await octokit.rest.orgs.get({
        org: legacyArrayElement(org),
        headers: API_HEADERS
      })
      const orgId = orgData.data.id

      // Make an API call to get the team id
      const teamData = await octokit.rest.teams.getByName({
        org: legacyArrayElement(org),
        team_slug: legacyArrayElement(team),
        headers: API_HEADERS
      })
      const teamId = teamData.data.id

      // This API call checks if the user exists in the team for the given org
      const result = await octokit.request(
        `GET /organizations/${orgId}/team/${teamId}/members/${actor}`
      )

      // If the status code is a 204, the user is in the team
      if (result.status === 204) {
        core.debug(`${actor} is in ${orgTeam}`)
        return true
        // If some other status code occurred, return false and output a warning
      } else {
        core.warning(`non 204 response from org team check: ${result.status}`)
      }
    } catch (error) {
      const apiError = legacyApiError(error)
      core.debug(`orgTeamCheck() error.status: ${String(apiError.status)}`)
      // If any of the API calls returns a 404, the user is not in the team
      if (apiError.status === 404) {
        core.debug(`${actor} is not a member of the ${orgTeam} team`)
        // If some other error occurred, output a warning
      } else {
        core.warning(`error checking org team membership: ${String(error)}`)
      }
    }
  }

  // If we get here, the user is not in any of the org teams
  return false
}

// Helper function to check if a user is set as an admin for branch-deployments
// :param context: The GitHub Actions event context
// :returns: true if the user is an admin, false otherwise (Boolean)
export async function isAdmin(
  context: BranchDeployContext,
  createClient: AdminOctokitFactory = defaultAdminOctokitFactory
): Promise<boolean> {
  // Get the admins string from the action inputs
  const admins = getActionInput('admins')

  core.debug(`raw admins value: ${admins}`)

  // Sanitized the input to remove any whitespace and split into an array
  const adminsSanitized = admins
    .split(',')
    .map(admin => admin.trim().toLowerCase())

  // loop through admins
  const handles: string[] = []
  const orgTeams: string[] = []
  adminsSanitized.forEach(admin => {
    // If the item contains a '/', then it is a org/team
    if (admin.includes('/')) {
      orgTeams.push(admin)
    }
    // Otherwise, it is a github handle
    else {
      // Check if the github handle is valid
      if (GITHUB_USERNAME_REGEX.test(admin)) {
        // Add the handle to the list of handles and remove @ from the start of the handle
        handles.push(admin.replace('@', ''))
      } else {
        core.debug(
          `${admin} is not a valid GitHub username... skipping admin check`
        )
      }
    }
  })

  const isAdminMsg = `🔮 ${COLORS.highlight}${context.actor}${COLORS.reset} is an ${COLORS.highlight}admin`

  // Check if the user is in the admin handle list
  if (handles.includes(context.actor.toLowerCase())) {
    core.debug(`${context.actor} is an admin via handle reference`)
    core.info(isAdminMsg)
    return true
  }

  // Check if the user is in the org/team list
  if (orgTeams.length > 0) {
    const result = await orgTeamCheck(context.actor, orgTeams, createClient)
    if (result) {
      core.debug(`${context.actor} is an admin via org team reference`)
      core.info(isAdminMsg)
      return true
    }
  }

  // If we get here, the user is not an admin
  core.debug(`${context.actor} is not an admin`)
  return false
}
