import {COLORS} from './colors.ts'

export interface PrecheckGateLogEvent {
  readonly level: 'debug' | 'info' | 'warning'
  readonly message: string
}

export interface PrecheckGateRequest {
  readonly allowDraftDeploy: boolean
  readonly allowShaDeployments: boolean
  readonly commitOid: string | undefined
  readonly commitStatus: string | null
  readonly exactSha: string | null
  readonly forkBypass: boolean
  readonly isDraft: boolean
  readonly isFork: boolean
  readonly mergeStateStatus: string | undefined
  readonly missingCheckMessage: string
  readonly noopMode: boolean
  readonly outdated: boolean
  readonly outdatedBranch: string | undefined
  readonly reviewDecision: string | null | undefined
  readonly sha: string
  readonly stableBranch: string
  readonly stableBranchUsed: boolean
  readonly updateBranch: 'disabled' | 'force' | 'warn'
  readonly userIsAdmin: boolean
}

interface PrecheckGateDecisionBase {
  readonly logs: readonly PrecheckGateLogEvent[]
  readonly message: string
}

export type PrecheckGateDecision =
  | (PrecheckGateDecisionBase & {
      readonly kind: 'proceed'
      readonly mode: 'ordinary' | 'stable'
    })
  | (PrecheckGateDecisionBase & {
      readonly kind: 'proceed'
      readonly mode: 'sha'
      readonly sha: string
    })
  | (PrecheckGateDecisionBase & {readonly kind: 'reject'})
  | (PrecheckGateDecisionBase & {readonly kind: 'update-branch'})

function accept(
  message: string,
  logs: readonly PrecheckGateLogEvent[] = [{level: 'info', message}]
): PrecheckGateDecision {
  return {kind: 'proceed', logs, message, mode: 'ordinary'}
}

function reject(
  message: string,
  logs: readonly PrecheckGateLogEvent[] = []
): PrecheckGateDecision {
  return {kind: 'reject', logs, message}
}

