# Upgrading from v11 to v12

This guide explains user-visible behavior changes in the next major release.

## Agent-assisted migration prompt

The prompt below is designed for coding agents such as Codex or Claude. Replace the values in angle brackets where possible, then give the complete prompt to an agent that has access to the repository you want to migrate. The agent should still read this upgrade guide and the repository's own contribution instructions before making changes.

<details>
<summary>Copy the complete v11 to v12 migration prompt</summary>

```text
You are migrating an existing repository from Branch Deploy v11 to Branch Deploy v12. Work directly in the repository, inspect the current implementation before editing, and complete the migration with the smallest reviewable change set that preserves the repository's intended deployment behavior and security posture.

Repository or working directory: <REPOSITORY_PATH_OR_URL>
Target Branch Deploy reference: <EXACT_V12_COMMIT_SHA_OR_V12_TAG>
GitHub hosting environment: <GITHUB_COM_GHES_OR_UNKNOWN>
Runner environment: <GITHUB_HOSTED_SELF_HOSTED_OR_UNKNOWN>

If any placeholder is still unknown, discover it from the repository where possible. Ask the user only when the answer materially changes safety or compatibility and cannot be established from repository files. Prefer an exact reviewed v12 commit SHA for pre-release or high-risk acceptance testing. For a normal released migration, follow the repository's established action-pinning policy: preserve a full-SHA pin and its version comment when that is the local convention, or use the stable `v12` major tag when that is the explicit policy. Do not silently replace exact pins with mutable tags.

Primary objective

Update every real Branch Deploy v11 consumer in this repository to v12, including IssueOps deployment workflows, merge-deploy workflows, unlock-on-merge workflows, reusable workflows, custom deployment-message templates, helper scripts, tests, examples, and repository-specific documentation. Preserve existing deployment semantics unless v12 intentionally changes a contract described below. Do not perform unrelated workflow modernization, dependency updates, formatting churn, or refactors.

Authoritative sources

1. Read the repository's root and nested `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, security policy, and maintainer documentation before editing.
2. Read the v11-to-v12 upgrade guide from the target Branch Deploy revision in full.
3. Read the target revision's `action.yml`, custom deployment-message documentation, trusted-checkout guidance, lock documentation, merge-deploy documentation, and unlock-on-merge documentation when those features are present in the consumer repository.
4. Treat the consumer repository's existing workflows, scripts, tests, and pinning conventions as the source of truth for its intended behavior.
5. Do not rely on remembered input names, defaults, output values, template syntax, permissions, or GitHub runner behavior when the checked-in files can answer the question.

Non-negotiable constraints

- Keep the migration narrowly scoped to Branch Deploy v12 compatibility and directly related security corrections.
- Do not add runtime or test dependencies merely to perform the migration.
- Do not loosen GitHub token permissions, branch protections, required checks, review gates, deployment confirmation, commit verification, trusted-checkout boundaries, environment protections, action pins, or workflow concurrency.
- Do not remove existing scalar Branch Deploy outputs. V12 retains them as compatibility aliases even though `decision`, `reason_code`, and `result` are the recommended contract.
- Do not rewrite the permissive IssueOps command grammar, replace branch-based deployment creation with SHA-based creation, disable API auto-merge, alter legacy lock handling, or change unrelated `null`, empty-string, or string sentinel behavior. Preserve supported `.noop` behavior. If repository tests or documentation intentionally cover `.deploy noop`, preserve its deprecated-command warning path rather than treating it as a supported noop alias; update stale operational instructions to `.noop` or the configured `noop_trigger`.
- Do not assume Branch Deploy locks replace GitHub Actions `concurrency`. Locks coordinate IssueOps ownership; workflow concurrency may still be necessary to serialize shared infrastructure or remote state.
- Do not execute helper scripts or deployment logic from an untrusted pull request checkout unless that is an explicit and reviewed part of the repository's threat model. Keep Branch Deploy templates repository-relative so v12 fetches them at the trusted workflow SHA.
- Do not merge, release, move tags, or modify repository settings unless the user explicitly authorizes those operations.
- Preserve unrelated working-tree changes and keep generated files out of the diff unless the consumer repository requires them.

