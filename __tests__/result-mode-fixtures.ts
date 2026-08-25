import type {CompletionContext} from '../src/types.ts'

export function createCompletionContext(
  overrides: Partial<CompletionContext> = {}
): CompletionContext {
  return {
    schema_version: 1,
    repository: 'octocat/example',
    run_id: 1200,
    run_attempt: 1,
    issue_number: 7,
    trigger_comment_id: 20,
    trusted_sha: '1'.repeat(40),
    lock_ref_sha: '2'.repeat(40),
    disable_lock: false,
    started_comment_id: 21,
    deployment_id: 30,
    reaction_id: 31,
    noop: false,
    ref: 'feature-branch',
    sha: '3'.repeat(40),
    environment: 'production',
    environment_url: 'https://example.com',
    actor: 'octocat',
    fork: false,
    commit_verified: true,
    deployment_start_time: '2026-01-02T03:04:05.000Z',
    approved_reviews_count: '1',
    review_decision: 'APPROVED',
    params: '--flag',
    parsed_params: '{"_":[],"flag":true}',
    settings: {
      deploy_message_path: '.github/deployment_message.md',
      environment_url_in_comment: 'true',
      successful_deploy_labels: 'deployed',
      failed_deploy_labels: 'deploy-failed',
      successful_noop_labels: 'noop-complete',
      failed_noop_labels: 'noop-failed',
      skip_successful_noop_labels_if_approved: 'false',
      skip_successful_deploy_labels_if_approved: 'false'
    },
    ...overrides
  }
}
