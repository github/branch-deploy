# Pull request stacks

GitHub's [native pull request stacks](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs) are in public preview. Branch Deploy supports them through the optional `enable_pr_stacks` input, which defaults to `false`.

## Enable stack deployments

Add the input to your existing Branch Deploy step:

```yaml
- uses: github/branch-deploy@vX.X.X
  id: branch-deploy
  with:
    enable_pr_stacks: true
```

The stack must be registered with GitHub, all its branches must be in the same repository, and its trunk must match the Action's `stable_branch`. The trunk is the branch targeted by the bottom pull request, usually `main`.

## What gets deployed

For a stack `main <- PR1 <- PR2 <- PR3`, running `.deploy` on PR2 deploys PR2's checked commit, which includes PR1. Branch Deploy applies the configured PR checks, review rules, draft rules, and environment exceptions to PR1 and PR2. PR3 is not part of that deployment. The usual `.noop` and lock settings still apply.

The `required_contexts` input keeps its existing meaning: GitHub checks those commit statuses on the commit being deployed. It does not add a separate status requirement to every lower commit. Use `checks` and `ignored_checks` to choose which CI checks must pass on each included PR.

With `checks: required` or `checks: all`, Branch Deploy also reads the trunk's branch protection and active rulesets. Every required status check must have been reported, including by the expected GitHub App when one is specified. A check that has not started yet is not treated as a passing check. Empty `checks` has the same behavior as `all`. The existing explicit check-list, `ignored_checks`, and `skip_ci` settings still apply.

Automatic CI selection cannot yet verify required-workflow rules or commit statuses that must come from a specific GitHub App. It stops if those rules cannot be verified. Ordinary check runs from a required App, including GitHub Actions, are supported. These deployment checks do not replace GitHub's final merge rules.

Branch Deploy verifies the stack's membership and commit ancestry before continuing. It stops if the stack has changed, is not linear, or GitHub cannot provide the stack metadata needed to verify it. The deployment uses the exact checked commit without asking GitHub to auto-merge another branch. Existing outputs keep their meanings: `ref` identifies the selected PR branch, or the checked SHA for forks, and `sha` is the checked commit to use in subsequent checkout steps. This does not enable unchecked SHA deployment commands.

## Updating a stack

If the stable branch or a lower PR moves, restack before retrying the command:

```shell
gh stack rebase
gh stack push
```

Wait for CI to finish, then run `.noop` or `.deploy` again. Branch Deploy does not rebase or merge stack branches for you, even with `update_branch: force`. Setting `update_branch: disabled` does not bypass stack ancestry checks. See GitHub's [stack management guide](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests) for conflict resolution and the website's rebase option.

## Compatibility

With `enable_pr_stacks: false`, Branch Deploy makes no stack API calls and keeps its existing behavior. Stable-branch rollbacks and explicit SHA commands also keep their existing paths.

With `enable_pr_stacks: true`, Branch Deploy uses the stack membership reported by its normal pull request lookup. Standalone PRs keep the existing deployment path without calling the preview stack API. Native stack members, including the bottom PR targeting `main`, must pass full stack validation. If a standalone PR joins a stack after its checks, retry the command so the stack can be checked.

PRs within a forked repository also receive this membership recheck when stack support is enabled. They keep their checked SHA even if the head branch moves. PRs from a different repository keep the existing fork behavior.

Enabling stacks does not enable `allow_non_default_target_branch_deployments`. Standalone PRs and unregistered branch chains still use that separate setting. When stack support is enabled, a recognized native stack must pass stack validation even if the broader non-default-branch override is also enabled.
