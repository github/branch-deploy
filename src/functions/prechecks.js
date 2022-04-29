import * as core from '@actions/core'

// Runs precheck logic before the branch deployment can proceed
export async function prechecks(comment, context, octokit) {
  // Add a reaction to the comment that triggered this workflow
  const reactionRes = await octokit.rest.reactions.createForIssueComment({
    ...context.repo,
    comment_id: context.payload.comment.id,
    content: 'eyes'
  })
  core.setOutput('eyes', reactionRes.data.id)
  const permissionRes = await octokit.rest.repos.getCollaboratorPermissionLevel(
    {
      ...context.repo,
      username: context.actor
    }
  )

  var message

  if (permissionRes.status !== 200) {
    message = 'Permission check returns non-200 status: ${permissionRes.status}'
    core.setOutput('error', message)
    throw new Error(message)
  }
  // Check to ensure the user has at least write permission on the repo
  const actorPermission = permissionRes.data.permission
  if (!['admin', 'write'].includes(actorPermission)) {
    message = '👋  __' + context.actor + '__, seems as if you have not admin/write permission to branch-deploy this PR, permissions: ${actorPermission}'
    core.setOutput('error', message)
    throw new Error(message)
  }
  // Get the PR data
  const pr = await octokit.rest.pulls.get(
    {
      ...context.repo,
      pull_number: context.issue.number
    }
  )
  if (pr.status !== 200) {
    message = 'Could not retrieve PR info: ${permissionRes.status}'
    core.setOutput('error', message)
    throw new Error(message)
  }
  // check if comment starts with the env.DEPLOY_COMMAND variable followed by the 'main' branch or if this is for the current branch
  var ref;
  var noopMode = false;
  const regexCommandWithMain = /^\.deploy\s*(main)$/
  const regexCommandWithNoop = /^\.deploy\s*(noop)$/
  const regexCommandWithoutParameters = /^\.deploy\s*$/
  if (regexCommandWithMain.test(comment)) {
    ref = process.env.MAIN_BRANCH
    core.info(`${process.env.DEPLOY_COMMAND} command used with '${process.env.MAIN_BRANCH}' branch - setting ref to ${ref}`);
  } else if (regexCommandWithNoop.test(comment)) {
    ref = pr.data.head.ref;
    core.info(`${process.env.DEPLOY_COMMAND} command used on current branch with noop mode - setting ref to ${ref}`);
    noopMode = true;
  } else if (regexCommandWithoutParameters.test(comment)) {
    ref = pr.data.head.ref;
    core.info(`${process.env.DEPLOY_COMMAND} command used on current branch - setting ref to ${ref}`);
  } else {
    ref = pr.data.head.ref;
    message = `\
              ### ⚠️ Invalid command
              
              Please use one of the following:
              
              - \`${process.env.DEPLOY_COMMAND}\` - deploy **this** branch (\`${ref}\`)
              - \`${process.env.DEPLOY_COMMAND} noop\` - deploy **this** branch in **noop** mode (\`${ref}\`)
              - \`${process.env.DEPLOY_COMMAND} ${process.env.MAIN_BRANCH}\` - deploy the \`${process.env.MAIN_BRANCH}\` branch
              > Note: \`${process.env.DEPLOY_COMMAND} ${process.env.MAIN_BRANCH}\` is often used for rolling back a change or getting back to a known working state
              `;
    core.setOutput('error', message);
    throw new Error(message);
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
                }`;
  // Note: https://docs.github.com/en/graphql/overview/schema-previews#merge-info-preview (mergeStateStatus)
  const variables = {
    owner: context.repo.owner,
    name: context.repo.repo,
    number: parseInt(process.env.PR_NUMBER),
    headers: {
      Accept: "application/vnd.github.merge-info-preview+json"
    }
  }
  // Make the GraphQL query
  const result = await octokit.graphql(query, variables)
  // Grab the reviewDecision from the GraphQL result
  const reviewDecision = result.repository.pullRequest.reviewDecision;

  // Grab the statusCheckRollup state from the GraphQL result
  var commitStatus;
  try {
    commitStatus = result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.state;
  } catch (e) {
    core.info(`Could not retrieve PR commit status: ${e}`);
    core.info("Skipping commit status check and proceeding...");
    commitStatus = null;
  }
  // If everything is OK, print a nice message
  if (reviewDecision === "APPROVED" && commitStatus === "SUCCESS") {
    const message = "✔️ PR is approved and all CI checks passed - OK";
    core.info(message);
    // CI checks have not been defined AND required reviewers have not been defined
  } else if (reviewDecision === null && commitStatus === null) {
    const message = "⚠️ CI checks have not been defined and required reviewers have not been defined... proceeding - OK";
    core.info(message);
    // CI checks have been defined BUT required reviewers have not been defined
  } else if (reviewDecision === null && commitStatus === "SUCCESS") {
    const message = "⚠️ CI checks have been defined but required reviewers have not been defined... proceeding - OK";
    core.info(message);
    // If CI is passing and the PR has not been reviewed BUT it is a noop deploy
  } else if (reviewDecision === "REVIEW_REQUIRED" && commitStatus === "SUCCESS" && noopMode) {
    const message = "✔️ All CI checks passed and **noop** requested - OK";
    core.info(message);
    // If CI is passing but the PR is missing an approval, let the user know
  } else if (reviewDecision === "REVIEW_REQUIRED" && commitStatus === "SUCCESS") {
    const message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks are passing but an approval is required before you can proceed with deployment`;
    core.setOutput('error', message);
    throw new Error(message);
    // If the PR is approved but CI is failing
  } else if (reviewDecision === "APPROVED" && commitStatus === "FAILURE") {
    const message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request is approved but CI checks are failing`;
    core.setOutput('error', message);
    throw new Error(message);
    // If there are any other errors blocking deployment, let the user know
  } else {
    const message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> This is usually caused by missing PR approvals or CI checks failing`;
    core.setOutput('error', message);
    throw new Error(message);
  }
  // Export the value of noopMode for later steps
  core.setOutput('noop', noopMode);
  // Format the PR comment message based on deployment mode
  var deploymentType;
  if (noopMode) {
    deploymentType = "**noop** branch";
  } else {
    deploymentType = "branch";
  }
  core.setOutput('ref', ref)
  const log_url = `${process.env.GITHUB_SERVER_URL}/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
  const commentBody = `\
            🚀 __${context.actor}__, starting a ${deploymentType} deployment 
            - Branch: __${ref}__
            You can watch the progress [here](${log_url})
            `;
  await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: context.issue.number,
    body: commentBody
  })
}