Phase 1: inventory the current integration

Before editing, produce an internal inventory of every relevant file and usage. Search the entire repository, including hidden GitHub configuration, for at least:

- `branch-deploy` action references, including case differences, forked action owners, exact SHA pins, version comments, reusable workflows, and examples.
- `issue_comment`, `pull_request`, and `push` workflows related to Branch Deploy.
- `merge_deploy_mode` and `unlock_on_merge_mode`.
- `deploy_message_path`, `.github/deployment_message.md`, `DEPLOY_MESSAGE`, `<%= results %>`, `{{ results }}`, `| safe`, and other Nunjucks constructs.
- `allow_forks`, `commit_status`, `checks`, `ignored_checks`, `required_contexts`, `skip_ci`, `disable_lock`, `enforced_deployment_order`, `deployment_confirmation_timeout`, `reaction`, `initial_reaction_id`, `decision`, `reason_code`, and `result`.
- Code that reads, validates, creates, copies, or deletes `lock.json` or `*-branch-deploy-lock` refs.
- Code that parses Branch Deploy comments, logs, metadata blocks, output JSON, deployment history, or exact human-readable error text.
- Checkout steps that use a pull request branch, `github.sha`, `github.event.pull_request.head.sha`, or `steps.<branch-deploy-step-id>.outputs.sha`.
- Repository helper scripts executed after a pull request checkout.
- Workflow permissions and concurrency groups used by deployment, noop, merge-deploy, and unlock jobs.

Summarize the inventory before deciding what must change. Distinguish active production workflows from disabled files, fixtures, generated examples, vendored copies, and historical documentation. Update all active consumers and any maintained examples or tests that are expected to stay accurate, but do not rewrite archived history.

Phase 2: select and update the action reference

1. Identify the repository's pinning policy from nearby actions and dependency automation configuration.
2. Update every active Branch Deploy v11 action reference that belongs to this migration.
3. If the repository pins actions to full commit SHAs, resolve the user-approved v12 release or candidate to its full 40-character commit SHA and retain the repository's version-comment format, such as `# pin@v12.0.0` when appropriate. Verify the SHA from an authoritative GitHub source; never invent or truncate it.
4. If the repository intentionally uses major tags, update the Branch Deploy reference to `@v12` only after confirming v12 has been released.
5. Preserve the action owner already approved by the repository unless the user explicitly wants to switch between a fork and `github/branch-deploy`.
6. Do not update unrelated actions as incidental churn.

Phase 3: verify Node 24 compatibility

Branch Deploy v12 runs as a Node 24 JavaScript action.

1. Determine whether workflows use GitHub-hosted runners, self-hosted runners, GitHub Enterprise Server, or a mixture.
2. GitHub-hosted users generally need no workflow change.
3. For self-hosted runners, verify that the installed GitHub Actions runner version supports Node 24 actions. Do not assume that installing Node 24 in a setup step changes the runtime used internally by JavaScript actions.
4. For GitHub Enterprise Server, verify that the deployed GHES version supports Node 24 JavaScript actions.
5. If compatibility cannot be proven from repository or platform documentation, do not guess. Report it as a blocking operator check before production rollout.

Phase 4: make the fork-deployment policy explicit

V12 changes the `allow_forks` default from `true` to `false`.

1. Determine whether this repository intentionally deploys pull requests from forks.
2. If fork deployments are not intended, accept the safer v12 default. An existing explicit `allow_forks: false` may remain for clarity or be removed only if the repository normally avoids redundant defaults.
3. If fork deployments are intentional, preserve that behavior by adding or retaining explicit `allow_forks: true` and clearly call out the security decision in the migration summary.
4. When forks are enabled, verify that review requirements, CI checks, deployment confirmation where appropriate, trusted helper checkouts, environment protections, and exact deployment checkout SHAs remain in place.
5. Never silently enable forks merely to preserve the old default.

Phase 5: review CI-status handling

V12 reads the complete paginated check rollup, collapses reruns by check identity, and fails closed when CI data is malformed or cannot be classified. `commit_status` can now be `UNAVAILABLE`.

