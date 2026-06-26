import * as core from '@actions/core'
import {saveActionState} from '../action-io.ts'
import {issueCommentContext} from '../trust-boundaries.ts'
import type {BranchDeployContext} from '../types.ts'

// A simple function that checks the event context to make sure it is valid
// :param context: The GitHub Actions event context
// :returns: Boolean - true if the context is valid, false otherwise
export function contextCheck(context: BranchDeployContext): boolean {
  // Get the PR event context
  let pr: unknown
  try {
    pr = issueCommentContext(context).payload.issue.pull_request
  } catch (error) {
    throw new Error(`Could not get PR event context: ${String(error)}`)
  }

  // If the context is not valid, return false
  if (
    context.eventName !== 'issue_comment' ||
    pr === null ||
    pr === undefined
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
