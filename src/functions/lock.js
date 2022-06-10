const LOCK_BRANCH = 'branch-deploy-lock'
const LOCK_FILE = 'lock.json'
const LOCK_COMMIT_MSG = 'lock'
const BASE_URL = 'https://github.com'

async function createLock(octokit, context, ref, reason) {

  const { owner, repo } = context.repo

  const lockData = {
    reason: reason,
    branch: ref,
    created_at: new Date().toISOString(),
    created_by: context.actor,
    link: `${BASE_URL}/${owner}/${repo}/pull/${context.issue.number}#issuecomment-${context.payload.comment.id}`
  }

  const result = await octokit.rest.repos.createOrUpdateFileContents({
    ...context.repo,
    path: LOCK_FILE,
    message: LOCK_COMMIT_MSG,
    content: Buffer.from(JSON.stringify(lockData)).toString('base64'),
    branch: LOCK_BRANCH
  });

  return result
}

// Helper function for claiming a deployment lock
// :param octokit: The octokit client
// :param context: The GitHub Actions event context
// :param ref: The ref to add the deployment status to
// :param reason: The reason for the deployment lock
// :returns: true if the lock was successfully claimed, false otherwise
export async function lock(
  octokit,
  context,
  ref,
  reason
) {
  // Check if the lock branch already exists
  try {
    await octokit.rest.repos.getBranch({
      ...context.repo,
      branch: LOCK_BRANCH,
    });
  } catch (error) {
    // Create the lock branch if it doesn't exist
    if (error.status === 404) {
      // Determine the default branch for the repo
      const repoData = await octokit.rest.repos.get({
        ...context.repo
      })

      // Fetch the base branch's to use its SHA as the parent
      const baseBranch = await octokit.rest.repos.getBranch({
        ...context.repo,
        branch: repoData.data.default_branch,
      });

      // Create the lock branch
      await octokit.rest.git.createRef({
        ...context.repo,
        ref: `refs/heads/${LOCK_BRANCH}`,
        sha: baseBranch.data.commit.sha
      });

      // Create the lock file
      await createLock(octokit, context, ref, reason)
      return true
    }
  }

  // If the lock branch exists, check if a lock file exists
  try {
    // Get the lock file contents
    const response = await octokit.rest.repos.getContent({
      ...context.repo,
      path: LOCK_FILE,
      ref: LOCK_BRANCH
    });

    // Decode the file contents to json
    const lockData = JSON.parse(Buffer.from(response.data.content, 'base64').toString())
    console.log(lockData)
  } catch (error) {
    // If the lock file doesn't exist, create it
    if (error.status === 404) {
      await createLock(octokit, context, ref, reason)
      return true
    }
  }
}
