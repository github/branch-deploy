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
- `initial_comment_id` - This is the ID of the initial (trigger) comment that kicked off the branch-deploy Action. Example: `.deploy` would be the comment that triggered the deployment and this would be the ID of that comment.
- `initial_reaction_id` - This is the ID of the initial reaction that was left on the trigger comment by the branch-deploy Action. This is usually a pair of eyes (👀) to indicate that the branch-deploy Action has detected the trigger comment and it is running logic.
- `deployment_started_comment_id` - This is the ID of the comment that the branch-deploy Action leaves below the trigger comment. It usually contains information about the deployment that is about to take place. Example: `Deployment Triggered 🚀... GrantBirki, started a branch deployment to production`
- `timestamp` - This is the timestamp of when the deployment was created from the perspective of the branch-deploy Action.
- `commit_verified` - This is a boolean that indicates whether the commit that is being deployed is verified.
- `actor` - This is the username of the user that triggered the deployment.
- `stable_branch_used` - This is a boolean that indicates whether the stable branch was used for the deployment. This will be `true` if the stable branch was used and `false` if the stable branch was not used.
