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
