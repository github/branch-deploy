import * as core from '@actions/core'
import dedent from 'dedent-js'
import {validPermissions} from './valid-permissions'
import {isAdmin} from './admin'

// Runs precheck logic before the branch deployment can proceed
// :param comment: The comment body of the event
// :param trigger: The trigger word to check for
// :param update_branch: Defines the action to take if the branch is out-of-date
// :param stable_branch: The "stable" or "base" branch to deploy to (e.g. master|main)
// :param issue_number: The issue number of the event
// :param allowForks: Boolean which defines whether the Action can run from forks or not
// :param context: The context of the event
// :param octokit: The octokit client
// :returns: An object that contains the results of the prechecks, message, ref, status, and noopMode
export async function prechecks(
  comment,
  trigger,
  noop_trigger,
  update_branch,
  stable_branch,
  issue_number,
  allowForks,
  context,
  octokit
) {
  // Setup the message variable
  var message

  // Check if the user has valid permissions
  const validPermissionsRes = await validPermissions(octokit, context)
  if (validPermissionsRes !== true) {
    return {message: validPermissionsRes, status: false}
  }

  // Get the PR data
  const pr = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: context.issue.number
  })
  if (pr.status !== 200) {
    message = `Could not retrieve PR info: ${pr.status}`
    return {message: message, status: false}
  }

  // check if comment starts with the env.DEPLOY_COMMAND variable followed by the 'main' branch or if this is for the current branch
  var ref = pr.data.head.ref
  var noopMode = false
  var forkBypass = false

  // Regex statements for checking the trigger message
  const regexCommandWithStableBranch = new RegExp(
    `^\\${trigger}\\s*(${stable_branch}).*$`,
    'i'
  )
  const regexCommandWithNoop = new RegExp(
    `^\\${trigger}\\s*(${noop_trigger})$`,
    'i'
  )
  const regexCommandWithoutParameters = new RegExp(`^\\${trigger}\\s*$`, 'i')
  const regexCommandWithParameters = new RegExp(`^\\${trigger}\\s+.*$`, 'i')

  // Check to see if the "stable" branch was used as the deployment target
  if (regexCommandWithStableBranch.test(comment)) {
    ref = stable_branch
    forkBypass = true
    core.info(
      `${trigger} command used with '${stable_branch}' branch - setting ref to ${ref}`
    )
    // Check to see if the IssueOps command requested noop mode
  } else if (regexCommandWithNoop.test(comment)) {
    core.info(
      `${trigger} command used on current branch with noop mode - setting ref to ${ref}`
    )
    noopMode = true
    // Check to see if the IssueOps command was used in a basic form with no other params
  } else if (regexCommandWithoutParameters.test(comment)) {
    core.info(
      `${trigger} command used on current branch - setting ref to ${ref}`
    )
    // Check to see if the IssueOps command was used in a basic form with other params
  } else if (regexCommandWithParameters.test(comment)) {
    core.info(`issueops command used with parameters`)
    if (comment.includes(noop_trigger)) {
      core.info('noop mode used with parameters')
      noopMode = true
    }
    // If no regex patterns matched, the IssueOps command was used in an unsupported way
  } else {
    message = dedent(`
              ### ⚠️ Invalid command
              
              Please use one of the following:
              
              - \`${trigger}\` - deploy **this** branch (\`${ref}\`)
              - \`${trigger} ${noop_trigger}\` - deploy **this** branch in **noop** mode (\`${ref}\`)
              - \`${trigger} ${stable_branch}\` - deploy the \`${stable_branch}\` branch
              - \`${trigger} to <environment>\` - deploy **this** branch to the specified environment
              > Note: \`${trigger} ${stable_branch}\` is often used for rolling back a change or getting back to a known working state
              `)
    return {message: message, status: false}
  }

  // Determine whether to use the ref or sha depending on if the PR is from a fork or not
  // Note: We should not export fork values if the stable_branch is being used here
  if (pr.data.head.repo?.fork === true && forkBypass === false) {
    core.info(`PR is from a fork, using sha instead of ref`)
    core.setOutput('fork', 'true')

    // If this Action's inputs have been configured to explicitly prevent forks, exit
    if (allowForks === false) {
      message = `### ⚠️ Cannot proceed with deployment\n\nThis Action has been explicity configured to prevent deployments from forks. You can change this via this Action's inputs if needed`
      return {message: message, status: false}
    }

    // Set some outputs specific to forks
    const label = pr.data.head.label
    const forkRef = pr.data.head.ref
    const forkCheckout = `${label.replace(':', '-')} ${forkRef}`
    const forkFullName = pr.data.head.repo.full_name
    core.setOutput('fork_ref', forkRef)
    core.setOutput('fork_label', label)
    core.setOutput('fork_checkout', forkCheckout)
    core.setOutput('fork_full_name', forkFullName)
    core.debug(`fork_ref: ${forkRef}`)
    core.debug(`fork_label: ${label}`)
    core.debug(`fork_checkout: ${forkCheckout}`)
    core.debug(`fork_full_name: ${forkFullName}`)

    // If this pull request is a fork, use the exact SHA rather than the branch name
    ref = pr.data.head.sha
  } else {
    // If this PR is NOT a fork, we can safely use the branch name
    core.setOutput('fork', 'false')
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
                                        checkSuites {
                                          totalCount
                                        }
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

  // Grab the mergeStateStatus from the GraphQL result
  const mergeStateStatus = result.repository.pullRequest.mergeStateStatus

  // Grab the statusCheckRollup state from the GraphQL result
  var commitStatus
  try {
    // If there are no CI checks defined at all, we can set the commitStatus to success
    if (
      result.repository.pullRequest.commits.nodes[0].commit.checkSuites
        .totalCount === 0
    ) {
      core.info(
        'No CI checks have been defined for this pull request, proceeding - OK'
      )
      commitStatus = 'SUCCESS'
      // If there are CI checked defined, we need to check for the 'state' of the latest commit
    } else {
      commitStatus =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .state
    }
  } catch (e) {
    core.info(`Could not retrieve PR commit status: ${e} - Handled: OK`)
    core.info('Skipping commit status check and proceeding...')
    commitStatus = null
  }

  // Always allow deployments to the "stable" branch regardless of CI checks or PR review
  if (regexCommandWithStableBranch.test(comment)) {
    message = '✔️ Deployment to the **stable** branch requested - OK'
    core.info(message)
    core.info(
      'note: deployments to the stable branch do not require PR review or passing CI checks on the working branch'
    )

    // If update_branch is not "disabled", check the mergeStateStatus to see if it is BEHIND
  } else if (
    (commitStatus === 'SUCCESS' || commitStatus === null) &&
    update_branch !== 'disabled' &&
    mergeStateStatus === 'BEHIND'
  ) {
    // If the update_branch param is set to "warn", warn and exit
    if (update_branch === 'warn') {
      message = `### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: \`${mergeStateStatus}\`\n- update_branch: \`${update_branch}\`\n\n> Please ensure your branch is up to date with the \`${stable_branch}\` and try again`
      return {message: message, status: false}
    }

    // Execute the logic below only if update_branch is set to "force"
    core.info(`update_branch is set to ${update_branch} - proceeding...`)

    // Make an API call to update the PR branch
    try {
      const result = await octokit.rest.pulls.updateBranch({
        ...context.repo,
        pull_number: context.issue.number
      })

      // If the result is not a 202, return an error message and exit
      if (result.status !== 202) {
        message = `### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: \`${result.status}\`\n- update_branch: \`${update_branch}\`\n\n> Failed to update pull request branch with \`${stable_branch}\``
        return {message: message, status: false}
      }

      // If the result is a 202, let the user know the branch was updated and exit so they can retry
      message = `### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: \`${mergeStateStatus}\`\n- update_branch: \`${update_branch}\`\n\n> I went ahead and updated your branch with \`${stable_branch}\` - Please try again once this operation is complete`
      return {message: message, status: false}
    } catch (error) {
      message = `### ⚠️ Cannot proceed with deployment\n\n\`\`\`text\n${error.message}\n\`\`\``
      return {message: message, status: false}
    }

    // If the mergeStateStatus is in DRAFT, alert and exit
  } else if (mergeStateStatus === 'DRAFT') {
    message = `### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state`
    return {message: message, status: false}

    // If the mergeStateStatus is in DIRTY, alert and exit
  } else if (mergeStateStatus === 'DIRTY') {
    message = `### ⚠️ Cannot proceed with deployment\n- mergeStateStatus: \`${mergeStateStatus}\`\n\n> A merge commit cannot be cleanly created`
    return {message: message, status: false}

    // If everything is OK, print a nice message
  } else if (reviewDecision === 'APPROVED' && commitStatus === 'SUCCESS') {
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

    // If CI is passing and the deployer is an admin
  } else if (commitStatus === 'SUCCESS' && (await isAdmin(context)) === true) {
    message =
      '✔️ CI is passing and approval is bypassed due to admin rights - OK'
    core.info(message)

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

  // Return a success message
  return {message: message, status: true, ref: ref, noopMode: noopMode}
}