export function evaluatePrecheckGates({
  allowDraftDeploy,
  allowShaDeployments,
  commitOid,
  commitStatus,
  exactSha,
  forkBypass,
  isDraft,
  isFork,
  mergeStateStatus,
  missingCheckMessage,
  noopMode,
  outdated,
  outdatedBranch,
  reviewDecision,
  sha,
  stableBranch,
  stableBranchUsed,
  updateBranch,
  userIsAdmin
}: PrecheckGateRequest): PrecheckGateDecision {
  if (stableBranchUsed) {
    const message = `✅ deployment to the ${COLORS.highlight}stable${COLORS.reset} branch requested`
    return {
      kind: 'proceed',
      logs: [
        {level: 'info', message},
        {
          level: 'debug',
          message:
            'note: deployments to the stable branch do not require PR review or passing CI checks on the working branch'
        }
      ],
      message,
      mode: 'stable'
    }
  }

  if (allowShaDeployments && exactSha !== null) {
    const message = `✅ deployment requested using an exact ${COLORS.highlight}sha${COLORS.reset}`
    return {
      kind: 'proceed',
      logs: [
        {level: 'info', message},
        {
          level: 'warning',
          message: `⚠️ sha deployments are ${COLORS.warning}unsafe${COLORS.reset} as they bypass all checks - read more here: https://github.com/github/branch-deploy/blob/main/docs/sha-deployments.md`
        },
        {
          level: 'debug',
          message: 'an exact sha was used, using sha instead of ref'
        }
      ],
      message,
      mode: 'sha',
      sha: exactSha
    }
  }

  const checksUnavailableMessage = `### ⚠️ Cannot proceed with deployment\n\n- commitStatus: \`UNAVAILABLE\`\n\n> The Action could not verify all CI checks for this pull request, so no deployment was started. Retry the command after GitHub's check data is available, or explicitly configure \`skip_ci\` for this environment.`

  if (commitStatus === 'UNAVAILABLE' && commitOid === undefined) {
    return reject(checksUnavailableMessage)
  }

  if (sha !== commitOid) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\nThe commit sha from the PR head does not match the commit sha from the graphql query\n\n- sha: \`${sha}\`\n- commit_oid: \`${String(commitOid)}\`\n\nThis is unexpected and could be caused by a commit being pushed to the branch after the initial rest call was made. Please review your PR timeline and try again.`
    )
  }

  if (commitStatus === 'UNAVAILABLE') {
    return reject(checksUnavailableMessage)
  }

  if (
    isFork &&
    !forkBypass &&
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED')
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n\n> All deployments from forks **must** have the required reviews before they can proceed. Please ensure this PR has been reviewed and approved before trying again.`,
      [
        {
          level: 'debug',
          message: `rejecting deployment from fork without required reviews - noopMode: ${noopMode}`
        }
      ]
    )
  }

  if (!allowShaDeployments && exactSha !== null) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- allow_sha_deployments: \`${allowShaDeployments}\`\n\n> sha deployments have not been enabled`
    )
  }

  if (
    (commitStatus === 'SUCCESS' ||
      commitStatus === null ||
      commitStatus === 'skip_ci') &&
    updateBranch !== 'disabled' &&
    outdated
  ) {
    if (updateBranch === 'warn') {
      return reject(
        `### ⚠️ Cannot proceed with deployment\n\nYour branch is behind the base branch and will need to be updated before deployments can continue.\n\n- mergeStateStatus: \`${String(mergeStateStatus)}\`\n- update_branch: \`${updateBranch}\`\n\n> Please ensure your branch is up to date with the \`${String(outdatedBranch)}\` branch and try again`
      )
    }

    return {
      kind: 'update-branch',
      logs: [
        {
          level: 'debug',
          message: `update_branch is set to ${COLORS.highlight}${updateBranch}${COLORS.reset}`
        }
      ],
      message: `### ⚠️ Cannot proceed with deployment\n\n- mergeStateStatus: \`${String(mergeStateStatus)}\`\n- update_branch: \`${updateBranch}\`\n\n> I went ahead and updated your branch with \`${stableBranch}\` - Please try again once this operation is complete`
    }
  }

  if (isDraft && !allowDraftDeploy) {
    return reject(
      '### ⚠️ Cannot proceed with deployment\n\n> Your pull request is in a draft state'
    )
  }

  if (mergeStateStatus === 'DIRTY') {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n- mergeStateStatus: \`${mergeStateStatus}\`\n\n> A merge commit cannot be cleanly created`
    )
  }

  if (reviewDecision === 'APPROVED' && commitStatus === 'SUCCESS') {
    return accept('✅ PR is approved and all CI checks passed')
  }

  if (reviewDecision === null && commitStatus === null) {
    return accept(
      '🎛️ CI checks have not been defined and required reviewers have not been defined'
    )
  }

  if (reviewDecision === null && commitStatus === 'SUCCESS') {
    return accept(
      '🎛️ CI checks have been defined but required reviewers have not been defined'
    )
  }

  if (commitStatus === 'SUCCESS' && reviewDecision === 'skip_reviews') {
    return accept(
      '✅ CI checks passed and required reviewers have been disabled for this environment'
    )
  }

  if (commitStatus === null && reviewDecision === 'skip_reviews') {
    return accept(
      '✅ CI checks have not been defined and required reviewers have been disabled for this environment'
    )
  }

  if (commitStatus === 'skip_ci' && reviewDecision === 'APPROVED') {
    return accept(
      '✅ CI requirements have been disabled for this environment and the PR has been approved'
    )
  }

  if (commitStatus === 'skip_ci' && reviewDecision === null) {
    return accept(
      '🎛️ CI requirements have been disabled for this environment and required reviewers have not been defined'
    )
  }

  if (
    commitStatus === 'skip_ci' &&
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    noopMode
  ) {
    const message =
      '✅ CI requirements have been disabled for this environment and **noop** requested'
    return accept(message, [
      {level: 'info', message},
      {
        level: 'info',
        message:
          'note: noop deployments do not require pr review and ignore "changes requested" reviews'
      }
    ])
  }

  if (commitStatus === 'skip_ci' && userIsAdmin) {
    return accept(
      '✅ CI requirements have been disabled for this environment and approval is bypassed due to admin rights'
    )
  }

  if (commitStatus === 'skip_ci' && reviewDecision === 'skip_reviews') {
    return accept(
      '✅ CI requirements have been disabled for this environment and pr reviews have also been disabled for this environment'
    )
  }

  if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === 'SUCCESS' &&
    noopMode
  ) {
    const message = `✅ all CI checks passed and ${COLORS.highlight}noop${COLORS.reset} deployment requested`
    return accept(message, [
      {level: 'info', message},
      {
        level: 'debug',
        message:
          'note: noop deployments do not require pr review and ignore "changes requested" reviews'
      }
    ])
  }

  if (commitStatus === 'SUCCESS' && userIsAdmin) {
    return accept(
      '✅ CI is passing and approval is bypassed due to admin rights'
    )
  }

  if (commitStatus === null && userIsAdmin) {
    return accept(
      '✅ CI checks have not been defined and approval is bypassed due to admin rights'
    )
  }

  if (commitStatus === null && reviewDecision === 'APPROVED') {
    return accept(
      '✅ CI checks have not been defined but the PR has been approved'
    )
  }

  if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === 'PENDING' &&
    noopMode
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Reviews are not required for a noop deployment but CI checks must be passing in order to continue`
    )
  }

  if (reviewDecision === null && commitStatus === 'PENDING' && !noopMode) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
    )
  }

  if (reviewDecision === null && commitStatus === 'PENDING' && noopMode) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`,
      [
        {
          level: 'info',
          message:
            'note: even noop deploys require CI to finish and be in a passing state'
        }
      ]
    )
  }

  if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === null &&
    noopMode
  ) {
    const message = `✅ CI checks have not been defined and ${COLORS.highlight}noop${COLORS.reset} requested`
    return accept(message, [
      {level: 'info', message},
      {
        level: 'info',
        message:
          'note: noop deployments do not require pr review and ignore "changes requested" reviews'
      }
    ])
  }

  if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === 'PENDING' &&
    !noopMode
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing and the PR must be approved in order to continue`
    )
  }

  if (
    (reviewDecision === 'APPROVED' ||
      reviewDecision === null ||
      reviewDecision === 'skip_reviews') &&
    commitStatus === 'PENDING' &&
    !noopMode
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks must be passing in order to continue`
    )
  }

  if (commitStatus === 'MISSING') {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> ${missingCheckMessage}`
    )
  }

  if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === 'SUCCESS'
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> CI checks are passing but an approval is required before you can proceed with deployment`
    )
  }

  if (reviewDecision === 'APPROVED' && commitStatus === 'FAILURE') {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request is approved but CI checks are failing`
    )
  }

  if (
    (reviewDecision === null || reviewDecision === 'skip_reviews') &&
    commitStatus === 'FAILURE'
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request does not require approvals but CI checks are failing`
    )
  }

  if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === null &&
    !noopMode
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${String(commitStatus)}\`\n\n> Your pull request is missing required approvals`,
      [
        {
          level: 'info',
          message:
            'note: CI checks have not been defined so they will not be evaluated'
        }
      ]
    )
  }

  if (
    (reviewDecision === 'REVIEW_REQUIRED' ||
      reviewDecision === 'CHANGES_REQUESTED') &&
    commitStatus === 'skip_ci' &&
    !noopMode
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request is missing required approvals`,
      [
        {
          level: 'info',
          message:
            'note: CI checks are disabled for this environment so they will not be evaluated'
        }
      ]
    )
  }

  if (
    !noopMode &&
    reviewDecision === 'CHANGES_REQUESTED' &&
    commitStatus === 'FAILURE'
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request needs to address the requested changes, get approvals, and have passing CI checks before you can proceed with deployment`
    )
  }

  if (
    !noopMode &&
    reviewDecision === 'REVIEW_REQUIRED' &&
    commitStatus === 'FAILURE'
  ) {
    return reject(
      `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${reviewDecision}\`\n- commitStatus: \`${commitStatus}\`\n\n> Your pull request needs to get approvals and have passing CI checks before you can proceed with deployment`
    )
  }

  return reject(
    `### ⚠️ Cannot proceed with deployment\n\n- reviewDecision: \`${String(reviewDecision)}\`\n- commitStatus: \`${String(commitStatus)}\`\n\n> This is usually caused by missing PR approvals or CI checks failing`
  )
}
