# Branch Deploy Action 🚀

test

A GitHub Action to enable branch deployments using IssueOps!

This Action does the heavy lifting for you to enable branch deployments:

- 🔍 Detects when IssueOps commands are used on a pull request
- ✏️ Configurable - Choose your command syntax, environment, noop trigger, base branch, reaction, and more
- ✔️ Respects your branch protection settings configured for the repo
- 🗨️ Comments and reacts to your IssueOps commands
- 🚀 Triggers GitHub deployments for you with zero config

## Turbo Quickstart ⚡

Check out a super simple workflow using this Action to quickly get up and running with branch deployments

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
    runs-on: ubuntu-latest
    steps:
      # Checkout your projects repository
      - uses: actions/checkout@3.0.2
  
      # Execute IssueOps branch deployment logic, hooray!
      - uses: GrantBirki/branch-deploy@main
        id: branch-deploy-start
        with:
          trigger: ".deploy"
          github_token: ${{ secrets.GITHUB_TOKEN }}

      # Run your deployment logic for your project here
      # Examples: terraform apply, kubectl apply, heroku push
      - name: deployment
        id: deployment # use an id to export the results for post-deployment
        run: echo "I am running a deployment! - (Add your own logic here)"

      # Wrap up the deployment and post a comment with deployment details
      - uses: GrantBirki/branch-deploy@main
        with:
          post_deploy: true # activates post deployment logic
          data: ${{steps.branch-deploy-start.outputs.data}} # required deployment data
          deployment_status: ${{ steps.deployment.outcome }} # id related to the deployment to report status
          deployment_message: ${{ steps.deployment.outcome }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
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
    runs-on: ubuntu-latest
    steps:
      # Checkout your projects repository
      - uses: actions/checkout@3.0.2
```

Sets up your `demo` job, uses an ubuntu runner, and checks out your repo - Just some standard setup for a general Action

```yaml
      # Execute IssueOps branch deployment logic, hooray!
      - uses: GrantBirki/branch-deploy@main
        id: branch-deploy-start
        with:
          trigger: ".deploy"
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

The core of this Action takes place here. This block of code will trigger the branch deploy action to run. It will do the following:

1. Check the comment which invoked the workflow for the `trigger:` phrase (`.deploy`) defined here
1. If the trigger phrase is found, it will proceed with a deployment
1. It will start by reacting to your message to let you know it is running
1. The Action will post a comment with a link to the running Actions workflow for you to follow its progress
1. A deployment will be started and attached to your pull request - You'll get a nice little yellow rocket which tells you a deployment is in progress
1. Outputs will be exported by this job for later reference in other jobs as well

```yaml
      # Run your deployment logic for your project here
      # Examples: terraform apply, kubectl apply, heroku push
      - name: deployment
        id: deployment
        run: echo "I am running a deployment! - (Add your own logic here)"
```

Now that your deployment has be triggered by your IssueOps command, you are ready to run whatever logic your heart desires to deploy your changes! Here are some examples of ways you might deploy your changes:

- `terraform apply`
- `kubectl apply`
- `heroku push`
- etc

It is important to note that you set an `id:` for the job that ultimately handles your deployment. This is critical because we need to reference the status of that job later on to wrap up our deployment as "failed" or "successful". By default, GitHub Actions will set the `steps.<name>.outcome` output to `success` if your steps completes with an exit code of `0`

```yaml
      # Wrap up the deployment and post a comment with deployment details
      - uses: GrantBirki/branch-deploy@main
        with:
          post_deploy: true # activates post deployment logic
          data: ${{steps.branch-deploy-start.outputs.data}}
          deployment_status: ${{ steps.deployment.outcome }}
          deployment_message: ${{ steps.deployment.outcome }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

In this last step, we wrap up our deployment now that our previous step has finished. Depending on whether your deployment step exited successfully or not, it will reflect the result of your deployment

Let's go through each of the variables we are using in the post deploy action:

- `post_deploy: true` - Signals to the Action that post deployment logic should be activated
- `data: ${{steps.branch-deploy-start.outputs.data}}` - Uses data payload that was an output from our initial deploy stage to complete said deployment
- `deployment_status: ${{ steps.deployment.outcome }}` - Uses the outcome (derived from the exit code) of your custom deployment job to determine if the deployment should be set to "success" or "failure"
- `deployment_message: ${{ steps.deployment.outcome }}` - A custom message you want included on your deployment status comment. This can be any string
- `github_token: ${{ secrets.GITHUB_TOKEN }}` - The standard GitHub token available in all workflows which allows this Action permissions to comment on your PR with results

## Inputs ➡️⚙️

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| environment | yes | production | The name of the environment to deploy to. Example, "production" |
| github_token | yes | - | The GitHub token used to create an authenticated client |
| reaction | no | eyes | If set, the specified emoji "reaction" is put on the comment to indicate that the trigger was detected. For example, "rocket" or "eyes" |
| trigger | no | .deploy | The string to look for in comments as an IssueOps trigger. Example: ".deploy" |
| noop_trigger | no | noop | The string to look for in comments as an IssueOps noop trigger. Example: "noop" |
| environment | no | production | The name of the environment to deploy to. Example, "production" |
| stable_branch | no | main | The name of a stable branch to deploy to (rollbacks). Example: "main" |
| prefix_only | no | true | If "false", the trigger can match anywhere in the comment |
| deployment_status | no | success | The status of the deployment. Example: "success|failure" |
| deployment_message | no | - | An optional and alternate workflow that posts a comment with the deployment results back on the pr that triggered the initial deployment. Example: "successfully noop deployed to production - I would have changed 1 server" |

## Outputs ⚙️➡️

| Output | Description |
| ------ | ----------- |
| triggered | The string "true" if the trigger was found, otherwise the string "false" |
| noop | The string "true" if the noop trigger was found, otherwise the string "false" |
| ref | The comment body |
| comment_id | The comment id which triggered this deployment |

## Testing Locally 🔨

Test with [act](https://github.com/nektos/act) locally to simulate a GitHub Actions event

```bash
act issue_comment -e events/issue_comment_deploy.json -s GITHUB_TOKEN=faketoken -j test
```
