import * as core from '@actions/core'
import {validPermissions} from './valid-permissions'
import {isAdmin} from './admin'
import {stringToArray} from './string-to-array'
import {COLORS} from './colors'

// Runs precheck logic before the branch deployment can proceed
// :param context: The context of the event
// :param octokit: The octokit client
// :param data: An object containing data about the event, input options, and more
// :returns: An object that contains the results of the prechecks, message, ref, status, and noopMode
export async function prechecks(context, octokit, data) {
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

  // save sha
  var sha = pr.data.head.sha

  // set an output which is the branch name this PR is targeting to merge into
  const baseRef = pr?.data?.base?.ref
  core.setOutput('base_ref', baseRef)
  core.debug(`base_ref: ${baseRef}`)

  // Setup the skipCi, skipReview, and draft_permitted_targets variables
  const skipCiArray = await stringToArray(data.inputs.skipCi)
  const skipReviewsArray = await stringToArray(data.inputs.skipReviews)
  const draftPermittedTargetsArray = await stringToArray(
    data.inputs.draft_permitted_targets
  )
  const skipCi = skipCiArray.includes(data.environment)
  const skipReviews = skipReviewsArray.includes(data.environment)
  const allowDraftDeploy = draftPermittedTargetsArray.includes(data.environment)

  var ref = pr.data.head.ref
  var noopMode = data.environmentObj.noop
  var forkBypass = false

  // Check to see if the "stable" branch was used as the deployment target
  if (data.environmentObj.stable_branch_used === true) {
    // Make an API call to get the base branch
    const baseBranch = await octokit.rest.repos.getBranch({
      ...context.repo,
      branch: data.inputs.stable_branch
    })

    // the sha now becomes the sha of the base branch for "stabe branch" deployments
    sha = baseBranch.data.commit.sha

    ref = data.inputs.stable_branch
    forkBypass = true
    core.debug(
      `${data.inputs.trigger} command used with '${data.inputs.stable_branch}' branch - setting ref to ${ref}`
    )
  }

  // Determine whether to use the ref or sha depending on if the PR is from a fork or not
  // Note: We should not export fork values if the stable_branch is being used here
  if (pr.data.head.repo?.fork === true && forkBypass === false) {
    core.info(`🍴 the pull request is a ${COLORS.highlight}fork`)
    core.debug(`the pull request is from a fork, using sha instead of ref`)
    core.setOutput('fork', 'true')

    // If this Action's inputs have been configured to explicitly prevent forks, exit
    if (data.inputs.allowForks === false) {
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
    number: parseInt(data.inputs.issue_number),
    headers: {
      Accept: 'application/vnd.github.merge-info-preview+json'
    }
  }
  // Make the GraphQL query
  const result = await octokit.graphql(query, variables)

  // Check the reviewDecision
  var reviewDecision
  if (skipReviews) {
    // If skipReviews is true, we bypass the results the graphql
    reviewDecision = 'skip_reviews'
  } else {
    // Otherwise, grab the reviewDecision from the GraphQL result
    reviewDecision = result.repository.pullRequest.reviewDecision
  }

  // Grab the mergeStateStatus from the GraphQL result
  const mergeStateStatus = result.repository.pullRequest.mergeStateStatus

  // Grab the draft status
  const isDraft = pr.data.draft

  // log some extra details if the state of the PR is in a 'draft'
  if (isDraft && !allowDraftDeploy) {
    core.warning(
      `deployment requested on a draft PR from a non-allowed environment`
    )
  } else if (isDraft && allowDraftDeploy) {
    core.info(
      `📓 deployment requested on a ${COLORS.highlight}draft${COLORS.reset} pull request from an ${COLORS.highlight}allowed${COLORS.reset} environment`
    )
  }

  // Grab the statusCheckRollup state from the GraphQL result
  var commitStatus
  try {
    // Check to see if skipCi is set for the environment being used
    if (skipCi) {
      core.info(
        `⏩ CI checks have been ${COLORS.highlight}disabled${COLORS.reset} for the ${COLORS.highlight}${data.environment}${COLORS.reset} environment`
      )
      commitStatus = 'skip_ci'
    }

    // If there are no CI checks defined at all, we can set the commitStatus to null
    else if (
      result.repository.pullRequest.commits.nodes[0].commit.checkSuites
        .totalCount === 0
    ) {
      core.info('💡 no CI checks have been defined for this pull request')
      commitStatus = null

      // If there are CI checked defined, we need to check for the 'state' of the latest commit
    } else {
      commitStatus =
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .state
    }
  } catch (e) {
    core.debug(
      `could not retrieve PR commit status: ${e} - Handled: ${COLORS.success}OK`
    )
    core.debug('this repo may not have any CI checks defined')
    core.debug('skipping commit status check and proceeding...')
    commitStatus = null

    // Try to display the raw GraphQL result for debugging purposes
    try {
      core.debug('raw graphql result for debugging:')
      core.debug(result)
    } catch {
      // istanbul ignore next
      core.debug(
        'Could not output raw graphql result for debugging - This is bad'
      )
    }
  }

  // Get admin data
  const userIsAdmin = await isAdmin(context)

  // Check to see if the branch is behind the base branch
  var behind = false
  // if the mergeStateStatus is 'BLOCKED' or 'HAS_HOOKS' check to see if the branch is out-of-date with the base branch
  if (mergeStateStatus === 'BLOCKED' || mergeStateStatus === 'HAS_HOOKS') {
    // Make an API call to get the base branch
    const baseBranch = await octokit.rest.repos.getBranch({
      ...context.repo,
      branch: pr.data.base.ref
    })

    // Make an API call to compare the base branch and the PR branch
    const compare = await octokit.rest.repos.compareCommits({
      ...context.repo,
      base: baseBranch.data.commit.sha,
      head: pr.data.head.sha
    })

    // If the PR branch is behind the base branch, set the behind variable to true
    if (compare.data.behind_by > 0) {
      behind = true
    } else {
      behind = false
    }

    // If the mergeStateStatus is 'BEHIND' set the behind variable to true
  } else if (mergeStateStatus === 'BEHIND') {
    behind = true
  }

  // log values for debugging
  core.debug('precheck values for debugging:')
  core.debug(`reviewDecision: ${reviewDecision}`)
  core.debug(`mergeStateStatus: ${mergeStateStatus}`)
  core.debug(`commitStatus: ${commitStatus}`)
  core.debug(`userIsAdmin: ${userIsAdmin}`)
  core.debug(`update_branch: ${data.inputs.update_branch}`)
  core.debug(`skipCi: ${skipCi}`)
  core.debug(`skipReviews: ${skipReviews}`)
  core.debug(`allowForks: ${data.inputs.allowForks}`)
  core.debug(`forkBypass: ${forkBypass}`)
  core.debug(`environment: ${data.environment}`)
  core.debug(`behind: ${behind}`)

  // Always allow deployments to the "stable" branch regardless of CI checks or PR review
  if (data.environmentObj.stable_branch_used === true) {
    message = `✅ deployment to the ${COLORS.highlight}stable${COLORS.reset} branch requested`
    core.info(message)
    core.debug(
      'note: deployments to the stable branch do not require PR review or passing CI checks on the working branch'
    )

    // If allow_sha_deployments are enabled and the sha is not null, always allow the deployment
    // note: this is an "unsafe" option
    // this option is "unsafe" because it bypasses all checks and we cannot guarantee that the sha being deployed has...
    // ... passed any CI checks or has been reviewed. Additionally, the user could be deploying a sha from a forked repo...
    // ... which could contain malicious code or a sha that has not been reviewed or tested from another user's branch...
    // ... this style of deployment is not recommended and should only be used in very specific situations. Read more here:
    // https://github.com/github/branch-deploy/blob/main/docs/sha-deployments.md
  } else if (
    data.inputs.allow_sha_deployments === true &&
    data.environmentObj.sha !== null
  ) {
    message = `✅ deployment requested using an exact ${COLORS.highlight}sha${COLORS.reset}`
    core.info(message)
    core.warning(
      `⚠️ sha deployments are ${COLORS.warning}unsafe${COLORS.reset} as they bypass all checks - read more here: https://github.com/github/branch-deploy/blob/main/docs/sha-deployments.md`
    )
    core.debug(`an exact sha was used, using sha instead of ref`)
    // since an exact sha was used, we overwrite both the ref and sha values with the exact sha that was provided by the user
    sha = data.environmentObj.sha
    ref = data.environmentObj.sha
    core.setOutput('sha_deployment', sha)

    // If allow_sha_deployments are not enabled and a sha was provided, exit
  } else if (
    data.inputs.allow_sha_deployments === false &&
    data.environmentObj.sha !== null
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- allow_sha_deployments: \`${data.inputs.allow_sha_deployments}\`\n\n> sha deployments have not been enabled`
    return {message: message, status: false}

    // If update_branch is not "disabled", check the mergeStateStatus to see if it is BEHIND
  } else if (
    (commitStatus === 'SUCCESS' ||
      commitStatus === null ||
      commitStatus === 'skip_ci') &&
    data.inputs.update_branch !== 'disabled' &&
    behind === true
  ) {
    // If the update_branch param is set to "warn", warn and exit
    if (data.inputs.update_branch === 'warn') {
      message = `### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: \`${mergeStateStatus}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> Please ensure your branch is up to date with the \`${data.inputs.stable_branch}\` branch and try again`
      return {message: message, status: false}
    }

    // Execute the logic below only if update_branch is set to "force"
    core.debug(
      `update_branch is set to ${COLORS.highlight}${data.inputs.update_branch}`
    )

    // Make an API call to update the PR branch
    try {
      const result = await octokit.rest.pulls.updateBranch({
        ...context.repo,
        pull_number: context.issue.number
      })

      // If the result is not a 202, return an error message and exit
      if (result.status !== 202) {
        message = `### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: \`${result.status}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> Failed to update pull request branch with \`${data.inputs.stable_branch}\``
        return {message: message, status: false}
      }

      // If the result is a 202, let the user know the branch was updated and exit so they can retry
      message = `### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: \`${mergeStateStatus}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> I went ahead and updated your branch with \`${data.inputs.stable_branch}\` - Please try again once this operation is complete`
      return {message: message, status: false}
    } catch (error) {
      message = `### ⚠️ Cannot proceed with deployment\n\n\`\`\`text\n${error.message}\n\`\`\``
      return {message: message, status: false}
    }

    // If the mergeStateStatus is in DRAFT and allowDraftDeploy is true, alert and exit
  } else if (isDraft && !allowDraftDeploy) {
    message = `### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state`
    return {message: message, status: false}

    // If the mergeStateStatus is in DIRTY, alert and exit
  } else if (mergeStateStatus === 'DIRTY') {
    message = `### ⚠️ Cannot proceed with deployment\n- mergeStateStatus: \`${mergeStateStatus}\`\n\n> A merge commit cannot be cleanly created`
    return {message: message, status: false}

    // If everything is OK, print a nice message
  } else if (reviewDecision === 'APPROVED' && commitStatus === 'SUCCESS') {
    message = '✅ PR is approved and all CI checks passed'
    core.info(message)

    // CI checks have not been defined AND required reviewers have not been defined
  } else if (reviewDecision === null && commitStatus === null) {
    message =
      '🎛️ CI checks have not been defined and required reviewers have not been defined'
    core.info(message)

    // CI checks have been defined BUT required reviewers have not been defined
  } else if (reviewDecision === null && commitStatus === 'SUCCESS') {
    message =
      '🎛️ CI checks have been defined but required reviewers have not been defined'
    core.info(message)

    // CI checks are passing and reviews are set to be bypassed
  } else if (commitStatus === 'SUCCESS' && reviewDecision == 'skip_reviews') {
    message =
      '✅ CI checks passed and required reviewers have been disabled for this environment'
    core.info(message)

    // CI checks have not been defined and reviews are set to be bypassed
  } else if (commitStatus === null && reviewDecision === 'skip_reviews') {
    message =
      '✅ CI checks have not been defined and required reviewers have been disabled for this environment'
    core.info(message)

    // CI checks are set to be bypassed and the pull request is approved
  } else if (commitStatus === 'skip_ci' && reviewDecision === 'APPROVED') {
    message =
      '✅ CI requirements have been disabled for this environment and the PR has been approved'
    core.info(message)

    // CI checks are set to be bypassed BUT required reviews have not been defined
  } else if (commitStatus === 'skip_ci' && reviewDecision === null) {
    message =
      '🎛️ CI requirements have been disabled for this environment and required reviewers have not been defined'
    core.info(message)

    // CI checks are set to be bypassed and the PR has not been reviewed BUT it is a noop deploy
  } else if (
    commitStatus === 'skip_ci' &&
    reviewDecision === 'REVIEW_REQUIRED' &&
    noopMode
  ) {
    message =
      '✅ CI requirements have been disabled for this environment and **noop** requested'
    core.info(message)
    core.info('note: noop deployments do not require pr review')

    // If CI checks are set to be bypassed and the deployer is an admin
  } else if (commitStatus === 'skip_ci' && userIsAdmin === true) {
    message =
      '✅ CI requirements have been disabled for this environment and approval is bypassed due to admin rights'
    core.info(message)

    // If CI checks are set to be bypassed and PR reviews are also set to by bypassed
  } else if (commitStatus === 'skip_ci' && reviewDecision === 'skip_reviews') {
    message =
      '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment'
    core.info(message)

    // If CI is passing and the PR has not been reviewed BUT it is a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'SUCCESS' &&
    noopMode
  ) {
    message = `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`
    core.info(message)
    core.debug('note: noop deployments do not require pr review')

    // If CI is passing and the deployer is an admin
  } else if (commitStatus === 'SUCCESS' && userIsAdmin === true) {
    message = '✅ CI is passing and approval is bypassed due to admin rights'
    core.info(message)

    // If CI is undefined and the deployer is an admin
  } else if (commitStatus === null && userIsAdmin === true) {
    message =
      '✅ CI checks have not been defined and approval is bypassed due to admin rights'
    core.info(message)

    // If CI has not been defined but the PR has been approved
  } else if (commitStatus === null && reviewDecision === 'APPROVED') {
    message = '✅ CI checks have not been defined but the PR has been approved'
    core.info(message)

    // If CI is pending and the PR has not been reviewed BUT it is a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'PENDING' &&
    noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Reviews are not required for a noop deployment but CI checks must be passing in order to continue`
    return {message: message, status: false}

    // If CI is pending and reviewers have not been defined and it is NOT a noop deploy
  } else if (
    reviewDecision === null &&
    commitStatus === 'PENDING' &&
    !noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
    return {message: message, status: false}

    // If CI is pending and reviewers have not been defined and it IS a noop deploy
  } else if (
    reviewDecision === null &&
    commitStatus === 'PENDING' &&
    noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
    core.info(
      'note: even noop deploys require CI to finish and be in a passing state'
    )
    return {message: message, status: false}

    // If CI checked have not been defined, the PR has not been reviewed, and it IS a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === null &&
    noopMode
  ) {
    message = `✅ CI checks have not been defined and ${COLORS.highlight}noop${COLORS.reset} requested`
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

    // If the PR is considered 'approved' but CI checks are pending and it is not a noop deploy
  } else if (
    (reviewDecision === 'APPROVED' ||
      reviewDecision === null ||
      reviewDecision === 'skip_reviews') &&
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
  } else if (
    (reviewDecision === null || reviewDecision === 'skip_reviews') &&
    commitStatus === 'FAILURE'
  ) {
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

    // If the PR is NOT reviewed and CI checks have been disabled and NOT a noop deploy
  } else if (
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'skip_ci' &&
    !noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request is missing required approvals`
    core.info(
      'note: CI checks are disabled for this environment so they will not be evaluated'
    )
    return {message: message, status: false}

    // If there are any other errors blocking deployment, let the user know
  } else {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> This is usually caused by missing PR approvals or CI checks failing`
    return {message: message, status: false}
  }

  // Return a success message
  return {
    message: message,
    status: true,
    ref: ref,
    noopMode: noopMode,
    sha: sha
  }
}
