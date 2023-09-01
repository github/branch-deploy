# Hubot Style Deployment Locks 🔒

> Wait, what is [hubot](https://hubot.github.com/)? - Hubot is GitHub's chatop friend. It has `.deploy` functionality that is extremely similar to this Action.

By default, if you run a `.deploy` command, it creates a [non-sticky lock](./locks.md#deployment-locks) that is released as soon as the deployment finishes. This is fine for smaller projects, but if you have dozens or even hundreds of PRs open at the same time (from different people) there is a good chance when your deploy finishes, someone else will run `.deploy` and wipe out your changes.

By using _Hubot Style Deployment Locks_, AKA _Sticky Deployment Locks_, you can ensure that your deployment will not be wiped out by another deployment since the deployment itself will claim the lock.

You read that last bit correctly 😉, the largest difference you will notice when using this setting is that all deployments (`.noop` and `.deploy`) will claim persistent (sticky) locks when they are invoked. This is helpful as you have to run one less command if your usual workflow is `.lock` then `.deploy`.

This behavior is not enabled out of the box and you need to enable it in your Actions configuration with `sticky_locks: "true"`. The reasoning for this is that you should also configure the ["unlock on merge" mode workflow](https://github.com/github/branch-deploy/blob/14df40eb0fb10d9553d5f16646a281348fb47ac4/docs/unlock-on-merge.md) to take full advantage of automatically releasing locks on PR merge.