1. Find every workflow expression, script, test, or integration that reads `commit_status`.
2. Add `UNAVAILABLE` as a deployment-blocking state where consumers enumerate possible values.
3. Do not map `UNAVAILABLE` to “no checks,” success, null, or a bypass.
4. Preserve intentional `skip_ci` policy, but do not add `skip_ci` as a workaround for transient GitHub API failures.
5. Review explicit `checks`, `ignored_checks`, `required_contexts`, and status-context assumptions. Keep the intended policy; v12 now evaluates all pages and the newest rerun instead of allowing an older result to win.
6. If tests mock GraphQL check data or legacy status contexts, update fixtures to include the identities, timestamps, database IDs, pagination, and commit identity required by the consumer's integration boundary.
7. Document that operators should retry a command when GitHub temporarily returns indeterminate check data and investigate persistent `UNAVAILABLE` results.

Phase 6: validate deployment history and order configuration

V12 uses strict cursor pagination and the newest relevant deployment state.

1. If `enforced_deployment_order` is configured, parse the configured environment list exactly as the action will receive it.
2. Remove accidental duplicate environment entries.
3. Ensure every environment that users can request while order enforcement is enabled appears in the configured order.
4. Do not reorder environments unless the existing deployment policy clearly requires it.
5. Understand that each preceding environment's newest deployment must be active at the selected SHA. An older active deployment no longer overrides a newer failed or inactive deployment.
6. If `merge_deploy_mode` is used, preserve it. V12 skips only when the newest identifiable Branch Deploy deployment completed successfully and its tree matches the current default branch. Failed, pending, malformed, or missing history causes deployment to run again.
7. Update tests or operational documentation that assumed an older successful deployment could override newer failed or pending history.

Phase 7: update lock consumers without breaking legacy locks

New v12 locks are created atomically and add `schema_version` and `claim_id`.

1. Find strict JSON schemas, typed models, shell queries, policy checks, dashboards, cleanup scripts, or tests that inspect `lock.json`.
2. Continue accepting legacy locks that omit both new fields.
3. For new locks, accept optional `schema_version` with the current value `1`.
4. Accept optional `claim_id` matching `sha256:` followed by 64 lowercase hexadecimal characters.
5. Do not make either field mandatory when reading existing lock branches.
6. Preserve all established fields and meanings, including ownership, branch, environment or global target, reason, sticky state, link, timestamps, and unlock command.
7. Treat a lock branch without a readable `lock.json` as ambiguous and blocking. Do not automatically repair, overwrite, or claim it.
8. Preserve sticky-lock behavior. Do not infer that idempotent lock acquisition makes later deployment scripts exactly once.
9. Retain workflow concurrency for shared state or infrastructure even when Branch Deploy locks are enabled.
10. If `disable_lock` is enabled, verify that concurrent deployments are genuinely safe, document that existing locks are ignored and unchanged, and ensure another mechanism serializes any shared state that still requires it.

Phase 8: adopt structured outputs carefully

V12 recommends `decision`, `reason_code`, and `result`, while retaining existing scalar outputs.

1. Ensure every Branch Deploy step that consumes outputs has a stable `id`.
2. Existing scalar-output consumers may remain unchanged for the migration unless moving them to structured outputs clearly reduces brittle log or comment parsing.
3. Prefer `decision == 'continue'` for the main deployment gate in new or intentionally updated logic.
4. Prefer `reason_code` over matching human-readable comments, annotations, or logs.
5. When parsing `result`, treat `schema_version` as the compatibility boundary and parse the JSON with a real JSON parser or GitHub's `fromJSON`, not string splitting or regular expressions.
6. Preserve compatibility with nullable fields. Fields that are unknown or inapplicable are represented as `null` in the structured result.
7. Remember that the main-phase result does not prove later consumer deployment steps or the post action succeeded.
8. Update exhaustive reason-code handling to allow the v12 codes `ref_changed` and `deployment_sha_mismatch`. Both are failure outcomes and must not continue deployment.
9. If the consumer has an allowlist of reason codes, compare it with the complete list in the v12 guide rather than adding only the two new codes.
10. Do not remove old output checks solely because structured outputs exist; compatibility cleanup can be a separate deliberate change.

