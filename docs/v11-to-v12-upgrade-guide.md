# Upgrading from v11 to v12

This guide explains user-visible behavior changes in the next major release.

## The action runs on Node 24

### What changed

Branch Deploy v12 declares the GitHub Actions Node 24 runtime in `action.yml`. The development and CI runtime are also pinned to the exact Node 24 version in `.node-version`.

### Who is affected

Most users on GitHub-hosted runners do not need to change anything. Self-hosted runner and GitHub Enterprise Server users should confirm that their runner fleet and server version support Node 24 JavaScript actions before moving production workflows to `github/branch-deploy@v12`.

### What should I do?

- Confirm your self-hosted runners can execute Node 24 actions.
- Confirm your GitHub Enterprise Server version supports the Node 24 action runtime.
- Test the exact v12 candidate SHA before moving important workflows to the movable `v12` tag.

## Fork pull request deployments are disabled by default

### What changed

The `allow_forks` input now defaults to `false`. Branch Deploy rejects deployment commands from forked pull requests unless the workflow explicitly opts back in with `allow_forks: true`.

Previously, fork deployments were allowed by default. v12 makes the safer behavior the default because forked pull requests are a stronger trust-boundary risk for deployment workflows.

### Who is affected

Repositories that intentionally deploy forked pull requests must update their Branch Deploy step. Repositories that do not deploy forks get the hardened default without changing their workflow.

### What should I do?

- If you do not deploy forked pull requests, remove any redundant `allow_forks: false` setting or leave it in place for clarity.
- If you intentionally deploy forked pull requests, set `allow_forks: true` explicitly.
- Combine fork support with required reviews, passing CI, trusted checkouts for helper code and templates, and deployment confirmation where appropriate.

## CI check verification fails closed

### What changed

Branch Deploy now distinguishes between a pull request that genuinely has no CI checks and a pull request whose complete CI status could not be verified. A repository can have more than 100 check runs and legacy commit statuses on one commit, so the Action now reads every page of check data whenever it needs to evaluate required, explicitly selected, or ignored checks.

If GitHub returns malformed or incomplete check data, a pagination cursor does not advance, a later page cannot be retrieved, or a page refers to a different commit, the deployment is rejected. The `commit_status` output is set to `UNAVAILABLE` for this condition.

Previously, some failures while processing check data could be treated like a pull request with no checks. That behavior could allow a deployment to continue without proving that every applicable check had passed.

### Who is affected

Most users do not need to change anything. This primarily affects repositories with more than 100 check or status contexts and repositories that encounter a temporary or malformed GitHub API response while a deployment command is being evaluated.

For example, if a commit has 100 successful checks on the first page and one required failing check on the second page, v12 finds the failing check and rejects the deployment.

### What should I do?

- If `commit_status` is `UNAVAILABLE`, retry the deployment command after GitHub's check data is available.
- Investigate persistent failures because they may indicate an API, permission, or repository-configuration problem.
- Configure `skip_ci` only for environments where bypassing CI is an intentional and reviewed policy. Do not use it merely to work around a transient verification failure.
- If a workflow consumes `commit_status`, allow for the new `UNAVAILABLE` value and treat it as a deployment-blocking result.

Deployments that explicitly use the configured stable branch or an enabled exact-SHA deployment retain their existing documented bypass behavior.

## Deployment locks are created atomically

### What changed

New deployment lock branches are now published only after their first commit already contains a complete `lock.json`. This removes the short-lived state in which a lock branch could be visible before its lock file was written.

New lock files also contain additive `schema_version` and `claim_id` fields. `schema_version` is currently `1`. `claim_id` is a deterministic SHA-256 identifier for the repository, pull request comment, environment or global target, requested ref, and sticky-lock mode. If the same workflow event retries after acquiring its lock, Branch Deploy recognizes the same claim without rewriting the lock or posting a duplicate lock-acquired comment.

The lock protocol is idempotent at acquisition time. It does not guarantee that arbitrary deployment commands in later workflow steps run exactly once; workflow authors should continue to make those steps safe to retry where practical.

### Who is affected

Most users do not need to change anything. Integrations that parse `lock.json` with a strict schema must allow the optional `schema_version` value `1` and optional `claim_id` string. Existing lock files without these fields remain supported and keep their current ownership behavior.

A lock branch that exists without a readable `lock.json` is now treated as an ambiguous lock and blocks the operation. Branch Deploy no longer repairs or claims that branch automatically because doing so could overwrite another request during a race or hide repository corruption.

### What should I do?

- If your tooling validates lock JSON, allow an optional `schema_version` value of `1` and an optional `claim_id` matching `sha256:` followed by 64 lowercase hexadecimal characters.
- If Branch Deploy reports an ambiguous lock, open the lock branch named in the message and inspect its contents.
- If the branch is stale or corrupt, use the normal `.unlock <environment>` command, or `.unlock --global` for a global lock, after confirming that removing it is safe.
- Do not interpret idempotent lock acquisition as exactly-once execution for deployment scripts that run after the Action.

## Main action decisions are available as structured outputs

### What changed

Branch Deploy now writes three additive outputs on every terminal path through the main action:

- `decision` is one of `continue`, `complete`, `stop`, or `failure`.
- `reason_code` is a stable machine-readable explanation for that decision.
- `result` is a deterministic JSON string containing the same decision and reason plus the operation and deployment details that were known at that point.

The version-one `result` object has this shape:

