# 🚦 Enforced Deployment Order

## What is Enforced Deployment Order?

Enforced Deployment Order is a feature that allows you to specify a strict sequence in which deployments must occur across different environments. By defining an enforced deployment order, you ensure that deployments to subsequent environments only happen after successful deployments to preceding environments. This helps maintain the integrity and stability of your deployment pipeline by preventing out-of-order deployments that could introduce issues or inconsistencies.

This feature is entirely optional and can be enabled easily should your project or team require it.

If you do not set/enable this feature, deployments will proceed without any enforced order (the default behavior).

## How Does Enforced Deployment Order Work?

When you enable enforced deployment order, you define a specific sequence of environments in which deployments must occur. This sequence is set with the `enforced_deployment_order` input option.

Let's assume you have three environments: `development`, `staging`, and `production`. If you set the `enforced_deployment_order` input to `development,staging,production`, then deployments must occur in the following order: `development` -> `staging` -> `production`. If you were to attempt a `.deploy to production` command without having first deployed to `development` and `staging`, the deployment would fail and tell you why.

The branch-deploy Action determines which environments have been successfully deployed by using GitHub's GraphQL API to query each environment for its _latest_ deployment.

Here is how that process takes place under the hood:

1. A request to the GraphQL API is made to fetch the latest deployment for a given environment and sort it to the most recent one based on its `CREATED_AT` timestamp
2. The `deployment.state` attribute is evaluated to determine if the deployment is currently `ACTIVE` or not. If it is not active, then the deployment has not yet been deployed to that environment. If the deployment is active then we do an extra check to see if the `deployment.commit.oid` matches the current commit SHA that is being requested for deployment. If it is an exact match, then the most recent deployment for that environment is indeed active for the commit we are trying to deploy and it satisfies the enforced deployment order. If it is not an exact match, then we know that the most recent deployment for that environment is not active for the commit we are trying to deploy and it does not satisfy the enforced deployment order.

It should be noted that if a "rollback" style deployment is used (ex: `.deploy main to <environment>`), then all "enforced deployment order" checks are skipped so that a rollback deployment can be performed to any environment at any time.

## Why Use Enforced Deployment Order?

Using enforced deployment order can help maintain the integrity and stability of your deployment pipeline. By ensuring that deployments occur in a specific sequence, you can:

- Prevent issues that may arise from deploying to production before testing in staging.
- Ensure that each environment is properly validated before moving to the next.
- Maintain a clear and predictable deployment process.

## How to Configure

To enable enforced deployment order, set the `enforced_deployment_order` input in your workflow file. The value for `enforced_deployment_order` is a comma-separated string that specifies the order of environments from left to right. Here is an example configuration:

```yaml
- uses: github/branch-deploy@vX.X.X
  id: branch-deploy
  with:
    environment_targets: development,staging,production # <-- these are the defined environments that are available for deployment
    enforced_deployment_order: development,staging,production # <-- here is where the enforced deployment order is set - it is read from left to right
```

## Closing Notes

Using enforced deployment order is entirely optional and may not be necessary for all projects or teams. However, if you find that your deployment pipeline would benefit from a strict sequence of deployments, this feature can help you maintain the integrity and stability of your deployments. It should be noted that requiring a strict deployment order may introduce some overhead, complexity, and friction to your deployment process, so it is important to weigh the benefits against the costs and determine if this feature is right for your project or team.
