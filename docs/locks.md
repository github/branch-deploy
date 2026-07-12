# Deployment Locks and Actions Concurrency 🔓

> Only run one deployment at a time

There are multiple ways to leverage this action for deployment locks! Let's take a look at each option

## Deployment Locks

The suggested way to go about deployment locking is to use the built in locking feature in this Action!

Just like how you can comment `.deploy` on a pull request to trigger a deployment, you can also comment `.lock` to lock deployments. This will prevent other users from triggering a deployment. The lock is associated with your GitHub handle, so you will be able to deploy any pull request in the repository and as many times as you want. Any other user who attempts a deployment while your lock is active will get a comment on their PR telling them that a lock is in effect.

To release the deployment lock, simply comment `.unlock` on any pull request in the repository at anytime. Please be aware that other users can run this same command to remove the lock (in case you get offline and forget to do so 😉)

These deployment locks come in two flavors:

- `sticky`
- `non-sticky`

**sticky** locks are locks that persist until you remove them. As seen in the example above, the `.lock` command creates a **sticky** lock that will persist until someone runs `.unlock`

**non-sticky** locks are temporary locks that only exist during a deployment. This action will automatically create a **non-sticky** lock for you when you run `.deploy`. It does this to prevent another user from running `.deploy` in another pull request and creating a deployment conflict

Deployment locks in relation to environments also come in two flavors:

- environment specific
- global

**environment specific** locks are locks that are associated with a specific environment. This means that if you have two environments, `staging` and `production`, you can have a lock on `staging` and another lock on `production` at the same time. These locks are independent of each other and will not prevent you from deploying to the other environment if another user has a lock in effect.

**global** locks are locks that are associated with the entire project/repository. This means that if you have two environments, `staging` and `production`, you can have a lock on the entire repository and prevent any deployments to either environment.

### Deployment Lock Core Concepts

Let's review the core concepts of deployment locks in a short summary:

- Deployment locks are used to prevent multiple deployments from running at the same time and breaking things
- Non-sticky locks are created automatically when running `.deploy` or `.noop`
- Sticky locks are created manually by commenting `.lock` on a pull request - They will persist until you remove them with `.unlock`
- Locks are associated to a user's GitHub handle - This user can deploy any pull request in the repository and as many times as they want
- Any user can remove a lock by commenting `.unlock` on any pull request in the repository
- Details about a lock can be viewed with `.lock --details`
- Locks can either be environment specific or global
- Like all the features of this Action, users need `write` permissions or higher to use a command

### How do Deployment Locks Work?

This Action uses GitHub branches to create a deployment lock. When you run `.lock` the following happens:

1. The Action checks to see if a global lock already exists, if it doesn't it will then check to see if an environment specific lock exists
2. If a lock does not exists it begins to create one for you
3. The Action prepares a commit containing a complete `lock.json` file with metadata about the lock
4. The Action publishes a new branch called `<environment|global>-branch-deploy-lock` at that commit
5. New v12 lock files include `schema_version: 1` and a deterministic `claim_id`; older lock files without those fields remain supported

Publishing the completed lock commit as a new ref is the atomic claim. If another request wins that ref-creation race, Branch Deploy reads the winning lock and reports whether the retry owns the same claim or conflicts with another owner. Retrying the same claim is idempotent and does not rewrite the lock or duplicate the lock-acquired comment. A lock branch without a readable `lock.json` is treated as ambiguous and blocking rather than being overwritten.

Now when new deployments are run, they will check if a lock exists. If it does and it doesn't belong to you, your deployment is rejected. If the lock does belong to you, then the deployment will continue.

Normal post processing removes the non-sticky lock used by a completed deploy or noop on both success and failure, including when the applicable lock is global. If another authorized process already removed that non-sticky lock, completion continues without falsely reporting a cleanup failure. Sticky locks remain until an explicit unlock or an unlock-on-merge workflow removes them.

### Deployment Lock Examples 📸

Here are a few examples of deployment locks in action!

