import * as core from '@actions/core'
import {validPermissions} from './valid-permissions.js'
import {isAdmin} from './admin.js'
import {isOutdated} from './outdated-check.js'
import {stringToArray} from './string-to-array.js'
import {COLORS} from './colors.js'
import {API_HEADERS} from './api-headers.js'

// Runs precheck logic before the branch deployment can proceed
// :param context: The context of the event
// :param octokit: The octokit client
// :param data: An object containing data about the event, input options, and more
// :returns: An object that contains the results of the prechecks, message, ref, status, and noopMode
export async function prechecks(context, octokit, data) {
  // Setup the message variable
  var message

  // Check if the user has valid permissions
  const validPermissionsRes = await validPermissions(
    octokit,
    context,
    data.inputs.permissions
  )
  if (validPermissionsRes !== true) {
    return {message: validPermissionsRes, status: false}
  }

  // Get the PR data
  const pr = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: context.issue.number,
    headers: API_HEADERS
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
  const skipCiArray = stringToArray(data.inputs.skipCi)
  const skipReviewsArray = stringToArray(data.inputs.skipReviews)
  const draftPermittedTargetsArray = stringToArray(
    data.inputs.draft_permitted_targets
  )
  const skipCi = skipCiArray.includes(data.environment)
  const skipReviews = skipReviewsArray.includes(data.environment)
  const allowDraftDeploy = draftPermittedTargetsArray.includes(data.environment)
  const checks = data.inputs.checks
  const ignoredChecks = data.inputs.ignored_checks || []

  var ref = pr.data.head.ref
  var noopMode = data.environmentObj.noop
  var forkBypass = false
  const isFork = pr?.data?.head?.repo?.fork == true

  // Make an API call to get the base branch
  // https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#get-a-branch
  const stableBaseBranch = await octokit.rest.repos.getBranch({
    ...context.repo,
    branch: data.inputs.stable_branch,
    headers: API_HEADERS
  })

  // we also want to output the default branch tree sha of the base branch (e.g. the default branch)
  // this can be useful for subsequent workflow steps that may need to do commit comparisons
  core.setOutput(
    'default_branch_tree_sha',
    stableBaseBranch?.data?.commit?.commit?.tree?.sha
  )

  // Check to see if the "stable" branch was used as the deployment target
  if (data.environmentObj.stable_branch_used === true) {
    // the sha now becomes the sha of the base branch for "stable branch" deployments
    sha = stableBaseBranch.data.commit.sha
    ref = data.inputs.stable_branch

    // setting forkBypass to true because the stable branch is being used as the deployment target, even though the command is executed on a fork.
    forkBypass = true
    core.debug(
      `${data.inputs.trigger} command used with '${data.inputs.stable_branch}' branch - setting ref to ${ref}`
    )
  }

  const nonDefaultTargetBranchUsed = data.inputs.stable_branch !== baseRef
  const isNotStableBranchDeploy = !data.environmentObj.stable_branch_used
  const nonDefaultDeploysAllowed =
    data.inputs.allow_non_default_target_branch_deployments
  const securityWarningsEnabled = data.inputs.use_security_warnings

  if (nonDefaultTargetBranchUsed) {
    core.setOutput('non_default_target_branch_used', 'true')
  }

  // If the PR is targeting a branch other than the default branch (and it is not a stable branch deploy) reject the deployment, unless the Action is explicitly configured to allow it
  if (
    isNotStableBranchDeploy &&
    nonDefaultTargetBranchUsed &&
    !nonDefaultDeploysAllowed
  ) {
    return {
      message: `### ⚠️ Cannot proceed with deployment\n\nThis pull request is attempting to merge into the \`${baseRef}\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`). This deployment has been rejected since it could be dangerous to proceed.`,
      status: false
    }
  }

  if (
    isNotStableBranchDeploy &&
    nonDefaultTargetBranchUsed &&
    nonDefaultDeploysAllowed &&
    securityWarningsEnabled
  ) {
    core.warning(
      `🚨 this pull request is attempting to merge into the \`${baseRef}\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`) - this action is potentially dangerous`
    )
  }

  // Determine whether to use the ref or sha depending on if the PR is from a fork or not
  // Note: We should not export fork values if the stable_branch is being used here
  if (isFork === true && forkBypass === false) {
    core.info(`🍴 the pull request is a ${COLORS.highlight}fork${COLORS.reset}`)
    core.info(
      `🍴 fork: the ref (${COLORS.highlight}${ref}${COLORS.reset}) output will be replaced with the commit sha (${COLORS.highlight}${pr.data.head.sha}${COLORS.reset})`
    )
    core.debug(`the pull request is from a fork, using sha instead of ref`)
    core.setOutput('fork', 'true')
    core.saveState('fork', 'true')

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
    core.saveState('fork', 'false')
  }

  // Check to ensure PR CI checks are passing and the PR has been reviewed
  const query = `query($owner:String!, $name:String!, $number:Int!) {
                  repository(owner:$owner, name:$name) {
                    pullRequest(number:$number) {
                      reviewDecision
                      mergeStateStatus
                      reviews(states: APPROVED) {
                        totalCount
                      }
                      commits(last: 1) {
                        nodes {
                          commit {
                            oid
                            checkSuites {
                              totalCount
                            }
                            statusCheckRollup {
                              state
                              contexts(first:100) {
                                nodes {
                                  ... on CheckRun {
                                    isRequired(pullRequestNumber:$number)
                                    conclusion
                                    name
                                  }
                                }
                              }
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
    number: parseInt(data.issue_number),
    headers: {
      Accept: 'application/vnd.github.merge-info-preview+json'
    }
  }
  // Make the GraphQL query
  const result = await octokit.graphql(query, variables)

  // Fetch the commit oid which is the SHA1 hash of the commit
  const commit_oid =
    result?.repository?.pullRequest?.commits?.nodes[0]?.commit?.oid

  // Check the reviewDecision
  var reviewDecision
  if (skipReviews && isFork === false) {
    // If skipReviews is true, we bypass the results the graphql
    // This logic is not applied on forks as all PRs from forks must have the required reviews (if requested)
    reviewDecision = 'skip_reviews'
  } else {
    // Otherwise, grab the reviewDecision from the GraphQL result
    reviewDecision = result.repository.pullRequest.reviewDecision

    if (reviewDecision === 'APPROVED') {
      core.info(
        `🟢 the pull request is ${COLORS.success}approved${COLORS.reset}`
      )
    }
  }

  // If pull request reviews are not required and the PR is from a fork and the request isn't a deploy to the stable branch, we need to alert the user that this is potentially dangerous
  if (reviewDecision === null && isFork === true && forkBypass === false) {
    core.warning(
      '🚨 pull request reviews are not enforced by this repository and this operation is being performed on a fork - this operation is dangerous! You should require reviews via branch protection settings (or rulesets) to ensure that the changes being deployed are the changes that you reviewed.'
    )
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
  var filterChecksResults
  try {
    // Check to see if skipCi is set for the environment being used
    if (skipCi) {
      core.info(
        `⏩ CI checks have been ${COLORS.highlight}disabled${COLORS.reset} for the ${COLORS.highlight}${data.environment}${COLORS.reset} environment`
      )
      commitStatus = 'skip_ci'

      // If there are no CI checks defined at all, we can set the commitStatus to null
    } else if (
      result.repository.pullRequest.commits.nodes[0].commit.checkSuites
        .totalCount === 0
    ) {
      core.info('💡 no CI checks have been defined for this pull request')
      commitStatus = null

      // If only the required checks need to pass
    } else if (checks === 'required') {
      filterChecksResults = filterChecks(
        checks,
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .contexts.nodes,
        ignoredChecks,
        true
      )
      commitStatus = filterChecksResults.status

      // If there are CI checked defined, we need to check for the 'state' of the latest commit
    } else if (checks === 'all') {
      // if there are no ignored checks, we can just check the state of the latest commit
      if (ignoredChecks.length === 0) {
        commitStatus =
          result.repository.pullRequest.commits.nodes[0].commit
            .statusCheckRollup.state

        // if there are ignored checks, we need to filter out the ignored checks from the graphql result
      } else {
        filterChecksResults = filterChecks(
          checks,
          result.repository.pullRequest.commits.nodes[0].commit
            .statusCheckRollup.contexts.nodes,
          ignoredChecks,
          false
        )
        commitStatus = filterChecksResults.status
      }

      // if we make it here, checks is not a string (e.g. 'all' or 'required') but it is actually an array of the exact checks...
      // that a user wants to pass in order for the deployment to proceed
    } else {
      filterChecksResults = filterChecks(
        checks,
        result.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup
          .contexts.nodes,
        ignoredChecks,
        false
      )
      commitStatus = filterChecksResults.status
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

  // Make an API call to get the base branch that the pull request is targeting
  const baseBranch = await octokit.rest.repos.getBranch({
    ...context.repo,
    branch: pr.data.base.ref,
    headers: API_HEADERS
  })

  // Check to see if the branch is outdated or not based on the Action's configuration
  const outdated = await isOutdated(context, octokit, {
    baseBranch: baseBranch, // this is the base branch that the PR is targeting
    stableBaseBranch: stableBaseBranch, // this is the 'stable' branch (aka: the default branch of the repo)
    pr: pr,
    mergeStateStatus: mergeStateStatus,
    outdated_mode: data.inputs.outdated_mode
  })

  const approvedReviewsCount =
    result?.repository?.pullRequest?.reviews?.totalCount

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
  core.debug(`outdated: ${outdated.outdated}`)
  core.debug(`approvedReviewsCount: ${approvedReviewsCount}`)

  // output values
  core.setOutput('commit_status', commitStatus)
  core.setOutput('review_decision', reviewDecision)
  core.setOutput('is_outdated', outdated.outdated)
  core.setOutput('merge_state_status', mergeStateStatus)
  core.setOutput('approved_reviews_count', approvedReviewsCount)

  // save state values
  core.saveState('review_decision', reviewDecision)
  core.saveState('approved_reviews_count', approvedReviewsCount)

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

    // If the commit sha (from the PR head) does not exactly match the sha returned from the graphql query, something is wrong
    // This could occur if the branch had a commit pushed to it in between the rest call and the graphql query
    // In this case, we should not proceed with the deployment as we cannot guarantee the sha is safe for a variety of reasons
  } else if (sha !== commit_oid) {
    message = `### ⚠️ Cannot proceed with deployment\n\nThe commit sha from the PR head does not match the commit sha from the graphql query\n\n- sha: \`${sha}\`\n- commit_oid: \`${commit_oid}\`\n\nThis is unexpected and could be caused by a commit being pushed to the branch after the initial rest call was made. Please review your PR timeline and try again.`
    return {message: message, status: false}

    // If the requested operation (deploy or noop) is taking place on a fork, that fork is NOT using the stable branch (i.e. `.deploy main`), the PR is...
    // not approved -> do not allow bypassing the lack of reviews. Enforce that ALL PRs originating from forks must have the required reviews.
    // Deploying forks without reviews is a security risk and will not be allowed
    // This logic will even apply to noop deployments and ignore the value of skip_reviews if it is set out of an abundance of caution
    // This logic will also apply even if the requested deployer is an admin
  } else if (
    isFork === true &&
    forkBypass === false &&
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED')
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n\n> All deployments from forks **must** have the required reviews before they can proceed. Please ensure this PR has been reviewed and approved before trying again.`
    core.debug(
      `rejecting deployment from fork without required reviews - noopMode: ${noopMode}`
    )
    return {message: message, status: false}

    // If allow_sha_deployments are not enabled and a sha was provided, exit
  } else if (
    data.inputs.allow_sha_deployments === false &&
    data.environmentObj.sha !== null
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- allow_sha_deployments: \`${data.inputs.allow_sha_deployments}\`\n\n> sha deployments have not been enabled`
    return {message: message, status: false}

    // If update_branch is not "disabled", proceed with 'update_branch' logic
  } else if (
    (commitStatus === 'SUCCESS' ||
      commitStatus === null ||
      commitStatus === 'skip_ci') &&
    data.inputs.update_branch !== 'disabled' &&
    outdated.outdated === true
  ) {
    // If the update_branch param is set to "warn", warn and exit
    if (data.inputs.update_branch === 'warn') {
      message = `### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: \`${mergeStateStatus}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> Please ensure your branch is up to date with the \`${outdated.branch}\` branch and try again`
      return {message: message, status: false}
    }

    // Execute the logic below only if update_branch is set to "force"
    // This logic will attempt to update the pull request's branch so that it is no longer 'behind'
    core.debug(
      `update_branch is set to ${COLORS.highlight}${data.inputs.update_branch}${COLORS.reset}`
    )

    // Make an API call to update the PR branch
    try {
      const result = await octokit.rest.pulls.updateBranch({
        ...context.repo,
        pull_number: context.issue.number,
        headers: API_HEADERS
      })

      // If the result is not a 202, return an error message and exit
      if (result.status !== 202) {
        message = `### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: \`${result.status}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> Failed to update pull request branch with the \`${outdated.branch}\` branch`
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
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    noopMode
  ) {
    message =
      '✅ CI requirements have been disabled for this environment and **noop** requested'
    core.info(message)
    core.info(
      'note: noop deployments do not require pr review and ignore "changes requested" reviews'
    )

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
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === 'SUCCESS' &&
    noopMode
  ) {
    message = `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`
    core.info(message)
    core.debug(
      'note: noop deployments do not require pr review and ignore "changes requested" reviews'
    )

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
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
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
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === null &&
    noopMode
  ) {
    message = `✅ CI checks have not been defined and ${COLORS.highlight}noop${COLORS.reset} requested`
    core.info(message)
    core.info(
      'note: noop deployments do not require pr review and ignore "changes requested" reviews'
    )

    // If CI checks are pending, the PR has not been reviewed, and it is not a noop deploy
  } else if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === 'PENDING' &&
    !noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing and the PR must be approved in order to continue`
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

    // Regardless of the reviewDecision or noop, if the commitStatus is 'MISSING' this means that a user has explicitly requested a CI check to be passing with the `checks: <check1>,<check2>,<etc>` input option, but the check could not be found in the GraphQL result
    // In this case, we should alert the user that the check could not be found and exit
  } else if (commitStatus === 'MISSING') {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> ${filterChecksResults.message}`
    return {message: message, status: false}

    // If CI is passing but the PR is missing an approval, let the user know
  } else if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
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
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
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
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === 'skip_ci' &&
    !noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request is missing required approvals`
    core.info(
      'note: CI checks are disabled for this environment so they will not be evaluated'
    )
    return {message: message, status: false}

    // If it is not a noop deploy and the PR has requested changes with failing CI checks
  } else if (
    !noopMode &&
    reviewDecision === 'CHANGES_REQUESTED' &&
    commitStatus === 'FAILURE'
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request needs to address the requested changes, get approvals, and have passing CI checks before you can proceed with deployment`
    return {message: message, status: false}

    // If it is not a noop deploy and the PR is missing required reviews with failing CI checks
  } else if (
    !noopMode &&
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'FAILURE'
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request needs to get approvals and have passing CI checks before you can proceed with deployment`
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
    sha: sha,
    isFork: isFork
  }
}

// A helper function to filter out ignored checks and return the combined status of the remaining checks
// :param checks: the checks input option
// :param checkResults: An array of check results (objects) from the graphql query
// :param ignoredChecks: An array of check names to ignore
// :param required: A boolean to determine if a check being a required check should be considered
// :returns: An object containing a message (if a failure occurs), and a string representing the status of the checks
// example: {message: '...', status: 'SUCCESS'}
// The status will be one of the following: 'SUCCESS', 'FAILURE', 'MISSING'
function filterChecks(checks, checkResults, ignoredChecks, required) {
  const healthyCheckStatuses = ['SUCCESS', 'SKIPPED', 'NEUTRAL']

  core.debug(`filterChecks() - checks: ${checks}`)
  core.debug(`filterChecks() - ignoredChecks: ${ignoredChecks}`)
  core.debug(`filterChecks() - required: ${required}`)

  // If checks is an array (meaning it isn't just `required` or `all`) and it contains items
  const checksProvided = Array.isArray(checks) && checks.length > 0

  // If a set of values is provided for the `checks` input option, ensure all of them exist in checkResults
  // Example: if `checks` is set to `['test', 'lint', 'build']`, ensure that all of those checks exist in checkResults
  if (checksProvided) {
    const missingChecks = checks.filter(
      ch => !checkResults.some(cr => cr.name === ch)
    )
    if (missingChecks.length > 0) {
      core.warning(
        `the ${COLORS.info}checks${COLORS.reset} input option requires that all of the following checks are passing: ${COLORS.highlight}${checks.join(', ')}${COLORS.reset} - however, the following checks are missing: ${COLORS.highlight}${missingChecks.join(', ')}${COLORS.reset}`
      )

      return {
        message: `The \`checks\` input option requires that all of the following checks are passing: \`${checks.join(',')}\`. However, the following checks are missing: \`${missingChecks.join(',')}\``,
        status: 'MISSING'
      }
    }
  }

  // Filter the checkResults based on user input (checks), ignoring checks, and required flag
  const filteredChecks = checkResults
    .filter(check => {
      if (checksProvided) {
        // check if the `checks` input option explicitly includes the name of the check that was found
        const isIncluded = checks.includes(check.name)

        if (isIncluded) {
          core.debug(
            `filterChecks() - explicitly including ci check: ${check.name}`
          )
        } else {
          core.debug(
            `filterChecks() - ${check.name} is not in the explicit list of checks to include (${checks})`
          )
        }

        return isIncluded
      }

      // If checks is 'all' or 'required', don't filter by name
      // This means that checks is either 'required' or 'all'
      // filter() expects a boolean to be returned
      return true
    })

    .filter(check => {
      // Filter out ignored checks
      const isIgnored = ignoredChecks.includes(check.name)
      if (isIgnored) {
        core.debug(`filterChecks() - ignoring ci check: ${check.name}`)
      }
      // If required is true, only keep checks that are required
      return !isIgnored && (required ? check.isRequired : true)
    })

  // Determine if all remaining checks are in a healthy state
  const allHealthy = filteredChecks.every(check =>
    healthyCheckStatuses.includes(check.conclusion)
  )

  // If no checks remain after filtering, default to SUCCESS
  if (filteredChecks.length === 0) {
    const message =
      'filterChecks() - after filtering, no checks remain - this will result in a SUCCESS state as it is treated as if no checks are defined'
    core.debug(message)
    return {message: message, status: 'SUCCESS'}
  }

  return {
    message: allHealthy
      ? 'all checks passed'
      : 'one or more checks did not pass',
    status: allHealthy ? 'SUCCESS' : 'FAILURE'
  }
}
