# Branch Deploy Usage Guide 📚

This document is a quick guide / cheatsheet for using the `branch-deploy` Action

> This guide assumes default configuration options

## Help 🗨️

To view your available commands, environment targets, and how your workflow is specifically configured, you can run the following command:

`.help`

## Deployment 🚀

Deployments respect your repository's branch protection settings. You can trigger either a regular or noop deployment:

- `.deploy` - Triggers a regular deployment using the default environment (think "Terraform apply" for example)
- `.noop` - Triggers a noop deployment (think "Terraform plan" for example)
- `.deploy <environment>` - Triggers a deployment for the specified environment
- `.noop <environment>` - Triggers a noop deployment for the specified environment
- `.deploy <stable_branch>` - Trigger a rollback deploy to your stable branch (main, master, etc)
- `.noop <stable_branch>` - Trigger a rollback noop to your stable branch (main, master, etc)

## Deployment Locks 🔒

If you need to lock deployments so that only you can trigger them, you can use the following set of commands:

- `.lock` - Locks deployments (sticky) so that only you can trigger them - uses the default environment (usually production)
- `.lock --reason <text>` - Lock deployments with a reason (sticky) - uses the default environment (usually production)
- `.unlock` - Removes the current deployment lock (if one exists) - uses the default environment (usually production)
- `.lock --info` - Displays info about the current deployment lock if one exists - uses the default environment (usually production)
- `.wcid` - An alias for `.lock --info`, it means "where can I deploy" - uses the default environment (usually production)
- `.lock <environment>` - Locks deployments (sticky) so that only you can trigger them - uses the specified environment
- `.lock <environment> --reason <text>` - Lock deployments with a reason (sticky) - uses the specified environment
- `.lock <environment> --info` - Displays info about the current deployment lock if one exists - uses the specified environment
- `.unlock <environment>` - Removes the current deployment lock (if one exists) - uses the specified environment
- `.lock --global` - Locks deployments globally (sticky) so that only you can trigger them - blocks all environments
- `.lock --global --reason <text>` - Lock deployments globally with a reason (sticky) - blocks all environments
- `.unlock --global` - Removes the current global deployment lock (if one exists)
- `.lock --global --info` - Displays info about the current global deployment lock if one exists

> Note: A deployment lock blocks deploys for all environments. **sticky** locks will also persist until someone removes them with `.unlock`

It should be noted that anytime you use a `.lock`, `.unlock`, or `.lock --details` command without an environment, it will use the default environment target. This is usually `production` and can be configured in your branch-deploy workflow definition.

## Deployment Rollbacks 🔙

If something goes wrong and you need to redeploy the main/master/base branch of your repository, you can use the following set of commands:

- `.deploy main` - Rolls back to the `main` branch in production
- `.deploy main to <environment>` - Rolls back to the `main` branch in the specified environment
- `.noop main` - Rolls back to the `main` branch in production as a noop deploy
- `.noop main to <environment>` - Rolls back to the `main` branch in the specified environment as a noop deploy

> Note: The `stable_branch` option can be configured in your branch-deploy workflow definition. By default it is the `main` branch but it can be changed to `master` or any other branch name.

## Environment Targets 🏝️

Environment targets are used to target specific environments for deployments. These are specifically defined in the Actions workflow and could be anything you want. Common examples are `production`, `staging`, `development`, etc.

To view what environments are available in your workflow, you can run the `.help` command.

`.deploy` will always use the default environment target unless you specify one. If you are ever unsure what environment to use, please contact your team member who setup the workflow.

> Note: You can learn more about environment targets [here](https://github.com/github/branch-deploy#environment-targets)

## Deployment Permissions 🔑

In order to run any branch deployment commands, you need the following permissions:

- `write` or `admin` permissions to the repository
- You must either be the owner of the current deployment lock, or there must be no deployment lock

## Example Workflow 📑

An example workflow for using this Action might look like this:

> All commands assume the default environment target of `production`

1. A user creates an awesome new feature for their website
2. The user creates a branch, commits their changes, and pushes the branch to GitHub
3. The user opens a pull request to the `main` branch from their feature branch
4. Once CI is passing and the user has the proper reviews on their pull request, they can continue
5. The user grabs the deployment lock as they need an hour or two for validating their change -> `.lock`
6. The lock is claimed and now only the user who claimed it can deploy
7. The user runs `.noop` to get a preview of their changes
8. All looks good so the user runs `.deploy` and ships their code to production from their branch

    > If anything goes wrong, the user can run `.deploy main` to rollback to the `main` branch

9. After an hour or so, all looks good so they merge their changes to the `main` branch
10. Upon merging, they comment on their merged pull request `.unlock` to remove the lock
11. Done!
