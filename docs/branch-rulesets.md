# Branch Rulesets

A ruleset is a named list of rules that applies to a repository. You can have up to 75 rulesets per repository. In this project specifically, we care about the rulesets that are applied to the default (stable) branch of a repository (most likely `main` or `master`).

You should absolutely enable rulesets on your default branch when using this Action. It can help protect your default branch from accidental or even malicious changes.

This project will actually warn you in the logs if you are missing or have misconfigured certain rulesets. The "warnings" section of this document will help you understand how to fix these warnings and enable robust rulesets to protect your repository.

It should be noted that if you have a good reason to *not* use any of these rulesets, and you want to disable to loud warnings in the logs, you can do so by setting the `use_security_warnings` input option to `false`. This will disable all warnings in the logs.

Example:

```yaml
- uses: github/branch-deploy@vX.X.X
  id: branch-deploy
  with:
    use_security_warnings: false # <-- this will disable all warnings in the logs related to branch rulesets
```

## Warnings

### `missing_non_fast_forward`

Solution: Enable the **Block force pushes** rule

![missing_non_fast_forward](./assets/rules/missing_non_fast_forward.png)

### `missing_deletion`

Solution: Enable the **Restrict deletions** rule

![missing_deletion](./assets/rules/missing_deletion.png)

### `mismatch_required_status_checks_strict_required_status_checks_policy`

Solution: Enable the **Require branches to be up to date before merging** rule

![mismatch_required_status_checks_strict_required_status_checks_policy](./assets/rules/mismatch_required_status_checks_strict_required_status_checks_policy.png)

### `missing_pull_request`

Solution: Enable the **Require a pull request before merging** rule

![missing_pull_request](./assets/rules/missing_pull_request.png)

### `mismatch_pull_request_dismiss_stale_reviews_on_push`

Solution: Enable the **Dismiss stale pull request approvals when new commits are pushed** rule

![mismatch_pull_request_dismiss_stale_reviews_on_push](./assets/rules/mismatch_pull_request_dismiss_stale_reviews_on_push.png)

### `mismatch_pull_request_require_code_owner_review`

Solution: Enable the **Require review from Code Owners** rule

![mismatch_pull_request_require_code_owner_review](./assets/rules/mismatch_pull_request_require_code_owner_review.png)

### `mismatch_pull_request_required_approving_review_count`

Solution: Ensure that the **Required approvals** setting is not `0`

![mismatch_pull_request_required_approving_review_count](./assets/rules/mismatch_pull_request_required_approving_review_count.png)

### `missing_required_deployments`

Solution: Enable the **Require deployments to succeed** rule

![missing_required_deployments](./assets/rules/missing_required_deployments.png)

## Extra Documentation

- [Learn about rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Learn about repo rules in the API](https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28)
- [Learn about branch protection rules in the API](https://docs.github.com/en/rest/branches/branch-protection?apiVersion=2022-11-28)
