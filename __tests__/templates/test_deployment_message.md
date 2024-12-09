### Deployment Results {{ ":rocket:" if status === "success" else ":cry:" }}

The following variables are available to use in this template:

- `environment` - The name of the environment (String)
- `environment_url` - The URL of the environment (String) {Optional}
- `status` - The status of the deployment (String) - `success`, `failure`, or `unknown`
- `noop` - Whether or not the deployment is a noop (Boolean)
- `ref` - The ref of the deployment (String)
- `sha` - The exact commit SHA of the deployment (String)
- `actor` - The GitHub username of the actor who triggered the deployment (String)
- `approved_reviews_count` - The number of approved reviews on the pull request at the time of deployment (String of a number)
- `deployment_id` - The ID of the deployment (String)
- `review_decision` - The decision of the review (String or null) - `"APPROVED"`, `"REVIEW_REQUIRED"`, `null`, etc.
- `params` - The raw parameters provided in the deploy command (String)
- `parsed_params` - The parsed parameters provided in the deploy command (String)
- `deployment_end_time` - The end time of the deployment - this value is not _exact_ but it is very close (String)
- `logs` - The url to the logs of the deployment (String)
- `commit_verified` - Whether or not the commit was verified (Boolean)

Here is an example:

{{ actor }} deployed branch `{{ ref }}` to the **{{ environment }}** environment. This deployment was a {{ status }} {{ ":rocket:" if status === "success" else ":cry:" }}.

The exact commit sha that was used for the deployment was `{{ sha }}`.

The exact deployment ID for this deployment was `{{ deployment_id }}`.

The review decision for this deployment was `{{ review_decision }}`.

The deployment had the following parameters provided in the deploy command: `{{ params }}`

The deployment had the following "parsed" parameters provided in the deploy command: `{{ parsed_params | safe }}`

The deployment process ended at `{{ deployment_end_time }}`.

Here are the deployment logs: {{ logs }}

{% if commit_verified %}The commit was verified.{% else %}The commit was not verified.{% endif %}

{% if environment_url %}You can view the deployment [here]({{ environment_url }}).{% endif %}

{% if noop %}This was a noop deployment.{% endif %}

> This deployment had `{{ approved_reviews_count }}` approvals.
