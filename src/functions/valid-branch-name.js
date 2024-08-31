import * as core from '@actions/core'

// Helper function to create a valid branch name that will pass GitHub's API ref validation
// :param branch: The branch name
// :returns: A string of the branch name with proper formatting
export function constructValidBranchName(branch) {
  core.debug(`constructing valid branch name: ${branch}`)

  if (branch === null) {
    return null
  } else if (branch === undefined) {
    return undefined
  }

  // If environment contains any spaces, replace all of them with a hyphen
  branch = branch.replace(/\s/g, '-')

  core.debug(`constructed valid branch name: ${branch}`)
  return branch
}
