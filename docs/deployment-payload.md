# Deployment Payloads

The deployment payload is a JSON data structure that gets uploaded to GitHub when a new deployment is created. The values in this payload can be almost anything you want. The branch-deploy GitHub Action hydrates the deployment payload with some useful information that can be accessed later on in the deployment process if you need it.

Here is the data that the branch-deploy Action will add to the deployment payload:

```json
{
    "type": "branch-deploy",
    "sha": "<string>",
    "params": "<string>",
    "parsed_params": {},
    "github_run_id": 123,
    "github_run_attempt": 1,
    "pr_number": 42,
    "noop": false,
    "initial_comment_id": 123,
    "initial_reaction_id": 123,
    "deployment_started_comment_id": 123456,
    "timestamp": "2025-01-01T00:00:00.000Z",
    "commit_verified": true,
    "actor": "<string>",
    "stable_branch_used": false
}
```

- `type` - This is the type of deployment that is being created. This will always be `branch-deploy` for the branch-deploy Action.
- `sha` - This is the commit SHA that is being deployed.
- `params` - This is the raw string of parameters that were passed to the branch-deploy Action. You can read more about parameters [here](./parameters.md).
- `parsed_params` - This is the parsed version of the `params` string. This is a JSON object that is created by parsing the `params` string. You can read more about parameters [here](./parameters.md).
- `github_run_id` - This is the ID of the GitHub Action run that created the deployment. This can be useful if you need to access the logs of the deployment.
- `github_run_attempt` - This is the attempt number for the GitHub Actions run that created the deployment.
- `pr_number` - This is the pull request number associated with the deployment.
- `noop` - This is always `false` for a real deployment. Noop operations do not create GitHub Deployments.
- `initial_comment_id` - This is the ID of the initial (trigger) comment that kicked off the branch-deploy Action. Example: `.deploy` would be the comment that triggered the deployment and this would be the ID of that comment.
- `initial_reaction_id` - This is the ID of the initial reaction that was left on the trigger comment by the branch-deploy Action. This is usually a pair of eyes (👀) to indicate that the branch-deploy Action has detected the trigger comment and it is running logic.
- `deployment_started_comment_id` - This is the ID of the comment that the branch-deploy Action leaves below the trigger comment. It usually contains information about the deployment that is about to take place. Example: `Deployment Triggered 🚀... GrantBirki, started a branch deployment to production`
- `timestamp` - This is the timestamp of when the deployment was created from the perspective of the branch-deploy Action.
- `commit_verified` - This is a boolean that indicates whether the commit that is being deployed is verified.
- `actor` - This is the username of the user that triggered the deployment.
- `stable_branch_used` - This is a boolean that indicates whether the stable branch was used for the deployment. This will be `true` if the stable branch was used and `false` if the stable branch was not used.

## Branch-Deploy Status Events

When normal post-deploy completion runs, branch-deploy creates a
`repository_dispatch` event with the type `branch-deploy-status`. This provides
a metadata-only integration point for status and label automation without
turning noop operations into GitHub Deployments.

The dispatch uses this `client_payload` shape:

```json
{
  "schema_version": 1,
  "operation": {
    "pr_number": 42,
    "expected_head_sha": "<string>",
    "transition": "noop",
    "operation_result": "success",
    "github_run_id": 123,
    "github_run_attempt": 1,
    "github_job": "branch-deploy",
    "command_comment_id": 456,
    "status_comment_id": 789
  }
}
```

`transition` is `noop` or `deploy`, and `operation_result` is `success` or
`failure`. The existing deployment-started pull request comment includes the
same operation identity in a hidden `branch-deploy-status` marker so consumers
can validate the exact comment identified by `status_comment_id` and reject
older operations. `status_comment_id` is the same GitHub comment ID exposed by
the action's `initial_comment_id` output. Stable-branch operations do not emit
this pull request status event. Creating a repository dispatch requires
`contents: write` for the token passed to branch-deploy. Setting
`skip_completing: true` skips normal post-deploy completion and therefore does
not emit this event.