Phase 9: review reactions and confirmation

1. An empty `reaction` now intentionally disables decorative reactions.
2. If custom code reads or deletes `initial_reaction_id`, guard that operation so an empty ID is a valid no-op.
3. Initial and final decorative reaction API failures are best-effort warnings and no longer suppress the command or required status comment.
4. Do not apply that tolerance to `deployment_confirmation`. Confirmation is an authorization decision and remains fail-closed.
5. Preserve deployment-confirmation policy and timeout unless the user requests a policy change.
6. Ensure `deployment_confirmation_timeout` is a plain positive integer such as `60`. Replace malformed values such as `10abc`, `0`, or negative numbers.

Phase 10: migrate custom deployment templates

This is the highest-risk compatibility area and must be inspected even if `deploy_message_path` is not explicitly set, because the default remains `.github/deployment_message.md`.

1. Determine whether `.github/deployment_message.md` or another configured template exists.
2. Treat `deploy_message_path` as a repository-relative path fetched through GitHub's Contents API at the exact trusted workflow SHA. It is no longer a runner filesystem path.
3. Replace absolute paths, `${{ github.workspace }}` prefixes, checkout-directory prefixes, and expressions such as `${{ steps.trusted-path.outputs.trusted_dir }}/.github/deployment_message.md` with a repository-relative path such as `.github/deployment_message.md`.
4. Reject or correct paths containing backslashes, empty segments, `.` segments, or `..` traversal.
5. Do not add a checkout merely to make the template available. Branch Deploy fetches the template itself from the trusted SHA.
6. Keep separate trusted checkouts for repository-owned helper scripts when those helpers are executed; the trusted template fetch does not make other checked-out files trustworthy.
7. Replace legacy `<%= results %>` placeholders with `{{ results }}`.
8. Replace `{{ results | safe }}` with `{{ results }}`.
9. Remove Nunjucks-only filters, calls, property traversal, loops, includes, imports, macros, assignments, template comments, and arbitrary expressions.
10. Use only the v12 safe grammar: allowlisted variable interpolation; nested `if`/`else`; boolean or negated-boolean conditions; `==`, `===`, `!=`, or `!==` comparisons against JSON primitive literals; and ternaries whose two result branches are literals.
11. Remember that all comparisons are strict, including those written with `==` or `!=`.
12. Supported condition literals are double-quoted JSON strings, booleans, null, and JSON numbers.
13. Supported variables are documented by v12 and include `environment`, `environment_url`, `status`, `noop`, `ref`, `sha`, `actor`, `approved_reviews_count`, `review_decision`, `deployment_id`, `fork`, `params`, `parsed_params`, `deployment_end_time`, `logs`, `commit_verified`, `total_seconds`, and `results`. Do not invent variables.
14. Ordinary runtime variables are HTML-escaped. Check whether the existing template intentionally depended on unescaped HTML or Markdown from one of those variables and redesign that output safely if necessary.
15. `results` contains `DEPLOY_MESSAGE`, is inserted as raw Markdown, and is rendered once. Do not pre-escape template delimiters in deployment output. Text such as `{{ actor }}` inside `DEPLOY_MESSAGE` must remain literal and inert.
16. A missing trusted template falls back to the standard message. Invalid paths, malformed responses, invalid trusted SHAs, and non-404 API failures stop the post action.
17. Remove obsolete template-preprocessing helpers only when they exist solely to support the old Nunjucks or filesystem-path behavior and their removal does not affect other deployment output processing.
18. Preserve safe output transport. For multiline `DEPLOY_MESSAGE`, use the repository's established environment-file mechanism and collision-safe delimiter handling rather than unsafe inline shell interpolation.

Phase 11: preserve trusted checkout boundaries

Issue-comment workflows load their workflow definition from the default branch, but pull request files checked out later are still pull request controlled.

