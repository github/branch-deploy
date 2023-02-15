# Branch Deploy Action 🚀

[![CodeQL](https://github.com/github/branch-deploy/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/github/branch-deploy/actions/workflows/codeql-analysis.yml) [![test](https://github.com/github/branch-deploy/actions/workflows/test.yml/badge.svg)](https://github.com/github/branch-deploy/actions/workflows/test.yml) [![package-check](https://github.com/github/branch-deploy/actions/workflows/package-check.yml/badge.svg)](https://github.com/github/branch-deploy/actions/workflows/package-check.yml) [![coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action to enable branch deployments using IssueOps!

This Action does the heavy lifting for you to enable branch deployments:

- 🔍 Detects when IssueOps commands are used on a pull request
- ✏️ Configurable - Choose your command syntax, environment, noop trigger, base branch, reaction, and more
- ✔️ Respects your branch protection settings configured for the repo
- 🗨️ Comments and reacts to your IssueOps commands
- 🚀 Triggers GitHub deployments for you with simple configuration
- 🔓 Deploy locks to prevent multiple deployments from clashing

## Available Commands 💬

- `.deploy` - Deploy a pull request
- `.deploy noop` - Deploy a pull request in noop mode
- `.deploy to <environment>` - Deploy a pull request to a specific environment
- `.deploy <stable_branch>` - Trigger a rollback deploy to your stable branch (main, master, etc)
- `.lock` - Create a deployment lock
- `.lock --reason <text>` - Create a deployment lock with a custom reason
- `.lock --details` - View details about a deployment lock
- `.unlock` - Remove a deployment lock

> These commands are all fully customizable and are just an example using this Action's defaults

Alternate command syntax and shortcuts can be found at the bottom of this readme [here](#alternate-command-syntax)

## Demo 🎥

A video demo showing how IssueOps on a pull request works using this Action

https://user-images.githubusercontent.com/23362539/166625510-50a80738-a7a2-486d-9d74-8dda5b95ec8d.mp4

> View the pull request that created this demo [here](https://github.com/github/branch-deploy/pull/17)

## Turbo Quickstart ⚡

A quick section to get you started with this Action

### Usage 📝

Basic usage assuming all defaults:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: github/branch-deploy@vX.X.X
```

Advanced usage with custom configuration:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: github/branch-deploy@vX.X.X
  with:
    trigger: ".deploy"
    reaction: "eyes"
    environment: "production"
    noop_trigger: "noop"
    stable_branch: "main"
    prefix_only: "true"
```

### Example 📚

Check out a super simple workflow example using this Action to quickly get up and running with branch deployments

```yaml
name: "branch deploy demo"

# The workflow to execute on is comments that are newly created
on:
  issue_comment:
    types: [created]

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read

jobs:
  demo:
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest
    steps:
      # Execute IssueOps branch deployment logic, hooray!
      # This will be used to "gate" all future steps below and conditionally trigger steps/deployments
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy
        with:
          trigger: ".deploy"

      # Run your deployment logic for your project here - examples seen below

      # Checkout your projects repository based on the ref provided by the branch-deploy step
      - uses: actions/checkout@3.0.2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

      # Do some fake "noop" deployment logic here
      # conditionally run a noop deployment
      - name: fake noop deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' }}
        run: echo "I am doing a fake noop deploy"

      # Do some fake "regular" deployment logic here
      # conditionally run a regular deployment
      - name: fake regular deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        run: echo "I am doing a fake regular deploy"
```

> Keep reading to learn more about this Action! Even further details about how this Action works can be found below as well

You can check out further examples by checking out our [examples](docs/examples.md) documentation

## About 💡

Before we get into details, let's first define a few key terms below:

- **IssueOps** - Its like ChatOps but instead of using a chat bot, commands are invoked by commenting on a pull request (PRs are issues under the hood) - Example: commenting `.deploy` on a pull request
- **Branch Deployment** - A branch deploy is a deployment methodology that enables you to deploy a branch (or pull request) to a desired environment before merging to `main` or `master` - More on this below
- **PR** - Short for pull request

### IssueOps 🗨️

The best way to define IssueOps is to compare it to something similar, ChatOps. You may be familiar with the concept ChatOps already but in case you aren't here is a quick definition below:

> ChatOps is the process of interacting with a chat bot to execute commands directly in a chat platform. For example, with ChatOps you might do something like `.ping example.org` to check the status of a website

IssueOps adopts the same mindset but through a different medium. Rather than using a chat service to invoke the commands we use comments on a GitHub Issue or Pull Request. GitHub Actions is the runtime which executes our desired logic

### Branch Deployments 🌲

Branch deployments are a battle tested way of deploying your changes to a given environment for a variety of reasons. Branch deployments allow you to do the following:

- Deploy your changes to production **before** merging
- Deploy changes to a staging, QA, or non-production environment

#### Branch Deployment Core Concepts ⭐

> Note: The `main` branch is considered the base repository branch for all examples below

- The `main` branch is always considered to be a stable and deployable branch
- All changes are deployed to production before they are merged to the `main` branch
- To roll back a branch deployment, you deploy the `main` branch
- `noop` deployments should not make changes but rather report what they "would" have done

#### Why use branch deployments?

> To put the *merge -> deploy* model in the past!

What if your changes are bad and you broke production with the *merge -> deploy* model? Well now you have to revert your PR, get passing CI/builds, and then re-merge your changes to get back to a stable environment. With the **branch deploy** model, this is almost never the case. The `main` branch is considered to be always safe and stable

## How does it work? 📚

> This section will go into detail about how this Action works and hopefully inspire you on ways you can leverage it in your own projects

Let's walk through a GitHub Action workflow using this Action line by line:

```yaml
# The name of the workflow, it can be anything you wish
name: "branch deploy demo"

# The workflow to execute on is comments that are newly created
on:
  issue_comment:
    types: [created]
```

It is important to note that the workflow we want to run IssueOps on is `issue_comment` and `created`. This means we will not run under any other contexts for this workflow. You can edit this as you wish but it does change how this model ultimately works. For example, `issue_comment` workflows **only** use files found on `main` to run. If you do something like `on: pull_request` you could open yourself up to issues as a user could alter a file in a PR and exfil your secrets for example. Only using `issue_comment` is the suggested workflow type

```yaml
# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write # Required for commenting on PRs
  deployments: write # Required for updating deployment statuses
  contents: write # Required for reading/writing the lock file
  checks: read # Required for checking if the CI checks have passed in order to deploy the PR
```

These are the minimum permissions you need to run this Action

```yaml
jobs:
  demo:
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest
    steps:
      # Checkout your projects repository
      - uses: actions/checkout@3.0.2
```

Sets up your `demo` job, uses an ubuntu runner, and checks out your repo - Just some standard setup for a general Action. We also add an `if:` statement here to only run this workflow on pull request comments to make it a little cleaner

> Note: The Action will check the context for us anyways but this can save us a bit of CI time by using the `if:` condition

```yaml
      # Execute IssueOps branch deployment logic, hooray!
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy
        with:
          trigger: ".deploy"
```

> Note: It is important to set an `id:` for this job so we can reference its outputs in subsequent steps

The core of this Action takes place here. This block of code will trigger the branch deploy action to run. It will do the following:

1. Check the comment which invoked the workflow for the `trigger:` phrase (`.deploy`) defined here
1. If the trigger phrase is found, it will proceed with a deployment
1. It will start by reacting to your message to let you know it is running
1. The Action will post a comment with a link to the running Actions workflow for you to follow its progress
1. A deployment will be started and attached to your pull request - You'll get a nice little yellow rocket which tells you a deployment is in progress
1. Outputs will be exported by this job for later reference in other jobs as well

```yaml
      # Do some fake "noop" deployment logic here
      # conditionally run a noop deployment
      - name: fake noop deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' }}
        run: echo "I am doing a fake noop deploy"

      # Do some fake "regular" deployment logic here
      # conditionally run a regular deployment
      - name: fake regular deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        run: echo "I am doing a fake regular deploy"
```

As seen above, we have two steps. One for a noop deploy, and one for a regular deploy. For example, the noop deploy could trigger a `terraform plan` and the regular deploy could be a `terraform apply`. These steps are conditionally gated by two variables:

- `steps.branch-deploy.outputs.continue == 'true'` - The `continue` variable is only set to true when a deployment should continue
- `steps.branch-deploy.outputs.noop == 'true'` - The `noop` variable is only set to true when a noop deployment should be run

> Example: You comment `.deploy noop` on a pull request. A noop deployment is detected so this action outputs the `noop` variable to `true`. You also have the correct permissions to execute the IssueOps command so the action also outputs the `continue` variable to `true`. This will allow the "fake noop deploy" step seen above to run and the "fake regular deploy" step will be skipped

## Inputs 📥

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| github_token | yes | ${{ github.token }} | The GitHub token used to create an authenticated client - Provided for you by default! |
| status | yes | ${{ job.status }} | The status of the GitHub Actions - For use in the post run workflow - Provided for you by default! |
| reaction | no | eyes | If set, the specified emoji "reaction" is put on the comment to indicate that the trigger was detected. For example, "rocket" or "eyes" |
| trigger | no | .deploy | The string to look for in comments as an IssueOps trigger. Example: ".deploy" |
| noop_trigger | no | noop | The string to look for in comments as an IssueOps noop trigger. Example: "noop" - The usage would then be ".deploy noop" |
| lock_trigger | no | .lock | The string to look for in comments as an IssueOps lock trigger. Used for locking branch deployments on a specific branch. Example: ".lock" |
| unlock_trigger | no | .unlock | The string to look for in comments as an IssueOps unlock trigger. Used for unlocking branch deployments. Example: ".unlock" |
| help_trigger | no | .help | The string to look for in comments as an IssueOps help trigger. Example: ".help" |
| lock_info_alias | no | .wcid | An alias or shortcut to get details about the current lock (if it exists) Example: ".info" - Hubbers will find the ".wcid" default helpful ("where can I deploy") |
| environment | no | production | The name of the default environment to deploy to. Example: by default, if you type `.deploy`, it will assume "production" as the default environment |
| environment_targets | no | production,development,staging | Optional (or additional) target environments to select for use with deployments. Example, "production,development,staging". Example  usage: `.deploy to development`, `.deploy to production`, `.deploy to staging` |
| production_environment | no | production | The name of the production environment. Example: "production". By default, GitHub will set the "production_environment" to "true" if the environment name is "production". This option allows you to override that behavior so you can use "prod", "prd", "main", etc. as your production environment name. |
| stable_branch | no | main | The name of a stable branch to deploy to (rollbacks). Example: "main" |
| prefix_only | no | true | If "false", the trigger can match anywhere in the comment |
| update_branch | no | warn | Determine how you want this Action to handle "out-of-date" branches. Available options: "disabled", "warn", "force". "disabled" means that the Action will not care if a branch is out-of-date. "warn" means that the Action will warn the user that a branch is out-of-date and exit without deploying. "force" means that the Action will force update the branch. Note: The "force" option is not recommended due to Actions not being able to re-run CI on commits originating from Actions itself |
| required_contexts | no | false | Manually enforce commit status checks before a deployment can continue. Only use this option if you wish to manually override the settings you have configured for your branch protection settings for your GitHub repository. Default is "false" - Example value: "context1,context2,context3" - In most cases you will not need to touch this option |
| skip_ci | no | "" | A comma seperated list of environments that will not use passing CI as a requirement for deployment. Use this option to explicitly bypass branch protection settings for a certain environment in your repository. Default is an empty string `""` - Example: `"development,staging"` |
| skip_reviews | no | "" | A comma seperated list of environment that will not use reviews/approvals as a requirement for deployment. Use this options to explicitly bypass branch protection settings for a certain environment in your repository. Default is an empty string `""` - Example: `"development,staging"` |
| allow_forks | no | true | Allow branch deployments to run on repository forks. If you want to harden your workflows, this option can be set to false. Default is "true" |
| admins | no | false | A comma seperated list of GitHub usernames or teams that should be considered admins by this Action. Admins can deploy pull requests without the need for branch protection approvals. Example: "monalisa,octocat,my-org/my-team" |
| admins_pat | no | false | A GitHub personal access token with "read:org" scopes. This is only needed if you are using the "admins" option with a GitHub org team. For example: "my-org/my-team" |
| merge_deploy_mode | no | false | Advanced configuration option for operations on merge commits. See the [merge commit docs](#merge-commit-workflow-strategy) below |

## Outputs 📤

| Output | Description |
| ------ | ----------- |
| triggered | The string "true" if the trigger was found, otherwise the string "false" |
| comment_body | The comment body |
| environment | The environment that has been selected for a deployment |
| noop | The string "true" if the noop trigger was found, otherwise the string "false" - Use this to conditionally control whether your deployment runs as a noop or not |
| ref | The ref (branch or sha) to use with deployment |
| comment_id | The comment id which triggered this deployment |
| deployment_id | The ID of the deployment created by running this action |
| type | The type of trigger that was detected (examples: deploy, lock, unlock) |
| continue | The string "true" if the deployment should continue, otherwise empty - Use this to conditionally control if your deployment should proceed or not - ⭐ The main output you should watch for when determining if a deployment shall carry on |
| fork | The string "true" if the pull request is a fork, otherwise "false" |
| fork_ref | The true ref of the fork |
| fork_label | The API label field returned for the fork |
| fork_checkout | The console command presented in the GitHub UI to checkout a given fork locally |
| fork_full_name | The full name of the fork in "org/repo" format |

## Custom Deployment Messages ✏️

> This is useful to display to the user the status of your deployment. For example, you could display the results of a `terraform apply` in the deployment comment

You can use the GitHub Actions environment to export custom deployment messages from your workflow to be referenced in the post run workflow for the `branch-deploy` Action that comments results back to your PR

Simply set the environment variable `DEPLOY_MESSAGE` to the message you want to be displayed in the post run workflow

Bash Example:

```bash
echo "DEPLOY_MESSAGE=<message>" >> $GITHUB_ENV
```

Actions Workflow Example:

```yaml
# Do some fake "noop" deployment logic here
- name: fake noop deploy
  if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' }}
  run: |
    echo "DEPLOY_MESSAGE=I would have **updated** 1 server" >> $GITHUB_ENV
    echo "I am doing a fake noop deploy"
```

### Additional Custom Message Examples 📚

#### Adding newlines to your message

```bash
echo "DEPLOY_MESSAGE=NOOP Result:\nI would have **updated** 1 server" >> $GITHUB_ENV
```

#### Multi-line strings ([reference](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#example-2))

```bash
echo 'DEPLOY_MESSAGE<<EOF' >> $GITHUB_ENV
echo "$SOME_MULTI_LINE_STRING_HERE" >> $GITHUB_ENV
echo 'EOF' >> $GITHUB_ENV
```

> Where `$SOME_MULTI_LINE_STRING_HERE` is a bash variable containing a multi-line string

#### Adding a code block to your message

```bash
echo "DEPLOY_MESSAGE=\`\`\`yaml\nname: value\n\`\`\`" >> $GITHUB_ENV
```

### How does this work? 🤔

To add custom messages to our final deployment message we need to use the GitHub Actions environment. This is so that we can dynamically pass data into the post action workflow that leaves a comment on our PR. The post action workflow will look to see if this environment variable is set (`DEPLOY_MESSAGE`). If the variable is set, it adds to to the PR comment. Otherwise, it will use a simple comment body that doesn't include the custom message.

## About Environments 🌎

> If you are using environment rather than repo secrets, this section will be of interest to you

For those familiar with GitHub Actions, you have probably used environments before to store secrets and trigger deployments. The syntax for doing so is very simple and usually looks like this:

```yaml
jobs:
  deploy:
    environment: production # right here we use an environment
    runs-on: ubuntu-latest
    steps:
      - name: deployment
        run: terraform apply -auto-approve
```

However, this has a few limitations:

- When workflows finish, so does the deployment to that environment - This means that the little green rocket doesn't "stick" to your pull request
- It is tricky to tune in environment protection rules with a single environment when using IssueOps + branch-deployments

To get around these limitations with this branch-deploy action and IssueOps, we can use two different environments. One to store our environement secrets and another to use in our branch deployments.

> Yes this isn't the most elegant solution, but it works and is very easy to accomplish

Here is a proper example for using two environments with this action:

```yaml
jobs:
  deploy:
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    environment: production-secrets # custom environment for storing secrets
    runs-on: ubuntu-latest
    steps:
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy
        with:
          trigger: ".deploy"
          environment: production # the environment for the actual deployment

      # Your deployment steps go here...
```

This allows you to achieve the following:

- Fine grained control over your environment secrets in the `production-secrets` environment
- A "sticky" green rocket to your PR that doesn't disappear when the workflow finishes
- Access to all the environment secrets stored in the `production-secrets` environment

### Environment Targets

With this Action, you can also choose the environment you wish to deploy to. This is useful if you have multiple environments and want to deploy to a specific environment.

This can be achieved with the `environment_targets` input

With this option, you can specify a comma separated list of environments that you can deploy to besides just the default with `.deploy`

The defaults that are used are: `production,development,staging`. However, you can configure this to be whatever you like!

To use a deployment with a specific environment, you would invoke your commands like so:

- `.deploy production`
- `.deploy to production`
- `.deploy to <environment>`

This also works with noop commands as well

- `.deploy noop production`
- `.deploy noop to production`
- `.deploy noop to <environment>`

YAML input example:

```yaml
- uses: github/branch-deploy@vX.X.X
  id: branch-deploy
  with:
    trigger: ".deploy"
    environment: production # the default environment
    environment_targets: "production,development,staging" # the environments that you can deploy to with explicit commands
```

## Rollbacks 🔄

This Action supports rollback deployments out of the box. This is useful when you run a branch deployment (`.deploy`) and something goes wrong and you need to rollback to a previous known working state.

This can be achieved by using the `.deploy <stable_branch>` command

> See the [inputs](#inputs-) section above for more information on how to configure the stable branch

The `<stable_branch>` can be any branch you like but it is highly recommended that you use a branch that is protected and only has stable code in it. An example would be using `main` or `master` as your stable branch and enforcing strict branch protection rules on it to ensure that only stable code is merged into it

## Security 🔒

The IssueOps + branch-deploy model is significantly more secure than a traditional "deploy on merge" or "run on commit" model. Let's reference the workflow trigger that the branch-deploy model uses:

```yaml
on:
  issue_comment:
    types: [created]
```

Unlike the `on: pull_request` trigger, the `on: issue_comment` trigger only uses Actions workflow files from the default branch in GitHub. This means that a bad actor cannot open a PR with a malicious workflow edit and dump secrets, trigger bad deployments, or cause other issues. This means that any changes to the workflow files can be protected with branch protection rules to ensure only verified changes make it into your default branch.

To further harden your workflow files, it is strongly suggested to include the base permissions that this Action needs to run:

```yaml
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
```

Permissions Explained:

- `pull-requests`: `write` - Required to add comments to pull requests with deployment results
- `deployments`: `write` - Required to update repository deployment statuses
- `contents`: `write` - Write access is required for this Action to create "lock" branches for deployments
- `checks`: `read` - Only read access is needed for this Action to get the status of other CI checks

It should also be noted that this Action has built in functions to check the permissions of a user who invokes a IssueOps command. If the user does not have `write` or greater permissions to the repository, their command will be rejected

### Admins 👩‍🔬

This Action supports a configurable input called `admins` which can be used to specify a list of individual GitHub users or teams that should have elevated permissions when using this Action

The `admins` input option takes a comma seperated list of GitHub handles or GitHub org teams which can bypass branch protection rules related to approvals for deployments. For example, if you give the option `admins: monalisa`, the `monalisa` user will be able to deploy without needing approval on their pull requests. CI checks will still need to pass however.

It should be noted that if you do not have pull request approvals enabled in your branch protection rules, then this option will not make a difference either way

Here is a simple example using only handles below (the monalisa and octocat users will be treated as admins):

```yaml
- uses: github/branch-deploy@vX.X.X
  id: branch-deploy
  with:
    admins: monalisa,octocat
```

Here is an example using a mix of GitHub handles and a GitHub org team below:

```yaml
- uses: github/branch-deploy@vX.X.X
  id: branch-deploy
  with:
    admins: monalisa,octocat,octo-awesome-org/octo-awesome-team
    admins_pat: ${{ secrets.BRANCH_DEPLOY_ADMINS_PAT }}
```

In this case, all users (and future users) in the `octo-awesome-org/octo-awesome-team` team will be treated as admins in addition to the monalisa and octocat users

It should be noted if you choose to use GitHub org teams for admin definitions, you **will** need a [GitHub Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with the `read:org` scope. This is because the Action will need to make API calls on behalf of an authenticated user in the org to retrieve team memberships. If you choose to only use GitHub handles for admin definitions, then the `admins_pat` input is not required

> Note: You can read more about the `admin` option under the **inputs** section in this readme

## Actions Stability 🔧

In order to ensure your usage of this action is stable, it is highly recommended that you use either pin your action to a SHA or use a specific release tag

### Actions Tag Pinning

You can easily select the exact version you want on the GitHub Actions marketplace seen in the screenshot below:

![Screenshot from 2022-05-09 12-12-06](https://user-images.githubusercontent.com/23362539/167471509-71ca2cf9-7b8f-4709-acee-67a679869fa6.png)

### Actions SHA Pinning

You can also pin to an exact commit SHA as well using a third party tool such as [mheap/pin-github-action](https://github.com/mheap/pin-github-action)

> GitHub Actions security hardening and stability docs availabe here: [docs](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions)

## Deployment Locks and Actions Concurrency 🔓

> Only run one deployment at a time

There are multiple ways to leverage this action for deployment locks! Let's take a look at each option

### Deployment Locks

The suggested way to go about deployment locking is to use the built in locking feature in this Action!

Just like how you can comment `.deploy` on a pull request to trigger a deployment, you can also comment `.lock` to lock deployments. This will prevent other users from triggering a deployment. The lock is associated with your GitHub handle, so you will be able to deploy any pull request in the repository and as many times as you want. Any other user who attempts a deployment while your lock is active will get a comment on their PR telling them that a lock is in effect

To release the deployment lock, simply comment `.unlock` on any pull request in the repository at anytime. Please be aware that other users can run this same command to remove the lock (in case you get offline and forget to do so 😉)

These deployment locks come in two flavors:

- `sticky`
- `non-sticky`

**sticky** locks are locks that presist until you remove them. As seen in the example above, the `.lock` command creates a **sticky** lock that will persist until someone runs `.unlock`

**non-sticky** locks are temporary locks that only exist during a deployment. This action will automatically create a **non-sticky** lock for you when you run `.deploy`. It does this to prevent another user from running `.deploy` in another pull request and creating a deployment conflict

#### Deployment Lock Core Concepts

Let's review the core concepts of deployment locks in a short summary:

- Deployment locks are used to prevent multiple deployments from running at the same time and breaking things
- Non-sticky locks are created automatically when running `.deploy` or `.deploy noop`
- Sticky locks are created manually by commenting `.lock` on a pull request - They will presist until you remove them with `.unlock`
- Locks are associated to a user's GitHub handle - This user can deploy any pull request in the repository and as many times as they want
- Any user can remove a lock by commenting `.unlock` on any pull request in the repository
- Details about a lock can be viewed with `.lock --details`
- Like all the features of this Action, users need `write` permissions or higher to use a command

#### How do Deployment Locks Work?

This Action uses GitHub branches to create a deployment lock. When you run `.lock` the following happens:

1. The Action checks to see if a lock already exists
2. If a lock does not exists it begins to create one for you
3. The Action creates a new branch called `branch-deploy-lock`
4. The Action then creates a lock file called `lock.json` on the new branch
5. The `lock.json` file contains metadata about the lock

Now when new deployments are run, they will check if a lock exists. If it does and it doesn't belong to you, your deployment is rejected. If the lock does belong to you, the deployment will continue.

#### Deployment Lock Examples 📸

Here are a few examples of deployment locks in action!

Lock Example:

![lock](https://user-images.githubusercontent.com/23362539/174189284-e3207acb-e647-4467-9cf0-676a811b32f1.png)

Unlock Example:

![unlock](https://user-images.githubusercontent.com/23362539/174189384-6faadd57-9512-4056-91d7-c15c3032e1e6.png)

### Actions Concurrency

> Note: Using the locking mechanism included in this Action (above) is highly recommended over Actions concurreny. The section below will be included anyways should you have a valid reason to use it instead of the deploy lock features this Action provides

If your workflows need some level of concurrency or locking, you can leverage the native GitHub Actions concurrency feature ([documentation](https://docs.github.com/en/actions/using-jobs/using-concurrency)) to enable this.

For example, if you have two users run `.deploy` on two seperate PRs at the same time, it will trigger two deployments. In some cases, this will break things and you may not want this. By using Actions concurrency, you can prevent multiple workflows from running at once

The default behavior for Actions is to run the first job that was triggered and to set the other one as `pending`. If you want to cancel the other job, that can be configured as well. Below you will see an example where we setup a concurrency group which only allows one deployment at a time and cancels all other workflows triggered while our deployment is running:

```yaml
concurrency: 
  group: production
  cancel-in-progress: true
```

### Need More Deployment Lock Control?

If you need more control over when, how, and why deployment locks are set, you can use the [github/lock](https://github.com/github/lock) Action!

This Action allows you to set a lock via an issue comment, custom condition, on merges, etc. You have full control over when and how the lock is set and removed!

## Merge Commit Workflow Strategy

> Note: This section is rather advanced and entirely optional

At GitHub, we use custom logic to compare the latest deployment with the merge commit created when a pull request is merged to our default branch. This helps to save CI time, and prevent redundant deployments. If a user deploys a pull request, it succeeds, and then the pull request is merged, we will not deploy the merge commit. This is because the merge commit is the same as the latest deployment.

This Action comes bundled with an alternate workflow to help facilitate exactly this. Before explaining how this works, let's first review why this might be useful.

Example scenario 1:

1. You have a pull request with a branch deployment created by this Action
2. No one else except for you has created a deployment
3. You click the merge button on the pull request you just deployed
4. The "merge commit workflow strategy" is triggered on merge to your default branch
5. The workflow compares the latest deployment with the merge commit and finds they are identical
6. The workflow uses logic to exit as it does not need to deploy the merge commit since it is the same as the latest deployment

Example scenario 2:

1. You have a pull request with a branch deployment created by this Action
2. You create a deployment on your pull request
3. You go to make a cup of coffee and while doing so, your teammate creates a deployment on their own (different) pull request
4. You click the merge button on the pull request you just deployed (which is now silently out of date)
5. The "merge commit workflow strategy" is triggered on merge to your default branch
6. The workflow compares the latest deployment with the merge commit and finds they are different
7. The workflow uses logic to deploy the merge commit since it is different than the latest deployment

This should help explain why this strategy is useful. It helps to save CI time and prevent redundant deployments. If you are not using this strategy, you will end up deploying the merge commit even if it is the same as the latest deployment if you do a deployment everytime a pull request is merged (rather common).

### Using the Merge Commit Workflow Strategy

To use the advanced merge commit workflow strategy, you will need to do the following:

1. Create a new Actions workflow file in your repository that will be triggered on merge to your default branch
2. Add a job that calls the branch-deploy Action
3. Add configuration to the Action telling it to use the custom merge commit workflow strategy

Below is a sample workflow with plenty of in-line comments to help you along:

```yaml
name: deploy
on:
  push:
    branches:
      - main # <-- This is the default branch for your repository

jobs:
  deploy:
    if: github.event_name == 'push' # Merge commits will trigger a push event
    environment: production # You can configure this to whatever you call your production environment
    runs-on: ubuntu-latest
    steps:
      # Call the branch-deploy Action - name it something else if you want (I did here for clarity)
      - name: deployment check
        uses: github/branch-deploy@vX.X.X # replace with the latest version of this Action
        id: deployment-check # ensure you have an 'id' set so you can reference the output of the Action later on
        with:
          merge_deploy_mode: "true" # required, tells the Action to use the merge commit workflow strategy
          environment: production # optional, defaults to 'production'

      # Now we can conditionally 'gate' our deployment logic based on the output of the Action
      # If the Action returns 'true' for the 'continue' output, we can continue with our deployment logic
      # Otherwise, all subsequent steps will be skipped

      # Check out the repository
      - uses: actions/checkout@2541b1294d2704b0964813337f33b291d3f8596b # pin@v3.0.2
        if: ${{ steps.deployment-check.outputs.continue == 'true' }} # only run if the Action returned 'true' for the 'continue' output

      # Do your deployment here! (However you want to do it)
      # This could be deployment logic via SSH, Terraform, AWS, Heroku, etc.
      - name: fake regular deploy
        if: ${{ steps.deployment-check.outputs.continue == 'true' }} # only run if the Action returned 'true' for the 'continue' output
        run: echo "I am doing a fake regular deploy"
```

## Examples

This section contains real world examples of how this Action can be used

- [Terraform](docs/examples.md#terraform)
- [Heroku](docs/examples.md#heroku)
- [Railway](docs/examples.md#railway)
- [SSH](docs/examples.md#ssh)
- [Cloudflare Pages](docs/examples.md#cloudflare-pages)
- [Cloudflare Workers](docs/examples.md#cloudflare-workers)

> Checkout the [examples document](docs/examples.md) for more examples

Remember, these are just examples and you can quite literally configure this Action for **any** deployment target you want!

### Live Examples 📸

What to see live examples of this Action in use?

Check out some of the links below to see how others are using this Action in their projects:

- [github/entitlements-config](https://github.com/github/entitlements-config/blob/076a1f0f9e8cc1f5acb8a0b8e133b0a1300c8191/.github/workflows/branch-deploy.yml)
- [the-hideout/cloudflare](https://github.com/the-hideout/cloudflare/blob/f3b189b54f278d7e7844e5cc2fcdbb6f5afd3467/.github/workflows/branch-deploy.yml)
- [the-hideout/tarkov-api](https://github.com/the-hideout/tarkov-api/blob/be645d7750a0e440794229ce56aefeb4648b8892/.github/workflows/branch-deploy.yml)
- [the-hideout/stash](https://github.com/the-hideout/stash/blob/4aabf7565fda933f8e40ae9c60cde9f03e549b3b/.github/workflows/branch-deploy.yml)

> Are you using this Action in a cool new way? Open a pull request to this repo to have your workflow added to the list above!

## Suggestions 🌟

This section will cover a few suggestions that will help you when using this Action

1. Suggest Updating Pull Request Branches - You should absolutely use this option when using the `branch-deploy` Action. This option can be found in your repository's `/settings` page

    ![branch-setting](https://user-images.githubusercontent.com/23362539/172939811-a8816db8-8e7c-404a-b12a-11ec5bc6e93d.png)

2. Enable Branch Protection Settings - It is always a good idea to enable branch protection settings for your repo, especially when using this Action

## Alternate Command Syntax

Here are a few alternate ways you can invoke commands:

- `.deploy noop staging` - Invoke a "noop" deployment to the staging environment
- `.deploy development` - Invoke a deployment to the development environment (notice how you can omit the "to" keyword)
- `.deploy to development` - Invoke a deployment to the development environment (with the "to" keyword)
- `.deploy` - Uses the default environment (usually "production")

## Testing Locally 🔨

Steps for testing the Action locally for development

### Using NPM

```console
npm run test
```

> Note: This has been tested on node 16.x and npm 8.x

### Using Act

> This is a not fully supported

Test with [act](https://github.com/nektos/act) locally to simulate a GitHub Actions event

```bash
act issue_comment -e events/issue_comment_deploy.json -s GITHUB_TOKEN=faketoken -j test
```

---

## Contributing 💻

All contributions are welcome from all!

Check out the [contributing guide](CONTRIBUTING.md) to learn more
