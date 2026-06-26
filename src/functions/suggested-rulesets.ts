export const SUGGESTED_RULESETS = [
  {
    type: 'deletion' // ensure that the stable / default branch is protected from deletion
  },
  {
    type: 'non_fast_forward' // ensure that the stable / default branch is protected from force pushes
  },
  {
    type: 'pull_request', // ensure that the stable / default branch requires a PR to merge into
    parameters: {
      dismiss_stale_reviews_on_push: true, // Dismisses approvals when new commits are pushed to the branch
      require_code_owner_review: true, // Require an approved review from code owners
      required_approving_review_count: 1 // At least one approving review is required by default (or greater)
    }
  },
  {
    type: 'required_status_checks', // ensure that the stable / default branch requires checks to pass before merging into
    parameters: {
      strict_required_status_checks_policy: true // requires that the branch is up to date with the latest stable / default branch before merging
    }
  },
  {
    type: 'required_deployments' // ensure that the stable / default branch requires deployments to pass before merging into (can be any environment)
  }
]