1. Continue using `steps.<branch-deploy-step-id>.outputs.sha` for the working checkout that contains the application or infrastructure being deployed.
2. Validate that output as an exact commit SHA where the workflow derives paths or passes it to other tools.
3. Use `github.sha` for a separate trusted checkout when repository-owned deployment helpers must run from the default-branch workflow commit.
4. Prefer `fetch-depth: 1` and `persist-credentials: false` for checkouts unless the workflow has a documented reason to differ.
5. Keep trusted helper code and deployable working content in separate directories.
6. Put generated deployment output in a safe temporary location such as `RUNNER_TEMP` rather than allowing an untrusted checkout to redirect a trusted helper through a symlink or replaced file.
7. Do not claim that `issue_comment` alone prevents secret theft. It protects the workflow definition, not arbitrary code checked out and executed later.

Phase 12: account for mutable-ref and deployment-SHA failures

V12 revalidates a pull request or stable-branch SHA immediately before noop continuation or deployment creation.

1. Ensure consumer logic treats `ref_changed` as a failed operation and does not run deployment steps.
2. Ensure `deployment_sha_mismatch` is also terminal and does not run deployment or post-processing steps as if creation succeeded.
3. Continue checking out the immutable `sha` output for actual deployment content, not the mutable branch name.
4. Do not add automatic retry loops that could deploy an unintended newer commit. Operators may rerun the IssueOps command after the branch stops moving and CI validates the new SHA.
5. Preserve branch-based deployment creation and existing API auto-merge behavior; v12 intentionally retains both while bounding the race with revalidation.

Phase 13: account for smaller strictness changes

1. Interactive `.unlock` now fails when GitHub reports that the lock ref was not deleted. Do not interpret a failure comment with a successful process conclusion as the expected v12 behavior.
2. The help output now reports the actual `allow_forks` boolean.
3. Generated pre-deploy, confirmation, and post-deploy metadata use proper JSON serialization and may change whitespace or Markdown fence length while preserving marker comments, field order, names, and null semantics.
4. If consumer tooling parses metadata, locate the relevant marker comments and parse the enclosed JSON with a real JSON parser. Do not depend on indentation, a fixed three-backtick fence, or ad hoc regular expressions.
5. Preserve the repository's handling of labels, comments, outputs, and environment URLs unless a documented v12 change requires an adjustment.

Phase 14: implement a minimal migration

After completing the inventory and compatibility analysis:

1. State the migration decisions you are making, especially the target action reference, fork policy, runner compatibility, template changes, and any consumer code that must understand new outputs or lock fields.
2. Edit only files required for the migration.
3. Preserve local YAML style, boolean style, quoting, key ordering, action-pin comments, step names, job names, permissions, and shell conventions unless a change is necessary.
4. Keep existing environment names, triggers, commands, lock settings, merge-deploy behavior, unlock behavior, checkout targets, and deployment logic.
5. Update repository documentation and examples that would otherwise instruct users to use v11 behavior.
6. Add or update focused tests for changed consumer logic, templates, schemas, and workflow contracts. Do not introduce a new test framework.
7. Do not generate or commit unrelated artifacts.

Phase 15: verify the migration

Run the repository's own documented formatting, lint, type-check, test, workflow-validation, and policy commands that apply to the changed files. Do not install dependencies without authorization, and follow the repository's package-manager and supply-chain policy.

Perform targeted static checks:

- Confirm no active Branch Deploy v11 references remain unless explicitly documented as intentional.
- Confirm every replacement action reference matches the chosen v12 tag or exact SHA and the repository's pin-comment convention.
- Confirm no active custom template contains `<%= results %>`, `| safe`, unsupported filters, calls, property access, loops, includes, imports, macros, assignments, or template comments.
- Confirm every `deploy_message_path` is repository-relative and free of workspace or checkout-directory prefixes and traversal segments.
- Confirm every strict lock consumer accepts legacy locks plus optional `schema_version: 1` and optional `claim_id`.
- Confirm every exhaustive `commit_status` consumer blocks `UNAVAILABLE`.
- Confirm every exhaustive reason-code consumer handles `ref_changed` and `deployment_sha_mismatch` as terminal failures.
- Confirm every direct use of `initial_reaction_id` tolerates an empty value.
- Confirm every `deployment_confirmation_timeout` is a positive integer.
- Confirm enforced deployment-order configuration contains no duplicates and includes every requestable environment.
- Confirm deployment content is checked out at the Branch Deploy `sha` output.
- Confirm trusted repository helpers do not accidentally run from the pull request checkout.

