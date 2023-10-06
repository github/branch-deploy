# Merge Commit Workflow Strategy

> Note: This section is rather advanced and entirely optional. This workflow also complements the other alternate workflow called "[Unlock on Merge Mode](unlock-on-merge.md)".

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

This should help explain why this strategy is useful. It helps to save CI time and prevent redundant deployments. If you are not using this strategy, you will end up deploying the merge commit even if it is the same as the latest deployment if you do a deployment every time a pull request is merged (rather common).

## Using the Merge Commit Workflow Strategy

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
      - uses: actions/checkout@v4
        if: ${{ steps.deployment-check.outputs.continue == 'true' }} # only run if the Action returned 'true' for the 'continue' output

      # Do your deployment here! (However you want to do it)
      # This could be deployment logic via SSH, Terraform, AWS, Heroku, etc.
      - name: fake regular deploy
        if: ${{ steps.deployment-check.outputs.continue == 'true' }} # only run if the Action returned 'true' for the 'continue' output
        run: echo "I am doing a fake regular deploy"
```
