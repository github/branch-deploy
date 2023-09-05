# Hubot Style Deployment Locks 🔒

> Wait, what is [hubot](https://hubot.github.com/)? - Hubot is GitHub's chatop friend. It has `.deploy` functionality that is extremely similar to this Action.

By default, if you run a `.deploy` command, it creates a [non-sticky lock](./locks.md#deployment-locks) that is released as soon as the deployment finishes. This is fine for smaller projects, but if you have dozens or even hundreds of PRs open at the same time (from different people) there is a good chance when your deploy finishes, someone else will run `.deploy` and wipe out your changes.

By using _Hubot Style Deployment Locks_, AKA _Sticky Deployment Locks_, you can ensure that your deployment will not be wiped out by another deployment since the deployment itself will claim the lock.

You read that last bit correctly 😉, the largest difference you will notice when using this setting is that all deployments (`.noop` and `.deploy`) will claim persistent (sticky) locks when they are invoked. This is helpful as you have to run one less command if your usual workflow is `.lock` then `.deploy`.

This behavior is not enabled out of the box and you need to enable it in your Actions configuration with `sticky_locks: "true"`. The reasoning for this is that you should also configure the ["unlock on merge" mode workflow](./unlock-on-merge.md) to take full advantage of automatically releasing locks on PR merge. This extra workflow is really quite beneficial as you no longer need to worry about cleaning up locks after a PR is merged. As soon as you merge your PR where you were running deployments from, that PR is considered "done" and the lock is released.

You can still release locks manually with `.unlock` at any time and so can other users. This is helpful if you need to release a lock that is blocking a deployment from another PR or if you were just testing changes and want to release the lock.

It should be noted that if you want this logic to **also apply to noop deployments** you need to enable another input option called `sticky_locks_for_noop` and also set its value to `"true"`. By default, noop deployments will not claim sticky locks as this often just leads to locks being left behind and never cleaned up.

## Examples

Enabling sticky deployment locks for `.deploy` commands:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: github/branch-deploy@vX.X.X
    with:
      sticky_locks: "true" # <--- enables sticky deployment lock / hubot style deployment locks
      # ... other configuration
```

Enabling sticky deployment locks for `.deploy` and `.noop` commands:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: github/branch-deploy@vX.X.X
    with:
      sticky_locks: "true" # <--- enables sticky deployment lock / hubot style deployment locks
      sticky_locks_for_noop: "true" # <--- enables sticky deployment lock / hubot style deployment locks for noop deployments
      # ... other configuration
```
