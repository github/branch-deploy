import * as core from '@actions/core'
import dedent from 'dedent-js'

// Runs precheck logic before the branch deployment can proceed
// :param comment: The comment body of the event
// :param trigger: The trigger word to check for
// :param noop_trigger: The trigger word to check for if the deployment is a noop
// :param stable_branch: The "stable" or "base" branch to deploy to (e.g. master|main)
// :param issue_number: The issue number of the event
// :param context: The context of the event
// :param octokit: The octokit client
// :returns: An object that contains the results of the prechecks, message, ref, status, and noopMode
export async function prechecks(
  comment,
  trigger,
  noop_trigger,
  stable_branch,
  issue_number,
  context,
  octokit
) {
  // Setup the message variable
  var message

  // Get the permissions of the user who made the comment
  const permissionRes = await octokit.rest.repos.getCollaboratorPermissionLevel(
    {
      ...context.repo,
      username: context.actor
    }
  )

  // Check permission API call status code
  if (permissionRes.status !== 200) {
    message = 'Permission check returns non-200 status: ${permissionRes.status}'
    return {message: message, status: false}
  }

  // Check to ensure the user has at least write permission on the repo
  const actorPermission = permissionRes.data.permission
  if (!['admin', 'write'].includes(actorPermission)) {
    message =
      '👋  __' +
      context.actor +
      '__, seems as if you have not admin/write permission to branch-deploy this PR, permissions: ${actorPermission}'
    return {message: message, status: false}
  }

  // Get the PR data
  const pr = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: context.issue.number
  })
  if (pr.status !== 200) {
    message = 'Could not retrieve PR info: ${permissionRes.status}'
    return {message: message, status: false}
  }

  // check if comment starts with the env.DEPLOY_COMMAND variable followed by the 'main' branch or if this is for the current branch
  var ref
  var noopMode = false

  // Regex statements for checking the trigger message
  const regexCommandWithStableBranch = new RegExp(
    `^\\${trigger}\\s*(${stable_branch})$`,
    'i'
  )
  const regexCommandWithNoop = new RegExp(
    `^\\${trigger}\\s*(${noop_trigger})$`,
    'i'
  )
  const regexCommandWithoutParameters = new RegExp(`^\\${trigger}\\s*$`, 'i')

  // Check to see if the "stable" branch was used as the deployment target
  if (regexCommandWithStableBranch.test(comment)) {
    ref = stable_branch
    core.info(
      `${trigger} command used with '${stable_branch}' branch - setting ref to ${ref}`
    )
    // Check to see if the IssueOps command requested noop mode
  } else if (regexCommandWithNoop.test(comment)) {
    ref = pr.data.head.ref
    core.info(
      `${trigger} command used on current branch with noop mode - setting ref to ${ref}`
    )
    noopMode = true
    // Check to see if the IssueOps command was used in a basic form with no other params
  } else if (regexCommandWithoutParameters.test(comment)) {
    ref = pr.data.head.ref
    core.info(
      `${trigger} command used on current branch - setting ref to ${ref}`
    )
    // If no regex patterns matched, the IssueOps command was used in an unsupported way
  } else {
    ref = pr.data.head.ref
    message = dedent(`
              ### ⚠️ Invalid command
              
              Please use one of the following:
              
              - \`${trigger}\` - deploy **this** branch (\`${ref}\`)
              - \`${trigger} ${noop_trigger}\` - deploy **this** branch in **noop** mode (\`${ref}\`)
              - \`${trigger} ${stable_branch}\` - deploy the \`${stable_branch}\` branch
              > Note: \`${trigger} ${stable_branch}\` is often used for rolling back a change or getting back to a known working state
              `)
    return {message: message, status: false}
  }

  // Check to ensure PR CI checks are passing and the PR has been reviewed
  // mergeStateStatus is in the query below but not used at this time
  const query = `query($owner:String!, $name:String!, $number:Int!) {
                    repository(owner:$owner, name:$name) {
                        pullRequest(number:$number) {
                            reviewDecision
                            mergeStateStatus
                            commits(last: 1) {
                                nodes {
                                    commit {
                                        statusCheckRollup {
                                            state
                                        }
                                    }
                                }
                            }
                        }
                    }
                }`
  // Note: https://docs.github.com/en/graphql/overview/schema-previews#merge-info-preview (mergeStateStatus)
  const variables = {
    owner: context.repo.owner,
    name: context.repo.repo,
    number: parseInt(issue_number),
    headers: {
      Accept: 'application/vnd.github.merge-info-preview+json'
    }
  }
  // Make the GraphQL query
  const result = await octokit.graphql(query, variables)
  // Grab the reviewDecision from the GraphQL result
  const reviewDecision = result.repository.pullRequest.reviewDecision

  // Grab the statusCheckRollup state from the GraphQL result
  var commitStatus
  try {
    commitStatus =
      result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
        .state
  } catch (e) {
    core.info(`Could not retrieve PR commit status: ${e} - Handled: OK`)
    core.info('Skipping commit status check and proceeding...')
    commitStatus = null
  }

  // If everything is OK, print a nice message
  if (reviewDecision === 'APPROVED' && commitStatus === 'SUCCESS') {
    message = '✔️ PR is approved and all CI checks passed - OK'
    core.info(message)
    // CI checks have not been defined AND required reviewers have not been defined
  } else if (reviewDecision === null && commitStatus === null) {
    message =
      '⚠️ CI checks have not been defined and required reviewers have not been defined... proceeding - OK'
    core.info(message)
    // CI checks have been defined BUT required reviewers have not been defined
  } else if (reviewDecision === null && commitStatus === 'SUCCESS') {
    message =
      '⚠️ CI checks have been defined but required reviewers have not been defined... proceeding - OK'
    core.info(message)
    // If CI is passing and the PR has not been reviewed BUT it is a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'SUCCESS' &&
    noopMode
  ) {
    message = '✔️ All CI checks passed and **noop** requested - OK'
    core.info(message)
    core.info('note: noop deployments do not require pr review')
    // If CI is pending and the PR has not been reviewed BUT it is a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'PENDING' &&
    noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Reviews are not required for a noop deployment but CI checks must be passing in order to continue`
    return {message: message, status: false}
    // If CI is pending and reviewers have not been defined
  } else if (reviewDecision === null && commitStatus === 'PENDING') {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
    return {message: message, status: false}
    // If CI checked have not been defined, the PR has not been reviewed, and it IS a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === null &&
    noopMode
  ) {
    message = '✔️ CI checks have not been defined and **noop** requested - OK'
    core.info(message)
    core.info('note: noop deployments do not require pr review')
    // Always allow deployments to the "stable" branch regardless of CI checks or PR review
  } else if (regexCommandWithStableBranch.test(comment)) {
    message = '✔️ Deployment to the **stable** branch requested - OK'
    core.info(message)
    core.info(
      'note: deployments to the stable branch do not require PR review or passing CI checks on the working branch'
    )
    // If CI checks are pending, the PR has not been reviewed, and it is not a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'PENDING' &&
    !noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing and the PR must be reviewed in order to continue`
    return {message: message, status: false}
    // If the PR has been approved but CI checks are pending and it is not a noop deploy
  } else if (
    reviewDecision === 'APPROVED' &&
    commitStatus === 'PENDING' &&
    !noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
    return {message: message, status: false}
    // If CI is passing but the PR is missing an approval, let the user know
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'SUCCESS'
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks are passing but an approval is required before you can proceed with deployment`
    return {message: message, status: false}
    // If the PR is approved but CI is failing
  } else if (reviewDecision === 'APPROVED' && commitStatus === 'FAILURE') {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request is approved but CI checks are failing`
    return {message: message, status: false}
    // If the PR does not require approval but CI is failing
  } else if (reviewDecision === null && commitStatus === 'FAILURE') {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request does not require approvals but CI checks are failing`
    return {message: message, status: false}
    // If the PR is NOT reviewed and CI checks have NOT been defined and NOT a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === null &&
    !noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request is missing required approvals`
    core.info(
      'note: CI checks have not been defined so they will not be evaluated'
    )
    return {message: message, status: false}
    // If there are any other errors blocking deployment, let the user know
  } else {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> This is usually caused by missing PR approvals or CI checks failing`
    return {message: message, status: false}
  }

  // Format the PR comment message based on deployment mode
  var deploymentType
  if (noopMode) {
    deploymentType = '**noop** branch'
  } else {
    deploymentType = 'branch'
  }

  // Format the success message
  const log_url = `${process.env.GITHUB_SERVER_URL}/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
  const commentBody = dedent(`
    ### Deployment Triggered

    __${context.actor}__, started a __${deploymentType}__ deployment 🚀

    - __Branch__: \`${ref}\`
    - __Mode__: \`${deploymentType}\`

    You can watch the progress [here](${log_url}) 🔗
  `)

  // Make a comment on the pr with the successful results
  await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: context.issue.number,
    body: commentBody
  })

  // Return a success message
  return {message: message, status: true, ref: ref, noopMode: noopMode}
}