When practical, perform exact-SHA acceptance before switching a production workflow to the movable v12 tag. Use a harmless pull request and exercise the modes actually used by the repository. A representative matrix may include:

- `.help` and command-dispatch behavior.
- `.noop`, including selected SHA, outputs, comments, and post behavior.
- Explicit `.lock`, `.wcid`, and `.unlock`, including the new lock fields and final cleanup.
- `.deploy`, including deployment creation, selected SHA, in-progress and final status, comments, labels, and sticky or non-sticky lock behavior.
- A trusted custom message with success, failure, noop, null, multiline, Markdown, and template-looking text inside `DEPLOY_MESSAGE` to prove one-pass inert insertion.
- Merge-deploy mode for both deployment-required and already-deployed outcomes.
- Unlock-on-merge mode, confirming it removes only locks associated with the merged pull request.
- Fork behavior when the repository intentionally supports forks.
- Deployment confirmation when enabled.
- Cleanup that restores temporary workflow pins and fixtures and leaves no test lock or branch behind.

Do not claim live acceptance was performed unless the workflows actually ran against the exact final candidate SHA. If the migration commit or target action SHA changes, previous exact-SHA acceptance is no longer evidence for the final state.

Phase 16: final report

At completion, provide a concise report with:

1. The Branch Deploy references changed and the exact target version or SHA.
2. The files changed.
3. The fork-deployment policy selected.
4. Node 24 runner or GHES compatibility status, including any operator verification still required.
5. Custom-template migrations and any intentionally unsupported legacy syntax removed.
6. Consumer updates for `UNAVAILABLE`, structured outputs, reason codes, locks, reactions, timeouts, metadata, deployment order, or mutable refs.
7. Security properties preserved, especially trusted checkouts, exact deployment SHA checkout, permissions, environment protections, and concurrency.
8. Tests and acceptance actually completed, without claiming commands or live runs that were not performed.
9. Remaining risks, manual checks, or rollout steps.
10. A clear statement that unrelated behavior was left unchanged.

