import * as core from '../actions-core.ts'
import {saveActionState} from '../action-io.ts'
import type {BranchDeployContext} from '../types.ts'

// A simple function that checks the event context to make sure it is valid
// :param context: The GitHub Actions event context
// :returns: Boolean - true if the context is valid, false otherwise
export function contextCheck(context: BranchDeployContext): boolean {
  const issue =
    context.eventName === 'issue_comment' ? context.payload?.issue : undefined
  const pullRequest =
    typeof issue === 'object' && issue !== null && 'pull_request' in issue
      ? issue.pull_request
      : undefined

  // If the context is not valid, return false
  if (
    context.eventName !== 'issue_comment' ||
    pullRequest === null ||
    pullRequest === undefined
  ) {
    saveActionState('bypass', 'true')
    core.warning(
      'This Action can only be run in the context of a pull request comment'
    )
    return false
  }

  // If the context is valid, return true
  return true
}
