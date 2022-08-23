# Branch Deploy Usage Guide 📚

This document is a quick guide / cheatsheet for using the `branch-deploy` Action

> This guide assumes default configuration options

## Deployment 🚀

Deployments respect your repository's branch protection settings. You can trigger either a regular or noop deployment:

- `.deploy` - Triggers a regular deployment using the default environment (think "Terraform apply" for example)
- `.deploy noop` - Triggers a noop deployment (think "Terraform plan" for example)
- `.deploy <environment>` - Triggers a deployment for the specified environment
- `.deploy noop <environment>` - Triggers a noop deployment for the specified environment

## Deployment Locks 🔒

If you need to lock deployments so that only you can trigger them, you can use the following set of commands:

- `.lock` - Locks deployments (sticky) so that only you can trigger them
- `.lock --reason <text>` - Lock deployments with a reason
- `.unlock` - Removes the current deployment lock (if one exists)
- `.lock --info` - Displays info about the current deployment lock if one exists
- `.wcid` - An alias for `.lock --info`, it means "where can I deploy"

## Deployment Permissions 🔑

In order to run any branch deployment commands, you need the following permissions:

- `write` or `admin` permissions to the repository
- You must either be the owner of the current deployment lock, or there must be no deployment lock

## Example Workflow 📑

An example workflow for using this Action might look like this:

1. A user creates an awesome new feature for their website
2. The user creates a branch, commits their changes, and pushes the branch to GitHub
3. The user opens a pull request to the `main` branch from their feature branch
4. Once CI is passing and the user has the proper reviews on their pull request, they can continue
5. The user grabs the deployment lock as they need an hour or two for validating their change -> `.lock`
6. The lock is claimed and now only the user who claimed it can deploy
7. The user runs `.deploy noop` to get a preview of their changes
8. All looks good so the user runs `.deploy` and ships their code to production from their branch
9. After an hour or so, all looks good so they merge their changes to the `main` branch
10. Upon merging, they comment on their merged pull request `.unlock` to remove the lock
11. Done!
