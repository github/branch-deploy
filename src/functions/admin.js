import * as core from '@actions/core'
import * as github from '@actions/github'
import githubUsernameRegex from 'github-username-regex';

async function orgCheck(actor, orgTeams) {
    // Create a new octokit client with the admin PAT
    // This pat needs org read permissions if you are using org/teams to define admins
    const adminsPat = core.getInput('admins_pat')

    // If no admin_pat is provided, then we cannot check for org team memberships
    if (!adminsPat || adminsPat.length === 0) {
        core.warning('No admins_pat provided, skipping admin check for org team membership')
        return false
    }

    const octokit = github.getOctokit(adminsPat)
}


// Helper function to check if a user is set as an admin for branch-deployments
// :param context: The GitHub Actions event context
// :returns: true if the user is an admin, false otherwise (Boolean)
export async function isAdmin(
    context
) {
    const admins = core.getInput('admins')

    const adminsSanitized = admins.split(",").map(admin => admin.trim())

    // loop through admins
    var handles = []
    var orgTeams = []
    adminsSanitized.forEach(admin => {
        if (admin.includes("/")) {
            orgTeams.push(admin)
        }
        else {
            if (githubUsernameRegex.test(admin)) {
                handles.push(admin)
            }
            else {
                console.log(`${admin} is not a valid GitHub username... skipping`)
            }
        }
    })

    // Check if the user is in the admin handle list
    if (handles.includes(context.actor)) {
        core.debug(`${context.actor} is an admin via direct handle reference`)
        return true
    } else if (orgTeams.length > 0 && await orgCheck(context.actor, orgTeams) === true) {
        core.debug(`${context.actor} is an admin via org team reference`)
        return true
    }

    // If we get here, the user is not an admin
    return false
}
