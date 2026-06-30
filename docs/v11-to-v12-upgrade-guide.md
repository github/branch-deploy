# Upgrading from v11 to v12

This guide explains user-visible behavior changes being prepared for the next major release. It will be expanded as additional v12 changes are completed.

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

New lock files also contain an additive `claim_id` field. It is a deterministic SHA-256 identifier for the repository, pull request comment, environment or global target, requested ref, and sticky-lock mode. If the same workflow event retries after acquiring its lock, Branch Deploy recognizes the same claim without rewriting the lock or posting a duplicate lock-acquired comment.

The lock protocol is idempotent at acquisition time. It does not guarantee that arbitrary deployment commands in later workflow steps run exactly once; workflow authors should continue to make those steps safe to retry where practical.

### Who is affected

Most users do not need to change anything. Integrations that parse `lock.json` with a strict schema must allow the optional `claim_id` string. Existing lock files without this field remain supported and keep their current ownership behavior.

A lock branch that exists without a readable `lock.json` is now treated as an ambiguous lock and blocks the operation. Branch Deploy no longer repairs or claims that branch automatically because doing so could overwrite another request during a race or hide repository corruption.

### What should I do?

- If your tooling validates lock JSON, allow an optional `claim_id` matching `sha256:` followed by 64 lowercase hexadecimal characters.
- If Branch Deploy reports an ambiguous lock, open the lock branch named in the message and inspect its contents.
- If the branch is stale or corrupt, use the normal `.unlock <environment>` command, or `.unlock --global` for a global lock, after confirming that removing it is safe.
- Do not interpret idempotent lock acquisition as exactly-once execution for deployment scripts that run after the Action.
