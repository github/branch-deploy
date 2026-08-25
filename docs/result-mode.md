# Result Mode 📣

> Report deployment results after work in multiple jobs

If your deployment runs across multiple jobs, you can use result mode to let the `branch-deploy` Action report the final outcome for you. This replaces the extra workflow YAML for updating deployment statuses, posting comments, managing labels, and cleaning up locks. It works for both regular deployments and noops!

> **Note:** Result mode is entirely optional. The `result_mode` input defaults to `false`, so existing single-job workflows do not need to change.

## How does it work? 🤔

There are three parts to the workflow:

1. The **trigger job** runs the usual deployment checks and acquires a lock when locking is enabled. With `skip_completing: true`, it leaves completion to a later job and provides a `context` output.
2. Your **deployment jobs** do the actual work, such as deploying an application or running a noop.
3. The **result job** runs the Action with `result_mode: true`. It uses the original context and selected job results to update statuses, comments, reactions, and labels, and safely clean up locks.

The result job creates a **separate final comment** on the pull request. It leaves the original deployment-started comment alone.

## Usage

Start by setting `skip_completing: true` on the first `branch-deploy` step. Pass its `context` output directly through the trigger job, alongside the `continue`, `noop`, and `sha` outputs used by your deployment jobs. The context is a JSON object containing the original deployment or noop details, including `run_attempt`. Do not build or edit it yourself.

Every job that performs deployment work must check the original attempt before running:

```yaml
if: >-
  ${{ needs.trigger.outputs.continue == 'true' &&
      fromJSON(needs.trigger.outputs.context).run_attempt == github.run_attempt }}
```

This prevents a rerun of just the deployment job from using checks that passed in an earlier attempt. Checking this only in the result job would be too late: the deployment work would already have run.

Next, add a result job that waits for the trigger job and every job whose result should count. Use `always()` so it can report failures and cancellations, and only run it when the trigger returned `continue: true`:

```yaml
result:
  needs: [trigger, deploy]
  if: ${{ always() && needs.trigger.outputs.continue == 'true' }}
  runs-on: ubuntu-latest
  permissions:
    contents: write
    deployments: write
    pull-requests: write
  steps:
    - uses: github/branch-deploy@vX.X.X
      with:
        result_mode: true
        context: ${{ needs.trigger.outputs.context }}
        job_results: ${{ toJSON(needs.*.result) }}
```

> **Important:** `vX.X.X` is a placeholder. Pin both `branch-deploy` steps to the same full immutable commit SHA in your workflow. Do not check out or execute pull request code in the result job.

See the [multiple-jobs example](examples.md#multiple-jobs) for a complete workflow.

## Job Results

The `job_results` input must be a nonempty JSON array containing only `success`, `failure`, `cancelled`, or `skipped`. The expression `toJSON(needs.*.result)` selects those result strings. Do not pass the full `needs` or `github` object, which can include unrelated data.

Include every job that is required for the deployment or noop, but leave intentionally skipped optional jobs out of this selection. The Action checks the selected results in this order:

1. `cancelled` - At least one job was cancelled, even if another job failed.
2. `failure` - At least one job failed, and none were cancelled.
3. `skipped` - At least one job was skipped, and none failed or were cancelled.
4. `success` - Every selected job succeeded.

Anything other than `success` fails the result job **after** reporting the outcome. A skipped job is not treated as a successful deployment.

### Noop Deployments

For noops, your jobs should run validation without calling your deployment provider. The multiple-jobs example keeps the deployment job running for both modes and uses `noop` to decide which steps should run.

If your workflow skips an entire deployment job for noops, select only the jobs required for that noop. Do not replace skipped results with `success`. Result mode updates noop comments, reactions, and labels without creating a deployment or deployment status.

## Customizing the Results ✏️

By default, the result job uses the first `branch-deploy` step's custom message path, label settings, and comment URL preference. The `result_inherit_settings` input controls this behavior:

- `true` (default) - Use the completion settings from the first step.
- `false` - Use the result step's normal completion inputs and their defaults instead.

> **Note:** Setting `result_inherit_settings: false` replaces the inherited settings as a group. It does not merge them. Any input you leave out uses its normal default, not the value from the first step.

### Deployment URLs

Use `result_url` to set the final deployment URL, for example when your deployment job produces a preview URL. It must be an HTTPS URL without embedded credentials or control characters. The Action only displays the link; it never fetches the URL, selects a deployment target from it, or uses it to authorize deployment work.

An empty `result_url` keeps the inherited URL. If inheritance is disabled, it uses the result job's `environment_urls` mapping instead. The `environment_url_in_comment` setting still controls whether the final comment automatically includes the link.

### Custom Messages

Set `DEPLOY_MESSAGE` in the result job to include additional result text. Custom templates are loaded from the original trusted workflow SHA, not from the pull request checkout. See [custom deployment messages](custom-deployment-messages.md) for more examples.

Keep the message and context free of secrets. Do not copy unrelated job outputs into either one.

## Deployment Locks 🔒

Result mode handles lock cleanup based on the outcome:

- **Cancellation** keeps the original lock for inspection.
- **Success, failure, or a skipped job** can release only the original, unchanged non-sticky environment lock.
- **Sticky, global, and replacement locks** are never deleted by result mode. A missing lock is not permission to remove a different one.

## Reruns and Recovery

Pass `context` only from the original trusted trigger job's output. Do not load it from pull request files, artifacts, or untrusted build output. The context is not an authentication token or a signed attestation. For noops, the Action relies on that trusted job output to know that the noop was ready, because there is no deployment record to check.

Result mode validates the original deployment or noop and only works within the **same workflow run and attempt**. To deploy again, rerun the complete workflow so the trigger job can perform fresh checks. Result mode cannot replay or repair an earlier deployment.

Run the result-mode action **once per context**. GitHub API writes do not provide an exactly-once guarantee, so do not configure multiple jobs or steps to complete the same context.

> ⚠️ `always()` allows the result job to run after ordinary failures and cancellations, but it cannot guarantee completion after force-cancellation, runner loss, or a result job that never starts. Inspect the deployment and current lock before recovering manually.

## Outputs 📤

A failed result job does not always mean the deployment itself failed. It can also mean that a comment, status update, or lock cleanup could not finish. Check the selected job results and deployment records before retrying the deployment.

The `deployment_result` output reports the selected job outcome after the original deployment or noop is verified. It stays `success` if your deployment jobs succeeded but reporting or cleanup failed.

The structured `result` output keeps schema version 1 and uses operation `result` with these reason codes:

| Reason code | Meaning |
| --- | --- |
| `result_completed` | Selected jobs succeeded and completion finished. |
| `result_non_success` | Completion finished, but a selected job failed, was cancelled, or was skipped. |
| `invalid_result_context` | Context was malformed or did not match the original operation. No completion writes were made. |
| `invalid_result_inputs` | Results or completion inputs were invalid. No completion writes were made. |
| `result_verification_failed` | GitHub records could not be read to verify the original operation. No completion writes were made. |
| `result_completion_failed` | Reporting or cleanup did not finish. Inspect the existing deployment, final comment, and original lock before manual recovery. |

## Manual Completion

If you prefer to manage completion yourself, you can still use `skip_completing: true` without a result-mode step. Your workflow is then responsible for final statuses, comments, reactions, labels, and safe non-sticky lock cleanup.

See [manual deployment control](../README.md#manual-deployment-control) and the [manual multi-job examples](examples.md#multiple-jobs-with-github-pages-and-hugo) for that approach.