Stop and ask the user before proceeding if the migration would require intentionally enabling fork deployments, weakening CI or review requirements, changing deployment environments or order, removing concurrency around shared state, executing pull request helper code with secrets, changing repository permissions, using an unverified action reference, or making another breaking behavior change beyond the documented v12 migration.
```

</details>

## The action continues to run on Node 24

### Runtime compatibility

Branch Deploy v12 continues to use the GitHub Actions Node 24 runtime already declared by current v11 releases. The development and CI runtime remain pinned to an exact Node 24 version in `.node-version`.

### Who is affected

Most users on GitHub-hosted runners and current v11 releases do not need to change anything. Users moving from older releases, self-hosted runner users, and GitHub Enterprise Server users should confirm that their runner fleet and server version support Node 24 JavaScript actions before moving production workflows to `github/branch-deploy@v12`.

### What should I do?

- Confirm your self-hosted runners can execute Node 24 actions. Node 24 requires a compatible runner and does not support ARM32 or macOS 13.4 and older.
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
- Combine fork support with required reviews, passing CI, trusted checkouts for helper code, trusted-SHA deployment templates, and deployment confirmation where appropriate.

## CI check verification fails closed

### What changed

Branch Deploy now distinguishes between a pull request that genuinely has no CI checks and a pull request whose complete CI status could not be verified. A repository can have more than 100 check runs and legacy commit statuses on one commit, so the Action now reads every page of check data whenever it needs to evaluate required, explicitly selected, or ignored checks.

Repeated check runs are collapsed by GitHub App integration and check name, while legacy status contexts are collapsed by context name. The newer check run wins by database identity and start time, so an older run that finishes after a newer rerun starts cannot hide that newer rerun's pending or failing state. Missing integration identities, timestamps, required-check flags, or other ordering data fail closed when duplicate results cannot be classified safely.

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

## Deployment history uses the newest relevant state

### What changed

Enforced deployment order now checks only the newest deployment for each preceding environment. That deployment must be `ACTIVE` at the selected SHA. An older active deployment cannot satisfy the order after a newer failed or inactive deployment. Duplicate environments in `enforced_deployment_order` and requested environments missing from that order are rejected as invalid configuration.

Merge deploy mode now skips deployment only when the newest identifiable `branch-deploy` deployment is active and its commit tree matches the current default branch. A failed, pending, missing, or malformed latest deployment requires another deployment. Deployment-history pagination also validates repository identity, environment identity, and cursor progress.

### Who is affected

Repositories using `enforced_deployment_order` or `merge_deploy_mode` may see a deployment continue or fail where older versions selected an earlier successful deployment from history. Invalid duplicate or incomplete order configurations now fail explicitly.

### What should I do?

- Remove duplicate environments from `enforced_deployment_order` and include every environment that can be requested while order enforcement is enabled.
- Treat a newer failed or inactive deployment as authoritative; repair or rerun that environment instead of relying on an older active deployment.
- In merge deploy workflows, allow the deployment to run again when the latest relevant history is failed, pending, or malformed.

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

## Deployment locks can be disabled explicitly

### What changed

Branch Deploy includes the additive `disable_lock` input introduced by [upstream PR #453](https://github.com/github/branch-deploy/pull/453). It defaults to `false`, so existing workflows keep their normal lock behavior.

When `disable_lock: true` is set, deployments and noops skip lock inspection and acquisition, post processing skips lock inspection and release, and interactive lock-related commands return a successful informational result with the `locking_disabled` reason code. Existing environment and global lock branches are ignored and left unchanged.

### Who is affected

No workflow must enable this input for v12 compatibility. It is intended only for deployment models where concurrent operations are independently safe, such as uploads of separately versioned mobile artifacts. Workflows that mutate the same service, environment, infrastructure, or remote state should retain locks and any required GitHub Actions concurrency.

### What should I do?

- Leave `disable_lock` at its default of `false` unless overlapping deployments are known to be safe.
- Remove existing lock branches before enabling it, or temporarily use an authorized workflow with `disable_lock: false` to run the normal unlock command.
- Do not treat disabled Branch Deploy locks as a replacement for workflow concurrency around shared state.
- If automation consumes structured results for `.lock`, `.unlock`, or `.wcid`, accept `locking_disabled` as a completed informational outcome.

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
- `locking_disabled`
- `lock_acquired`
- `lock_already_owned`
- `lock_conflict`
- `unlock_completed`
- `unlock_failed`
- `prechecks_failed`
- `commit_safety_failed`
- `deployment_order_failed`
- `ref_changed`
- `deployment_sha_mismatch`
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
    REASON_CODE: ${{ steps.branch-deploy.outputs.reason_code }}
    ENVIRONMENT: ${{ fromJSON(steps.branch-deploy.outputs.result).environment }}
  run: |
    printf 'reason: %s\n' "$REASON_CODE"
    printf 'environment: %s\n' "$ENVIRONMENT"
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

## Custom deployment templates are fetched from a trusted SHA

### What changed

Branch Deploy no longer reads `deploy_message_path` from the runner filesystem or renders custom deployment messages with Nunjucks. The input is now a repository-relative path. In post mode, Branch Deploy fetches that path through GitHub's Contents API from the current repository at the exact trusted workflow SHA saved by the main action.

Absolute paths, backslashes, empty path segments, `.` segments, and `..` traversal segments are rejected. A missing file falls back to the default deployment message, while invalid paths, invalid trusted SHAs, malformed file responses, and non-404 API failures stop the post action.

Templates now use a deliberately limited grammar: allowlisted variable interpolation, nested `if`/`else` blocks, boolean or negated-boolean conditions, strict comparisons with literals, and literal-only ternary expressions. Filters, function calls, property access, loops, includes, macros, assignments, template comments, and arbitrary expressions are not supported.

Runtime variables are HTML-escaped by default. The new `results` variable contains `DEPLOY_MESSAGE`, is inserted as raw Markdown, and is rendered only once. Template-looking text inside deployment output therefore remains inert rather than being evaluated.

### Who is affected

Workflows that pass an absolute path, a runner checkout path, or an expression such as `${{ steps.trusted-path.outputs.trusted_dir }}/.github/deployment_message.md` must change the input to a repository-relative path. Existing Nunjucks templates must be reduced to the supported grammar. Templates that depended on Nunjucks filters such as `| safe`, complex expressions, includes, macros, or property access will otherwise fail closed.

Ordinary variable interpolation may produce different bytes because runtime values are now HTML-escaped. Deployment output that was prepared for later Nunjucks rendering should remove that preprocessing and use `{{ results }}` directly.

### What should I do?

- Store the template in the same repository and set `deploy_message_path` to a path such as `.github/deployment_message.md`.
- Remove runner workspace prefixes and trusted-checkout directory expressions from `deploy_message_path`; the Action performs the trusted-SHA fetch itself.
- Replace Nunjucks-only syntax with the [supported safe grammar](custom-deployment-messages.md#supported-template-grammar).
- Replace a raw deployment-output expression such as `{{ results | safe }}` with `{{ results }}`. Do not escape Nunjucks delimiters in deployment output; rendering is single-pass in v12.
- Test the exact v12 candidate SHA with representative success, failure, noop, null, and multiline deployment-result values before upgrading the movable `v12` reference.

## Mutable deployment refs are revalidated

### What changed

Branch Deploy re-fetches the selected pull request or stable-branch SHA immediately before continuing a noop or creating a deployment. If the ref moved after prechecks, the action releases a non-sticky lock, bypasses post mode, and reports `ref_changed`. Exact-SHA and fork deployments already use immutable refs and do not need this extra lookup.

GitHub deployment responses are also checked against the SHA that passed prechecks. A mismatch is marked `error`, a non-sticky lock is released, post mode is bypassed, and the result reports `deployment_sha_mismatch`.

### Who is affected

Workflows that push to a deployment branch while Branch Deploy is running may now fail closed instead of deploying the moved branch. The action still creates ordinary deployments with the branch ref and preserves API auto-merge behavior.

### What should I do?

Retry the IssueOps command after the branch stops moving. Use the structured `reason_code` output to distinguish a ref movement from other failures, and continue checking out `steps.branch-deploy.outputs.sha` in deployment steps.

## Unlock failures and generated metadata fail more reliably

### What changed

An interactive `.unlock` command now fails the action when GitHub returns a response showing that the lock branch was not deleted. It is no longer reported as a successful safe exit.

The help message now reports the real boolean value of `allow_forks` instead of applying the previous string comparison.

The `deployment_confirmation_timeout` input must now be a plain positive integer. Values like `10abc`, `0`, and `-1` are rejected during input parsing instead of being partially parsed or accepted.

Default pre-deploy, confirmation, and post-deploy metadata blocks are generated from typed objects with `JSON.stringify`. Quotes, backslashes, newlines, Unicode, and backticks in user-controlled values can no longer break the JSON or close its Markdown code fence. Field names, field ordering, marker comments, and null semantics remain stable.

### Who is affected

Users may notice a failed `.unlock` step where an earlier version printed a failure comment but still returned a safe exit. Workflows with malformed `deployment_confirmation_timeout` values must update them before v12 will run. Consumers that scrape the default metadata's exact whitespace or assume a three-backtick fence may also need an update.

### What should I do?

- Investigate a failed `.unlock` command and retry it after resolving the GitHub API or permission problem.
- Set `deployment_confirmation_timeout` to a positive integer number of seconds such as `60`.
- Parse the JSON between the `pre-deploy-metadata`, `deployment-confirmation-metadata`, or `post-deploy-metadata` marker comments instead of depending on indentation or fence length.
- If exact custom comment bytes are required, account for the v12 trusted-template grammar and escaping changes described above.
