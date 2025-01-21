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
}
```

- `type` - This is the type of deployment that is being created. This will always be `branch-deploy` for the branch-deploy Action.
- `sha` - This is the commit SHA that is being deployed.
- `params` - This is the raw string of parameters that were passed to the branch-deploy Action. You can read more about parameters [here](./parameters.md).
- `parsed_params` - This is the parsed version of the `params` string. This is a JSON object that is created by parsing the `params` string. You can read more about parameters [here](./parameters.md).
- `github_run_id` - This is the ID of the GitHub Action run that created the deployment. This can be useful if you need to access the logs of the deployment.
