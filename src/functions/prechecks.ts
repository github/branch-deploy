import * as core from '../actions-core.ts'
import {validPermissions} from './valid-permissions.ts'
import {isAdmin} from './admin.ts'
import {isOutdated} from './outdated-check.ts'
import {stringToArray} from './string-to-array.ts'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {saveActionState, setActionOutput} from '../action-io.ts'
import {
  legacyApiError,
  legacyArrayElement,
  legacyBranchTreeSha,
  legacyDebugValue,
  legacyIgnoredChecks,
  legacyLooselyTrue,
  legacyPrechecksCommitOid,
  legacyPrechecksPullData,
  legacyPrechecksPullRepository,
  legacyTruthy,
  prechecksGraphqlContextsPageResult,
  prechecksGraphqlResult
} from '../trust-boundaries.ts'
import type {
  BranchDeployContext,
  BranchDeployOctokit,
  PrecheckData,
  PrecheckResult,
  PrechecksGraphqlCommitNode,
  PrechecksGraphqlResult,
  RawCheckResult,
  StatusCheckRollup
} from '../types.ts'

type PullGetMethod = BranchDeployOctokit['rest']['pulls']['get']
type PullGetParameters = Parameters<PullGetMethod>[0]
type FullPullGetResponse = Awaited<ReturnType<PullGetMethod>>
type PullUpdateMethod = BranchDeployOctokit['rest']['pulls']['updateBranch']
type PullUpdateParameters = Parameters<PullUpdateMethod>[0]
type BranchGetMethod = BranchDeployOctokit['rest']['repos']['getBranch']
type BranchGetParameters = Parameters<BranchGetMethod>[0]
type FullBranchGetResponse = Awaited<ReturnType<BranchGetMethod>>
type CompareMethod = BranchDeployOctokit['rest']['repos']['compareCommits']
type CompareParameters = Parameters<CompareMethod>[0]
type FullCompareResponse = Awaited<ReturnType<CompareMethod>>
type PermissionMethod =
  BranchDeployOctokit['rest']['repos']['getCollaboratorPermissionLevel']
type PermissionParameters = Parameters<PermissionMethod>[0]
type FullPermissionResponse = Awaited<ReturnType<PermissionMethod>>

type PullHead = FullPullGetResponse['data']['head']
type PullHeadRepository = NonNullable<PullHead['repo']>
type BranchCommit = FullBranchGetResponse['data']['commit']

export interface PrechecksPullResponse {
  readonly data?: {
    readonly base?: Partial<Pick<FullPullGetResponse['data']['base'], 'ref'>>
    readonly draft?: Exclude<FullPullGetResponse['data']['draft'], undefined>
    readonly head?: Partial<Pick<PullHead, 'label' | 'ref' | 'sha'>> & {
      readonly repo?: null | Partial<
        Pick<PullHeadRepository, 'fork' | 'full_name'>
      >
    }
  }
  readonly status: number
}

export interface PrechecksPullData {
  readonly base: Pick<FullPullGetResponse['data']['base'], 'ref'>
  readonly draft?: Exclude<FullPullGetResponse['data']['draft'], undefined>
  readonly head: Pick<PullHead, 'label' | 'ref' | 'sha'> & {
    readonly repo?: null | Partial<
      Pick<PullHeadRepository, 'fork' | 'full_name'>
    >
  }
}

export interface PrechecksBranchResponse {
  readonly data: {
    readonly commit: Pick<BranchCommit, 'sha'> & {
      readonly commit?: {
        readonly tree?: Partial<Pick<BranchCommit['commit']['tree'], 'sha'>>
      }
    }
    readonly name?: FullBranchGetResponse['data']['name']
  }
  readonly status?: number
}

export interface PrechecksOctokit {
  readonly graphql: (
    query: string,
    variables: Readonly<Record<string, unknown>>
  ) => Promise<unknown>
  readonly rest: {
    readonly pulls: {
      readonly get: (
        parameters?: PullGetParameters
      ) => Promise<PrechecksPullResponse>
      readonly updateBranch: (parameters?: PullUpdateParameters) => Promise<{
        readonly data?: unknown
        readonly status: number
      }>
    }
    readonly repos: {
      readonly compareCommits: (parameters?: CompareParameters) => Promise<{
        readonly data: Pick<FullCompareResponse['data'], 'behind_by'>
        readonly status?: number
      }>
      readonly getBranch: (
        parameters?: BranchGetParameters
      ) => Promise<PrechecksBranchResponse>
      readonly getCollaboratorPermissionLevel: (
        parameters?: PermissionParameters
      ) => Promise<{
        readonly data: Pick<FullPermissionResponse['data'], 'permission'>
        readonly status: number
      }>
    }
  }
}

