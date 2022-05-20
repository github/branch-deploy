# Branch Deploy Action 🚀

test

[![CodeQL](https://github.com/GrantBirki/branch-deploy/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/GrantBirki/branch-deploy/actions/workflows/codeql-analysis.yml) [![Check dist/](https://github.com/GrantBirki/branch-deploy/actions/workflows/check-dist.yml/badge.svg)](https://github.com/GrantBirki/branch-deploy/actions/workflows/check-dist.yml) [![test](https://github.com/GrantBirki/branch-deploy/actions/workflows/test.yml/badge.svg)](https://github.com/GrantBirki/branch-deploy/actions/workflows/test.yml) [![coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action to enable branch deployments using IssueOps!

This Action does the heavy lifting for you to enable branch deployments:

- 🔍 Detects when IssueOps commands are used on a pull request
- ✏️ Configurable - Choose your command syntax, environment, noop trigger, base branch, reaction, and more
- ✔️ Respects your branch protection settings configured for the repo
- 🗨️ Comments and reacts to your IssueOps commands
- 🚀 Triggers GitHub deployments for you with simple configuration

## Demo 🎥

A video demo showing how IssueOps on a pull request works using this Action

https://user-images.githubusercontent.com/23362539/166625510-50a80738-a7a2-486d-9d74-8dda5b95ec8d.mp4

> View the pull request that created this demo [here](https://github.com/GrantBirki/branch-deploy/pull/17)

## Turbo Quickstart ⚡

A quick section to get you started with this Action

### Usage 📝

Basic usage assuming all defaults:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: GrantBirki/branch-deploy@vX.X.X
```

Advanced usage with custom configuration:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: GrantBirki/branch-deploy@vX.X.X
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
  contents: read

jobs:
  demo:
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest
    steps:
      # Execute IssueOps branch deployment logic, hooray!
      # This will be used to "gate" all future steps below and conditionally trigger steps/deployments
      - uses: GrantBirki/branch-deploy@vX.X.X
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
  pull-requests: write
  deployments: write
  contents: read
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
      - uses: GrantBirki/branch-deploy@vX.X.X
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

## Inputs ➡️⚙️

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| environment | yes | production | The name of the environment to deploy to. Example, "production" |
| github_token | yes | ${{ github.token }} | The GitHub token used to create an authenticated client - Provided for you by default! |
| status | yes | ${{ job.status }} | The status of the GitHub Actions - For use in the post run workflow - Provided for you by default! |
| reaction | no | eyes | If set, the specified emoji "reaction" is put on the comment to indicate that the trigger was detected. For example, "rocket" or "eyes" |
| trigger | no | .deploy | The string to look for in comments as an IssueOps trigger. Example: ".deploy" |
| noop_trigger | no | noop | The string to look for in comments as an IssueOps noop trigger. Example: "noop" |
| environment | no | production | The name of the environment to deploy to. Example, "production" |
| stable_branch | no | main | The name of a stable branch to deploy to (rollbacks). Example: "main" |
| prefix_only | no | true | If "false", the trigger can match anywhere in the comment |
| required_contexts | no | false | Manually enforce commit status checks before a deployment can continue. Only use this option if you wish to manually override the settings you have configured for your branch protection settings for your GitHub repository. Default is "false" - Example value: "context1,context2,context3" - In most cases you will not need to touch this option |

## Outputs ⚙️➡️

| Output | Description |
| ------ | ----------- |
| triggered | The string "true" if the trigger was found, otherwise the string "false" |
| noop | The string "true" if the noop trigger was found, otherwise the string "false" - Use this to conditionally control whether your deployment runs as a noop or not |
| ref | The comment body |
| comment_id | The comment id which triggered this deployment |
| continue | The string "true" if the deployment should continue, otherwise empty - Use this to conditionally control if your deployment should proceed or not |

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
      - uses: GrantBirki/branch-deploy@vX.X.X
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
  contents: read
```

## Actions Stability 🔧

In order to ensure your usage of this action is stable, it is highly recommended that you use either pin your action to a SHA or use a specific release tag

### Actions Tag Pinning

You can easily select the exact version you want on the GitHub Actions marketplace seen in the screenshot below:

![Screenshot from 2022-05-09 12-12-06](https://user-images.githubusercontent.com/23362539/167471509-71ca2cf9-7b8f-4709-acee-67a679869fa6.png)

### Actions SHA Pinning

You can also pin to an exact commit SHA as well using a third party tool such as [mheap/pin-github-action](https://github.com/mheap/pin-github-action)

> GitHub Actions security hardening and stability docs availabe here: [docs](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions)

## Actions Concurrency and Locking 🔓

> Only run one deployment at a time

If your workflows need some level of concurrency or locking, you can leverage the native GitHub Actions concurrency feature ([documentation](https://docs.github.com/en/actions/using-jobs/using-concurrency)) to enable this.

For example, if you have two users run `.deploy` on two seperate PRs at the same time, it will trigger two deployments. In some cases, this will break things and you may not want this. By using Actions concurrency, you can prevent multiple workflows from running at once

The default behavior for Actions is to run the first job that was triggered and to set the other one as `pending`. If you want to cancel the other job, that can be configured as well. Below you will see an example where we setup a concurrency group which only allows one deployment at a time and cancels all other workflows triggered while our deployment is running:

```yaml
concurrency: 
  group: production
  cancel-in-progress: true
```

## Testing Locally 🔨

> This is a not fully supported

Test with [act](https://github.com/nektos/act) locally to simulate a GitHub Actions event

```bash
act issue_comment -e events/issue_comment_deploy.json -s GITHUB_TOKEN=faketoken -j test
```

---

## Contributing 💻

All contributions are welcome from all!

Check out the [contributing guide](CONTRIBUTING.md) to learn more
