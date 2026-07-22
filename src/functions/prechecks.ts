import * as core from '../actions-core.ts'
import {validPermissions} from './valid-permissions.ts'
import {isAdmin} from './admin.ts'
import {isOutdated} from './outdated-check.ts'
import {stringToArray} from './string-to-array.ts'
import {COLORS} from './colors.ts'
import {API_HEADERS} from './api-headers.ts'
import {evaluatePrecheckGates} from './precheck-gates.ts'
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
  CheckRunResult,
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
                                    id
                                    databaseId
                                    startedAt
                                    completedAt
                                    checkSuite {
                                      app { databaseId }
                                    }
                                    isRequired(pullRequestNumber:$number)
                                    conclusion
                                    name
                                  }
                                  ... on StatusContext {
                                    id
                                    createdAt
                                    updatedAt
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
  const baseBranch =
    prData.base.ref === data.inputs.stable_branch
      ? stableBaseBranch
      : await octokit.rest.repos.getBranch({
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

  const gateDecision = evaluatePrecheckGates({
    allowDraftDeploy,
    allowShaDeployments: data.inputs.allow_sha_deployments,
    commitOid: commit_oid,
    commitStatus,
    exactSha: data.environmentObj.sha,
    forkBypass,
    isDraft: legacyTruthy(isDraft),
    isFork,
    mergeStateStatus,
    missingCheckMessage:
      commitStatus === 'MISSING'
        ? legacyArrayElement(filterChecksResults).message
        : '',
    noopMode,
    outdated: outdated.outdated,
    outdatedBranch: outdated.branch,
    reviewDecision,
    sha,
    stableBranch: data.inputs.stable_branch,
    stableBranchUsed: data.environmentObj.stable_branch_used,
    updateBranch: data.inputs.update_branch,
    userIsAdmin
  })

  for (const log of gateDecision.logs) {
    if (log.level === 'info') core.info(log.message)
    else if (log.level === 'warning') core.warning(log.message)
    else core.debug(log.message)
  }

  if (gateDecision.kind === 'reject') {
    return {message: gateDecision.message, status: false}
  }

  if (gateDecision.kind === 'update-branch') {
    try {
      const result = await octokit.rest.pulls.updateBranch({
        ...context.repo,
        pull_number: context.issue.number,
        headers: API_HEADERS
      })

      if (result.status !== 202) {
        message = `### ⚠️ Cannot proceed with deployment\n\n- update_branch http code: \`${result.status}\`\n- update_branch: \`${data.inputs.update_branch}\`\n\n> Failed to update pull request branch with the \`${String(outdated.branch)}\` branch`
        return {message, status: false}
      }

      return {message: gateDecision.message, status: false}
    } catch (error) {
      message = `### ⚠️ Cannot proceed with deployment\n\n\`\`\`text\n${legacyApiError(error).message}\n\`\`\``
      return {message, status: false}
    }
  }

  if (gateDecision.mode === 'sha') {
    sha = gateDecision.sha
    ref = sha
    setActionOutput('sha_deployment', sha)
  }

  message = gateDecision.message

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
      commitStatus: filterChecksResult.status,
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
                              id
                              databaseId
                              startedAt
                              completedAt
                              checkSuite {
                                app { databaseId }
                              }
                              isRequired(pullRequestNumber:$number)
                              conclusion
                              name
                            }
                            ... on StatusContext {
                              id
                              createdAt
                              updatedAt
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
): {message: string; status: 'FAILURE' | 'MISSING' | 'PENDING' | 'SUCCESS'} {
  const healthyCheckStatuses = ['SUCCESS', 'SKIPPED', 'NEUTRAL']
  checkResults = latestCheckResults(checkResults, check => {
    const name = checkName(check)
    const included =
      typeof checks === 'string' ||
      checks.length === 0 ||
      checks.some(checkName => checkName === name)
    const ignored = ignoredChecks.some(ignoredCheck => ignoredCheck === name)
    return included && !ignored && (!required || check.isRequired)
  })

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
  const unhealthyChecks = filteredChecks.filter(
    check => !healthyCheckStatuses.some(status => status === checkStatus(check))
  )

  // If no checks remain after filtering, default to SUCCESS
  if (filteredChecks.length === 0) {
    const message =
      'filterChecks() - after filtering, no checks remain - this will result in a SUCCESS state as it is treated as if no checks are defined'
    core.debug(message)
    return {message: message, status: 'SUCCESS'}
  }

  if (unhealthyChecks.length === 0) {
    return {message: 'all checks passed', status: 'SUCCESS'}
  }

  const pendingStatuses = [null, undefined, 'EXPECTED', 'PENDING']
  const allPending = unhealthyChecks.every(check =>
    pendingStatuses.some(status => status === checkStatus(check))
  )
  return {
    message: allPending
      ? 'one or more checks are pending'
      : 'one or more checks did not pass',
    status: allPending ? 'PENDING' : 'FAILURE'
  }
}

function isCheckRun(check: RawCheckResult): check is CheckRunResult {
  return 'name' in check && typeof check.name === 'string'
}

function checkIdentity(check: RawCheckResult): string {
  if (isCheckRun(check)) {
    return `check:${String(checkIntegrationId(check))}:${check.name}`
  }
  return `status:${String(Reflect.get(check, 'context'))}`
}

function checkIntegrationId(check: CheckRunResult): number | null {
  const databaseId = check.checkSuite?.app?.databaseId
  return typeof databaseId === 'number' && Number.isSafeInteger(databaseId)
    ? databaseId
    : null
}

function validateCheckResult(check: RawCheckResult): void {
  if (typeof check.isRequired !== 'boolean') {
    throw new Error('A check result has an invalid required-check flag')
  }
  if (isCheckRun(check)) {
    if (check.name === '') {
      throw new Error('A check run has an invalid name')
    }
    return
  }
  if (
    !('context' in check) ||
    typeof check.context !== 'string' ||
    check.context === ''
  ) {
    throw new Error('A status context has an invalid name')
  }
}

function checkTimestamp(check: RawCheckResult): number {
  const value = isCheckRun(check)
    ? (check.startedAt ?? check.completedAt)
    : 'updatedAt' in check
      ? (check.updatedAt ?? check.createdAt)
      : undefined
  if (value === undefined || value === null) {
    throw new Error('A duplicate check result is missing its timestamp')
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    throw new Error(`A check result has an invalid timestamp: ${value}`)
  }
  return timestamp
}

function checkDatabaseId(check: RawCheckResult): number | null {
  return isCheckRun(check) ? (check.databaseId ?? null) : null
}

function checkNodeId(check: RawCheckResult): string | undefined {
  return 'id' in check ? check.id : undefined
}

export function latestCheckResults(
  checkResults: readonly RawCheckResult[],
  participatesInPolicy: (check: RawCheckResult) => boolean
): readonly RawCheckResult[] {
  const latest = new Map<
    string,
    {
      readonly check: RawCheckResult
      readonly checkRun: boolean
      readonly integrationId: number | null
    }
  >()
  for (const check of checkResults) {
    validateCheckResult(check)
    const identity = checkIdentity(check)
    const candidate = {
      check,
      checkRun: isCheckRun(check),
      integrationId: isCheckRun(check) ? checkIntegrationId(check) : null
    }
    const currentEntry = latest.get(identity)
    if (currentEntry === undefined) {
      latest.set(identity, candidate)
      continue
    }
    const current = currentEntry.check

    if (
      currentEntry.checkRun &&
      (currentEntry.integrationId === null ||
        candidate.integrationId === null) &&
      (participatesInPolicy(current) || participatesInPolicy(check))
    ) {
      throw new Error(
        `A duplicate check result is missing its integration identity: ${identity}`
      )
    }

    const currentId = checkDatabaseId(current)
    const candidateId = checkDatabaseId(check)
    if (currentId !== null && candidateId !== null) {
      if (candidateId > currentId) latest.set(identity, candidate)
      if (candidateId !== currentId) continue
    }

    const currentTimestamp = checkTimestamp(current)
    const candidateTimestamp = checkTimestamp(check)
    if (candidateTimestamp > currentTimestamp) {
      latest.set(identity, candidate)
      continue
    }
    if (candidateTimestamp < currentTimestamp) continue

    const currentNodeId = checkNodeId(current)
    const candidateNodeId = checkNodeId(check)
    if (
      currentNodeId === undefined ||
      candidateNodeId === undefined ||
      currentNodeId !== candidateNodeId
    ) {
      throw new Error(`Check ordering is ambiguous for ${identity}`)
    }
  }
  return [...latest.values()].map(entry => entry.check)
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
  const status = conclusion ?? state
  const validStatuses = [
    null,
    undefined,
    'ACTION_REQUIRED',
    'CANCELLED',
    'ERROR',
    'EXPECTED',
    'FAILURE',
    'NEUTRAL',
    'PENDING',
    'SKIPPED',
    'STALE',
    'STARTUP_FAILURE',
    'SUCCESS',
    'TIMED_OUT'
  ]
  if (!validStatuses.some(value => value === status)) {
    throw new Error(`A check result has an invalid status: ${String(status)}`)
  }
  return status
}