Lock Example:

![lock](https://user-images.githubusercontent.com/23362539/224514302-f26c9142-6b80-4007-a7b4-1d4236f472f3.png)

Unlock Example:

![unlock](https://user-images.githubusercontent.com/23362539/224514330-c9951a9e-a571-4f16-bdd5-2f636185ad5a.png)

Locking a specific environment (not just the default one):

![lock-development](https://user-images.githubusercontent.com/23362539/224514369-51956c50-1ea5-4287-a8f5-772daf9931a1.png)

Obtaining the lock details for development:

![development-lock-details](https://user-images.githubusercontent.com/23362539/224514399-63fdbab1-6d49-4d02-8ac7-935fcb10cde5.png)

Remove the lock for development:

![remove-development-lock](https://user-images.githubusercontent.com/23362539/224514423-81d31af4-9243-42dc-8052-8c3436b28760.png)

Creating a global deploy lock:

![global-deploy-lock](https://user-images.githubusercontent.com/23362539/224514460-79dcd943-0b23-42b7-928f-a25b036a0c45.png)

Removing the global deploy lock:

![remove-global-deploy-lock](https://user-images.githubusercontent.com/23362539/224514485-e60605fd-0918-466e-9aab-7597fa32e7d9.png)

## Disabling Locks

Some workflows do not need deployment locking. Mobile pipelines that upload independently versioned artifacts to TestFlight or the Google Play Store are one example: concurrent uploads can be safe because one upload does not replace or mutate the other.

Set `disable_lock: true` only after confirming that concurrent deployments cannot conflict and that any shared infrastructure or remote state has its own serialization policy:

```yaml
- uses: github/branch-deploy@v12
  with:
    disable_lock: true
```

When `disable_lock` is enabled for the normal IssueOps deployment workflow:

- `.deploy` and `.noop` skip environment and global lock inspection and acquisition.
- Post processing skips lock inspection and release while continuing to update deployment statuses, comments, reactions, and labels.
- `.lock`, `.unlock`, `.wcid`, and lock-detail commands return an informational result with the `locking_disabled` reason code and do not read or modify lock state.
- Existing environment and global lock branches are ignored and left unchanged.

Because existing locks are ignored, enabling this input in a workflow where concurrent deployments can mutate the same service, environment, or state can cause overlapping deployments. Branch Deploy locks and GitHub Actions concurrency solve different coordination problems; disabling one does not automatically provide the other.

If a lock branch already exists when you enable `disable_lock`, remove it before enabling the input or temporarily run an authorized workflow with `disable_lock: false` to use the normal unlock command. The disabled workflow intentionally cannot remove it.

> [!NOTE]
> If you want deployment locks to persist rather than be released automatically, use [hubot-style sticky locks](./hubot-style-deployment-locks.md) instead of disabling locks.

## Actions Concurrency

> Branch Deploy locks and GitHub Actions concurrency solve different coordination problems. Locks control IssueOps deployment ownership, while concurrency serializes workflow jobs. Workflows that mutate the same service, environment, infrastructure, or remote state often need both.

Use the native GitHub Actions concurrency feature ([documentation](https://docs.github.com/en/actions/using-jobs/using-concurrency)) when overlapping jobs could mutate the same shared target even if they are authorized by the same Branch Deploy lock.

For deployment work, preserve the running job and queue later jobs in the same shared group instead of canceling an in-progress mutation:

```yaml
concurrency:
  group: production
  cancel-in-progress: false
  queue: max
```

Use the same group across every workflow that touches the shared target. Support-only commands such as `.help`, `.lock`, `.unlock`, and `.wcid` can use a unique per-run group or no concurrency group so they remain responsive.

## Need More Deployment Lock Control?

If you need more control over when, how, and why deployment locks are set, you can use the [github/lock](https://github.com/github/lock) Action!

This Action allows you to set a lock via an issue comment, custom condition, on merges, etc. You have full control over when and how the lock is set and removed!
