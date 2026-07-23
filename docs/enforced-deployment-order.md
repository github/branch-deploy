# 🚦 Enforced Deployment Order

## What is Enforced Deployment Order?

Enforced Deployment Order is a feature that allows you to specify a strict sequence in which deployments must occur across different environments. By defining an enforced deployment order, you ensure that deployments to subsequent environments only happen after successful deployments to preceding environments. This helps maintain the integrity and stability of your deployment pipeline by preventing out-of-order deployments that could introduce issues or inconsistencies.

This feature is entirely optional and can be enabled easily should your project or team require it.

If you do not set/enable this feature, deployments will proceed without any enforced order (the default behavior).

## How Does Enforced Deployment Order Work?

When you enable enforced deployment order, you define a specific sequence of environments in which deployments must occur. This sequence is set with the `enforced_deployment_order` input option.

Let's assume you have three environments: `development`, `staging`, and `production`. If you set the `enforced_deployment_order` input to `development,staging,production`, then deployments must occur in the following order: `development` -> `staging` -> `production`. If you were to attempt a `.deploy to production` command without having first deployed to `development` and `staging`, the deployment would fail and tell you why.

The branch-deploy Action determines which environments have been successfully deployed by using GitHub's GraphQL API to query each environment for its newest deployment.

Here is how that process takes place under the hood:

1. A request to the GraphQL API fetches the newest deployment for each preceding environment, ordered by its `CREATED_AT` timestamp.
2. That newest deployment must be `ACTIVE` and its `deployment.commit.oid` must exactly match the commit SHA requested for deployment. A newer failed, pending, inactive, or different-SHA deployment is authoritative; an older active deployment cannot satisfy the order.

The configured order must not contain duplicate environments, and every requested environment must appear in the order. Branch Deploy rejects invalid order configuration instead of silently skipping or repeating checks.

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
