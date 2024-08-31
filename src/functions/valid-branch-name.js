// Helper function to create a valid branch name that will pass GitHub's API ref validation
// :param branch: The branch name
// :returns: A string of the branch name with proper formatting
export function constructValidBranchName(branch) {
  if (branch === null) {
    return null
  } else if (branch === undefined) {
    return undefined
  }

  // If environment contains any spaces, replace all of them with a hyphen
  branch = branch.replace(/\s/g, '-')

  return branch
}
