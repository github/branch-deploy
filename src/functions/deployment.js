// Helper function to add deployment statuses to a PR / ref
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param ref: The ref to add the deployment status to
// :param state: The state of the deployment
// :param deploymentId: The id of the deployment
// :param environment: The environment of the deployment
// :returns: The result of the deployment status creation (Object)
export async function createDeploymentStatus(
  octokit,
  context,
  ref,
  state,
  deploymentId,
  environment
) {
  // Get the owner and the repo from the context
  const {owner, repo} = context.repo

  const {data: result} = await octokit.rest.repos.createDeploymentStatus({
    owner: owner,
    repo: repo,
    ref: ref,
    deployment_id: deploymentId,
    state: state,
    INPUT_LOG_URL: `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`,
    environment: environment
  })

  return result
}
