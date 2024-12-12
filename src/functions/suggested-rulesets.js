export const SUGGESTED_RULESETS = [
  {
    type: 'deletion'
  },
  {
    type: 'non_fast_forward'
  },
  {
    type: 'pull_request',
    parameters: {
      dismiss_stale_reviews_on_push: true,
      require_code_owner_review: true
    }
  },
  {
    type: 'required_status_checks',
    parameters: {
      strict_required_status_checks_policy: true
    }
  },
  {
    type: 'required_deployments'
  }
]
