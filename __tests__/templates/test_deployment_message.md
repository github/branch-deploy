### Deployment Results {{ ":rocket:" if status === "success" else ":cry:" }}

The following variables are available to use in this template:

- `environment` - The name of the environment (String)
- `environment_url` - The URL of the environment (String) {Optional}
- `status` - The status of the deployment (String) - `success`, `failure`, or `unknown`
- `noop` - Whether or not the deployment is a noop (Boolean)
- `ref` - The ref of the deployment (String)
- `actor` - The GitHub username of the actor who triggered the deployment (String)

Here is an example:

{{ actor }} deployed branch `{{ ref }}` to the **{{ environment }}** environment. This deployment was a {{ status }} {{ ":rocket:" if status === "success" else ":cry:" }}.

{% if environment_url %}You can view the deployment [here]({{ environment_url }}).{% endif %}

{% if noop %}This was a noop deployment.{% endif %}