```json
{
  "schema_version": 1,
  "decision": "continue",
  "reason_code": "deployment_ready",
  "operation": "deploy",
  "deployment_type": "branch",
  "environment": "production",
  "ref": "feature-branch",
  "sha": "0123456789abcdef0123456789abcdef01234567",
  "deployment_id": 123456
}
```

The `operation` value is one of `deploy`, `noop`, `lock`, `unlock`, `lock_info`, `help`, `merge_deploy`, `unlock_on_merge`, or `none`. Fields that are not known or do not apply are `null`.

Version one defines these reason codes:

- `unlock_on_merge_completed`
- `merge_deploy_required`
- `merge_deploy_not_required`
- `unsupported_event`
- `deprecated_command`
- `naked_command_disabled`
- `no_trigger`
- `permission_denied`
- `help_completed`
- `invalid_environment`
- `lock_info_completed`
- `lock_acquired`
- `lock_already_owned`
- `lock_conflict`
- `unlock_completed`
- `unlock_failed`
- `prechecks_failed`
- `commit_safety_failed`
- `deployment_order_failed`
- `confirmation_rejected`
- `confirmation_timed_out`
- `noop_ready`
- `base_branch_update_required`
- `deployment_ready`
- `unexpected_error`

The result describes the decision made during the action's main phase. It does not report whether a consumer's later deployment steps succeeded or whether the post action subsequently completed a GitHub deployment.

### Who is affected

Existing workflows do not need to change because all previous scalar outputs and their values remain available. Workflows that infer outcomes from log text or combine several older outputs can use the new outputs for a more stable contract.

### What should I do?

Give the Branch Deploy step an `id`, then consume either the scalar aliases or the JSON object:

```yaml
- name: Prepare branch deployment
  id: branch-deploy
  uses: github/branch-deploy@v12

- name: Run deployment
  if: steps.branch-deploy.outputs.decision == 'continue'
  env:
    BRANCH_DEPLOY_RESULT: ${{ steps.branch-deploy.outputs.result }}
  run: |
    echo "reason: ${{ steps.branch-deploy.outputs.reason_code }}"
    echo "environment: ${{ fromJSON(steps.branch-deploy.outputs.result).environment }}"
```

Treat `schema_version` as the compatibility boundary when parsing `result`. Prefer `reason_code` over matching human-readable comments or logs.

## Decorative reactions are best-effort

### What changed

An empty `reaction` input now disables the initial and final decorative reactions instead of causing the action to fail. In that configuration, the `initial_reaction_id` output and saved reaction state are empty.

Failures while creating the initial reaction, removing it, or adding the final success or failure reaction now produce warnings and do not suppress the requested command or its required status comment. An invalid configured reaction name remains a fatal input error.

Deployment confirmation reactions are different: when `deployment_confirmation` is enabled, the original actor's approval is an authorization decision and remains fail-closed. Confirmation now checks every page of reactions, ignores entries without a user, polls immediately, and uses bounded deadline-aware backoff. Temporary network failures, HTTP 408, 409, 429, and 5xx responses are retried within the configured timeout; other permanent 4xx responses fail immediately.

### Who is affected

Workflows that leave `reaction` empty no longer need a workaround. A custom post-processing workflow that directly deletes the initial reaction must allow `initial_reaction_id` to be empty and skip deletion in that case.

### What should I do?

- Leave `reaction` empty if decorative reaction updates are not wanted.
- Guard any direct use of `initial_reaction_id` with a non-empty check.
- Keep `deployment_confirmation` enabled only where the workflow can wait for the original actor's explicit decision.
- Retry a command after a transient confirmation API failure; do not treat decorative-reaction tolerance as a bypass for confirmation.

If confirmation is rejected, times out, or errors, a non-sticky deployment lock is released before post mode is bypassed. Sticky locks retain their established persistence behavior.

## Unlock failures and generated metadata fail more reliably

### What changed

An interactive `.unlock` command now fails the action when GitHub returns a response showing that the lock branch was not deleted. It is no longer reported as a successful safe exit.

The help message now reports the real boolean value of `allow_forks` instead of applying the previous string comparison.

The `deployment_confirmation_timeout` input must now be a plain positive integer. Values like `10abc`, `0`, and `-1` are rejected during input parsing instead of being partially parsed or accepted.

Default pre-deploy, confirmation, and post-deploy metadata blocks are generated from typed objects with `JSON.stringify`. Quotes, backslashes, newlines, Unicode, and backticks in user-controlled values can no longer break the JSON or close its Markdown code fence. Field names, field ordering, marker comments, and null semantics remain stable. Custom Nunjucks deployment templates are unchanged.

### Who is affected

Users may notice a failed `.unlock` step where an earlier version printed a failure comment but still returned a safe exit. Workflows with malformed `deployment_confirmation_timeout` values must update them before v12 will run. Consumers that scrape the default metadata's exact whitespace or assume a three-backtick fence may also need an update.

### What should I do?

- Investigate a failed `.unlock` command and retry it after resolving the GitHub API or permission problem.
- Set `deployment_confirmation_timeout` to a positive integer number of seconds such as `60`.
- Parse the JSON between the `pre-deploy-metadata`, `deployment-confirmation-metadata`, or `post-deploy-metadata` marker comments instead of depending on indentation or fence length.
- Continue using a custom Nunjucks template if exact custom comment bytes are required; this change does not alter those templates.