export interface PrechecksRequest {
  readonly context: BranchDeployContext
  readonly data: PrecheckData
  readonly octokit: PrechecksOctokit
}

type FilterChecksResult = ReturnType<typeof filterChecks>

type CommitCheckEvaluation =
  | {
      readonly commitStatus: string
      readonly filterChecksResult?: FilterChecksResult
      readonly kind: 'failed'
    }
  | {
      readonly commitStatus: 'MISSING'
      readonly filterChecksResult: FilterChecksResult
      readonly kind: 'missing'
    }
  | {readonly commitStatus: null; readonly kind: 'no-checks'}
  | {
      readonly commitStatus: 'SUCCESS'
      readonly filterChecksResult?: FilterChecksResult
      readonly kind: 'passed'
    }
  | {readonly commitStatus: 'skip_ci'; readonly kind: 'skipped'}
  | {
      readonly commitStatus: 'UNAVAILABLE'
      readonly error: unknown
      readonly kind: 'unavailable'
    }

// Runs precheck logic before the branch deployment can proceed
// :param context: The context of the event
// :param octokit: The octokit client
// :param data: An object containing data about the event, input options, and more
// :returns: An object that contains the results of the prechecks, message, ref, status, and noopMode
export async function prechecks(
  context: BranchDeployContext,
  octokit: PrechecksOctokit,
  data: PrecheckData
): Promise<PrecheckResult> {
  // Setup the message variable
  let message: string

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

  const prData = legacyPrechecksPullData(pr.data)

  // save sha
  let sha = prData.head.sha

  // set an output which is the branch name this PR is targeting to merge into
  const baseRef = pr.data?.base?.ref
  setActionOutput('base_ref', baseRef)
  core.debug(`base_ref: ${String(baseRef)}`)

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
  const ignoredChecks = legacyIgnoredChecks(data.inputs.ignored_checks)

  let ref = prData.head.ref
  const noopMode = data.environmentObj.noop
  let forkBypass = false
  const isFork = legacyLooselyTrue(prData.head.repo?.fork)

  // Make an API call to get the base branch
  // https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#get-a-branch
  const stableBaseBranch = await octokit.rest.repos.getBranch({
    ...context.repo,
    branch: data.inputs.stable_branch,
    headers: API_HEADERS
  })

  // we also want to output the default branch tree sha of the base branch (e.g. the default branch)
  // this can be useful for subsequent workflow steps that may need to do commit comparisons
  setActionOutput(
    'default_branch_tree_sha',
    legacyBranchTreeSha(stableBaseBranch)
  )

  // Check to see if the "stable" branch was used as the deployment target
  if (data.environmentObj.stable_branch_used) {
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
    setActionOutput('non_default_target_branch_used', 'true')
  }

  // If the PR is targeting a branch other than the default branch (and it is not a stable branch deploy) reject the deployment, unless the Action is explicitly configured to allow it
  if (
    isNotStableBranchDeploy &&
    nonDefaultTargetBranchUsed &&
    !nonDefaultDeploysAllowed
  ) {
    return {
      message: `### ⚠️ Cannot proceed with deployment\n\nThis pull request is attempting to merge into the \`${String(baseRef)}\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`). This deployment has been rejected since it could be dangerous to proceed.`,
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
      `🚨 this pull request is attempting to merge into the \`${String(baseRef)}\` branch which is not the default branch of this repository (\`${data.inputs.stable_branch}\`) - this action is potentially dangerous`
    )
  }

  // Determine whether to use the ref or sha depending on if the PR is from a fork or not
  // Note: We should not export fork values if the stable_branch is being used here
  if (isFork && !forkBypass) {
    core.info(`🍴 the pull request is a ${COLORS.highlight}fork${COLORS.reset}`)
    core.info(
      `🍴 fork: the ref (${COLORS.highlight}${ref}${COLORS.reset}) output will be replaced with the commit sha (${COLORS.highlight}${prData.head.sha}${COLORS.reset})`
    )
    core.debug(`the pull request is from a fork, using sha instead of ref`)
    setActionOutput('fork', 'true')
    saveActionState('fork', 'true')

    // If this Action's inputs have been configured to explicitly prevent forks, exit
    if (!data.inputs.allowForks) {
      message = `### ⚠️ Cannot proceed with deployment\n\nThis Action has been explicity configured to prevent deployments from forks. You can change this via this Action's inputs if needed`
      return {message: message, status: false}
    }

    // Set some outputs specific to forks
    const pullRepository = legacyPrechecksPullRepository(prData.head.repo)
    const label = prData.head.label
    const forkRef = prData.head.ref
    const forkCheckout = `${label.replace(':', '-')} ${forkRef}`
    const forkFullName = pullRepository.full_name
    setActionOutput('fork_ref', forkRef)
    setActionOutput('fork_label', label)
    setActionOutput('fork_checkout', forkCheckout)
    setActionOutput('fork_full_name', forkFullName)
    core.debug(`fork_ref: ${forkRef}`)
    core.debug(`fork_label: ${label}`)
    core.debug(`fork_checkout: ${forkCheckout}`)
    core.debug(`fork_full_name: ${forkFullName}`)

    // If this pull request is a fork, use the exact SHA rather than the branch name
    ref = prData.head.sha
  } else {
    // If this PR is NOT a fork, we can safely use the branch name
    setActionOutput('fork', 'false')
    saveActionState('fork', 'false')
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
                            id
                            oid
                            statusCheckRollup {
                              state
                              contexts(first:100) {
                                nodes {
                                  ... on CheckRun {
                                    isRequired(pullRequestNumber:$number)
                                    conclusion
                                    name
                                  }
                                  ... on StatusContext {
                                    isRequired(pullRequestNumber:$number)
                                    state
                                    context
                                  }
                                }
                                pageInfo {
                                  endCursor
                                  hasNextPage
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
    number: parseInt(String(data.issue_number)),
    headers: {
      Accept: 'application/vnd.github.merge-info-preview+json'
    }
  }
  // Make the GraphQL query
  const result = prechecksGraphqlResult(await octokit.graphql(query, variables))

  // Fetch the commit oid which is the SHA1 hash of the commit
  const commit_oid = legacyPrechecksCommitOid(result)

  // Check the reviewDecision
  let reviewDecision: string | null | undefined
  if (skipReviews && !isFork) {
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
  if (reviewDecision === null && isFork && !forkBypass) {
    core.warning(
      '🚨 pull request reviews are not enforced by this repository and this operation is being performed on a fork - this operation is dangerous! You should require reviews via branch protection settings (or rulesets) to ensure that the changes being deployed are the changes that you reviewed.'
    )
  }

  // Grab the mergeStateStatus from the GraphQL result
  const mergeStateStatus = result.repository.pullRequest.mergeStateStatus

  // Grab the draft status
  const isDraft = prData.draft

  // log some extra details if the state of the PR is in a 'draft'
  if (legacyTruthy(isDraft) && !allowDraftDeploy) {
    core.warning(
      `deployment requested on a draft PR from a non-allowed environment`
    )
  } else if (legacyTruthy(isDraft) && allowDraftDeploy) {
    core.info(
      `📓 deployment requested on a ${COLORS.highlight}draft${COLORS.reset} pull request from an ${COLORS.highlight}allowed${COLORS.reset} environment`
    )
  }

  const checkEvaluation = await evaluateCommitChecks({
    checks,
    environment: data.environment,
    ignoredChecks,
    octokit,
    pullRequestNumber: context.issue.number,
    result,
    skipCi
  })
  const commitStatus = checkEvaluation.commitStatus
  const filterChecksResults =
    'filterChecksResult' in checkEvaluation
      ? checkEvaluation.filterChecksResult
      : undefined
  const checksUnavailableMessage = `### ⚠️ Cannot proceed with deployment\n\n- commitStatus: \`UNAVAILABLE\`\n\n> The Action could not verify all CI checks for this pull request, so no deployment was started. Retry the command after GitHub's check data is available, or explicitly configure \`skip_ci\` for this environment.`

  if (checkEvaluation.kind === 'unavailable') {
    core.debug(
      `could not retrieve PR commit status: ${String(checkEvaluation.error)}`
    )
    core.warning(
      'CI check verification is unavailable; deployment will not proceed'
    )

    // Try to display the raw GraphQL result for debugging purposes
    try {
      core.debug('raw graphql result for debugging:')
      core.debug(legacyDebugValue(result))
    } /* node:coverage ignore next */ catch {
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
    branch: prData.base.ref,
    headers: API_HEADERS
  })

  // Check to see if the branch is outdated or not based on the Action's configuration
  const outdated = await isOutdated(context, octokit, {
    baseBranch: baseBranch, // this is the base branch that the PR is targeting
    stableBaseBranch: stableBaseBranch, // this is the 'stable' branch (aka: the default branch of the repo)
    pr: {data: {head: {sha: prData.head.sha}}},
    mergeStateStatus: mergeStateStatus,
    outdated_mode: data.inputs.outdated_mode
  })

  const approvedReviewsCount = result.repository.pullRequest.reviews?.totalCount

  // log values for debugging
  core.debug('precheck values for debugging:')
  core.debug(`reviewDecision: ${String(reviewDecision)}`)
  core.debug(`mergeStateStatus: ${String(mergeStateStatus)}`)
  core.debug(`commitStatus: ${String(commitStatus)}`)
  core.debug(`userIsAdmin: ${userIsAdmin}`)
  core.debug(`update_branch: ${data.inputs.update_branch}`)
  core.debug(`skipCi: ${skipCi}`)
  core.debug(`skipReviews: ${skipReviews}`)
  core.debug(`allowForks: ${data.inputs.allowForks}`)
  core.debug(`forkBypass: ${forkBypass}`)
  core.debug(`environment: ${data.environment}`)
  core.debug(`outdated: ${outdated.outdated}`)
  core.debug(`approvedReviewsCount: ${String(approvedReviewsCount)}`)

  // output values
  setActionOutput('commit_status', commitStatus)
  setActionOutput('review_decision', reviewDecision)
  setActionOutput('is_outdated', outdated.outdated)
  setActionOutput('merge_state_status', mergeStateStatus)
  setActionOutput('approved_reviews_count', approvedReviewsCount)

  // save state values
  saveActionState('review_decision', reviewDecision)
  saveActionState('approved_reviews_count', approvedReviewsCount)

  // Check if the branch exists before proceeding with deployment
  // Skip this check if:
  // 1. We're deploying to the stable branch (e.g., `.deploy main`)
  // 2. We're deploying an exact SHA (allow_sha_deployments is enabled and a SHA was provided)
  // 3. The PR is from a fork (we use SHA for forks, not branch names)
  if (
    !data.environmentObj.stable_branch_used &&
    data.environmentObj.sha === null &&
    !isFork
  ) {
    core.debug(`checking if branch exists: ${ref}`)
    try {
      await octokit.rest.repos.getBranch({
        ...context.repo,
        branch: ref,
        headers: API_HEADERS
      })
      core.info(`✅ branch exists: ${ref}`)
    } catch (error) {
      const apiError = legacyApiError(error)
      if (apiError.status === 404) {
        message = `### ⚠️ Cannot proceed with deployment\n\n- ref: \`${ref}\`\n\nThe branch for this pull request no longer exists. This can happen if the branch was deleted after the PR was merged or closed. If you need to deploy, you can:\n- Use the stable branch deployment (e.g., \`${data.inputs.trigger} ${data.inputs.stable_branch}\`)\n- Use an exact SHA deployment if enabled (e.g., \`${data.inputs.trigger} ${sha}\`)\n\n> If you are running this command on a closed pull request, you can also try reopening the pull request to restore the branch for a deployment.`
        core.warning(`branch does not exist: ${ref}`)
        return {message: message, status: false}
      }
      // If it's not a 404 error, it's unexpected - hard stop
      message = `### ⚠️ Cannot proceed with deployment\n\n- ref: \`${ref}\`\n\n> An unexpected error occurred while checking if the branch exists: \`${apiError.message}\``
      core.error(
        `unexpected error checking if branch exists: ${apiError.message}`
      )
      return {message: message, status: false}
    }
  }

  // Always allow deployments to the "stable" branch regardless of CI checks or PR review
  if (data.environmentObj.stable_branch_used) {
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
    data.inputs.allow_sha_deployments &&
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
    setActionOutput('sha_deployment', sha)

    // A missing rollup is allowed, but incomplete or malformed check data cannot be treated as an empty rollup
  } else if (commitStatus === 'UNAVAILABLE' && commit_oid === undefined) {
    message = checksUnavailableMessage
    return {message: message, status: false}

    // If the commit sha (from the PR head) does not exactly match the sha returned from the graphql query, something is wrong
    // This could occur if the branch had a commit pushed to it in between the rest call and the graphql query
    // In this case, we should not proceed with the deployment as we cannot guarantee the sha is safe for a variety of reasons
  } else if (sha !== commit_oid) {
    message = `### ⚠️ Cannot proceed with deployment\n\nThe commit sha from the PR head does not match the commit sha from the graphql query\n\n- sha: \`${sha}\`\n- commit_oid: \`${String(commit_oid)}\`\n\nThis is unexpected and could be caused by a commit being pushed to the branch after the initial rest call was made. Please review your PR timeline and try again.`
    return {message: message, status: false}

    // The commit identity was verified, but its complete check state was not
  } else if (commitStatus === 'UNAVAILABLE') {
    message = checksUnavailableMessage
    return {message: message, status: false}

    // If the requested operation (deploy or noop) is taking place on a fork, that fork is NOT using the stable branch (i.e. `.deploy main`), the PR is...
    // not approved -> do not allow bypassing the lack of reviews. Enforce that ALL PRs originating from forks must have the required reviews.
    // Deploying forks without reviews is a security risk and will not be allowed
    // This logic will even apply to noop deployments and ignore the value of skip_reviews if it is set out of an abundance of caution
    // This logic will also apply even if the requested deployer is an admin
  } else if (
    isFork &&
    !forkBypass &&
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
    !data.inputs.allow_sha_deployments &&
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
    outdated.outdated
  ) {
    // If the update_branch param is set to "warn", warn and exit
    if (data.inputs.update_branch === 'warn') {
      message = `### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: \`${String(mergeStateStatus)}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> Please ensure your branch is up to date with the \`${String(outdated.branch)}\` branch and try again`
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
        message = `### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: \`${result.status}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> Failed to update pull request branch with the \`${String(outdated.branch)}\` branch`
        return {message: message, status: false}
      }

      // If the result is a 202, let the user know the branch was updated and exit so they can retry
      message = `### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: \`${String(mergeStateStatus)}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> I went ahead and updated your branch with \`${data.inputs.stable_branch}\` - Please try again once this operation is complete`
      return {message: message, status: false}
    } catch (error) {
      message = `### ⚠️ Cannot proceed with deployment\n\n\`\`\`text\n${legacyApiError(error).message}\n\`\`\``
      return {message: message, status: false}
    }

    // If the mergeStateStatus is in DRAFT and allowDraftDeploy is true, alert and exit
  } else if (legacyTruthy(isDraft) && !allowDraftDeploy) {
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
  } else if (commitStatus === 'SUCCESS' && reviewDecision === 'skip_reviews') {
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
  } else if (commitStatus === 'skip_ci' && userIsAdmin) {
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
  } else if (commitStatus === 'SUCCESS' && userIsAdmin) {
    message = '✅ CI is passing and approval is bypassed due to admin rights'
    core.info(message)

    // If CI is undefined and the deployer is an admin
  } else if (commitStatus === null && userIsAdmin) {
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
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
    return {message: message, status: false}

    // If CI is pending and reviewers have not been defined and it IS a noop deploy
  } else if (
    reviewDecision === null &&
    commitStatus === 'PENDING' &&
    noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
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
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
    return {message: message, status: false}

    // Regardless of the reviewDecision or noop, if the commitStatus is 'MISSING' this means that a user has explicitly requested a CI check to be passing with the `checks: <check1>,<check2>,<etc>` input option, but the check could not be found in the GraphQL result
    // In this case, we should alert the user that the check could not be found and exit
  } else if (commitStatus === 'MISSING') {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> ${legacyArrayElement(filterChecksResults).message}`
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
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request does not require approvals but CI checks are failing`
    return {message: message, status: false}

    // If the PR is NOT reviewed and CI checks have NOT been defined and NOT a noop deploy
  } else if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === null &&
    !noopMode
  ) {
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${String(commitStatus)}\`\n\n> Your pull request is missing required approvals`
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
    message = `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${String(commitStatus)}\`\n\n> This is usually caused by missing PR approvals or CI checks failing`
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

interface EvaluateCommitChecksRequest {
  readonly checks: PrecheckData['inputs']['checks']
  readonly environment: string
  readonly ignoredChecks: readonly string[]
  readonly octokit: PrechecksOctokit
  readonly pullRequestNumber: number
  readonly result: PrechecksGraphqlResult
  readonly skipCi: boolean
}

async function evaluateCommitChecks({
  checks,
  environment,
  ignoredChecks,
  octokit,
  pullRequestNumber,
  result,
  skipCi
}: EvaluateCommitChecksRequest): Promise<CommitCheckEvaluation> {
  if (skipCi) {
    core.info(
      `⏩ CI checks have been ${COLORS.highlight}disabled${COLORS.reset} for the ${COLORS.highlight}${environment}${COLORS.reset} environment`
    )
    return {commitStatus: 'skip_ci', kind: 'skipped'}
  }

  try {
    const commit = result.repository.pullRequest.commits?.nodes?.[0]?.commit
    if (commit === undefined) {
      throw new Error('The GraphQL response did not include a commit')
    }
    const statusCheckRollup = commit.statusCheckRollup
    const explicitChecks = Array.isArray(checks) && checks.length > 0

    if (explicitChecks && statusCheckRollup === null) {
      const filterChecksResult = filterChecks(checks, [], ignoredChecks, false)
      return {
        commitStatus: 'MISSING',
        filterChecksResult,
        kind: 'missing'
      }
    }

    if (statusCheckRollup === null) {
      core.info('💡 no CI checks have been defined for this pull request')
      return {commitStatus: null, kind: 'no-checks'}
    }

    if (statusCheckRollup === undefined) {
      throw new Error('The GraphQL response did not include a check rollup')
    }

    if (checks === 'all' && ignoredChecks.length === 0) {
      return statusCheckRollup.state === 'SUCCESS'
        ? {commitStatus: 'SUCCESS', kind: 'passed'}
        : {commitStatus: statusCheckRollup.state, kind: 'failed'}
    }

    const checkResults = await loadAllCheckResults(
      octokit,
      pullRequestNumber,
      commit,
      statusCheckRollup
    )
    const filterChecksResult = filterChecks(
      checks,
      checkResults,
      ignoredChecks,
      checks === 'required'
    )

    if (filterChecksResult.status === 'SUCCESS') {
      return {
        commitStatus: 'SUCCESS',
        filterChecksResult,
        kind: 'passed'
      }
    }
    if (filterChecksResult.status === 'MISSING') {
      return {
        commitStatus: 'MISSING',
        filterChecksResult,
        kind: 'missing'
      }
    }
    return {
      commitStatus: 'FAILURE',
      filterChecksResult,
      kind: 'failed'
    }
  } catch (error) {
    return {commitStatus: 'UNAVAILABLE', error, kind: 'unavailable'}
  }
}

async function loadAllCheckResults(
  octokit: PrechecksOctokit,
  pullRequestNumber: number,
  commit: PrechecksGraphqlCommitNode['commit'],
  statusCheckRollup: StatusCheckRollup
): Promise<readonly RawCheckResult[]> {
  const checkResults = [...statusCheckRollup.contexts.nodes]
  let pageInfo = statusCheckRollup.contexts.pageInfo
  if (!pageInfo) {
    throw new Error('The GraphQL response did not include check page info')
  }

  if (!pageInfo.hasNextPage) {
    return checkResults
  }

  if (commit.id === undefined || commit.id === '') {
    throw new Error('The GraphQL response did not include a commit node ID')
  }

  const query = `query($commitId:ID!, $cursor:String!, $number:Int!) {
                  node(id:$commitId) {
                    ... on Commit {
                      id
                      oid
                      statusCheckRollup {
                        state
                        contexts(first:100, after:$cursor) {
                          nodes {
                            ... on CheckRun {
                              isRequired(pullRequestNumber:$number)
                              conclusion
                              name
                            }
                            ... on StatusContext {
                              isRequired(pullRequestNumber:$number)
                              state
                              context
                            }
                          }
                          pageInfo {
                            endCursor
                            hasNextPage
                          }
                        }
                      }
                    }
                  }
                }`
  const seenCursors = new Set<string>()

  while (pageInfo.hasNextPage) {
    const cursor = pageInfo.endCursor
    if (cursor === null || cursor === '') {
      throw new Error('The check page has no end cursor')
    }
    if (seenCursors.has(cursor)) {
      throw new Error('The check page cursor did not advance')
    }
    seenCursors.add(cursor)

    const page = prechecksGraphqlContextsPageResult(
      await octokit.graphql(query, {
        commitId: commit.id,
        cursor,
        number: pullRequestNumber
      })
    )
    if (!page.node) {
      throw new Error('The paginated commit node is unavailable')
    }
    if (page.node.id !== commit.id || page.node.oid !== commit.oid) {
      throw new Error('The paginated check data belongs to another commit')
    }
    if (page.node.statusCheckRollup === null) {
      throw new Error('The paginated check rollup is unavailable')
    }

    checkResults.push(...page.node.statusCheckRollup.contexts.nodes)
    pageInfo = page.node.statusCheckRollup.contexts.pageInfo
    if (!pageInfo) {
      throw new Error('The paginated check response has no page info')
    }
  }

  return checkResults
}

// A helper function to filter out ignored checks and return the combined status of the remaining checks
// :param checks: the checks input option
// :param checkResults: An array of check results (objects) from the graphql query
// :param ignoredChecks: An array of check names to ignore
// :param required: A boolean to determine if a check being a required check should be considered
// :returns: An object containing a message (if a failure occurs), and a string representing the status of the checks
// example: {message: '...', status: 'SUCCESS'}
// The status will be one of the following: 'SUCCESS', 'FAILURE', 'MISSING'
export function filterChecks(
  checks: 'all' | 'required' | readonly string[],
  checkResults: readonly RawCheckResult[],
  ignoredChecks: readonly string[],
  required: boolean
): {message: string; status: 'FAILURE' | 'MISSING' | 'SUCCESS'} {
  const healthyCheckStatuses = ['SUCCESS', 'SKIPPED', 'NEUTRAL']

  const checksDisplay = typeof checks === 'string' ? checks : checks.join(',')
  core.debug(`filterChecks() - checks: ${checksDisplay}`)
  core.debug(`filterChecks() - ignoredChecks: ${ignoredChecks.join(',')}`)
  core.debug(`filterChecks() - required: ${required}`)

  // If checks is an array (meaning it isn't just `required` or `all`) and it contains items
  const checksProvided = typeof checks !== 'string' && checks.length > 0

  // If a set of values is provided for the `checks` input option, ensure all of them exist in checkResults
  // Example: if `checks` is set to `['test', 'lint', 'build']`, ensure that all of those checks exist in checkResults
  if (checksProvided) {
    const missingChecks = checks.filter(
      ch => !checkResults.some(cr => checkName(cr) === ch)
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
        const name = checkName(check)
        const isIncluded = checks.some(checkName => checkName === name)

        if (isIncluded) {
          core.debug(
            `filterChecks() - explicitly including ci check: ${String(name)}`
          )
        } else {
          core.debug(
            `filterChecks() - ${String(name)} is not in the explicit list of checks to include (${checksDisplay})`
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
      const name = checkName(check)
      const isIgnored = ignoredChecks.some(
        ignoredCheck => ignoredCheck === name
      )
      if (isIgnored) {
        core.debug(`filterChecks() - ignoring ci check: ${String(name)}`)
      }
      // If required is true, only keep checks that are required
      return !isIgnored && (required ? check.isRequired : true)
    })

  // Determine if all remaining checks are in a healthy state
  const allHealthy = filteredChecks.every(check =>
    healthyCheckStatuses.some(status => status === checkStatus(check))
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

function checkName(check: RawCheckResult): string | null | undefined {
  const name: string | null | undefined =
    'name' in check ? check.name : undefined
  const context: string | null | undefined =
    'context' in check ? check.context : undefined
  return name ?? context
}

function checkStatus(check: RawCheckResult): string | null | undefined {
  const conclusion: string | null | undefined =
    'conclusion' in check ? check.conclusion : undefined
  const state: string | null | undefined =
    'state' in check ? check.state : undefined
  return conclusion ?? state
}
