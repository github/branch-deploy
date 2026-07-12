# Merge Commit Workflow Strategy

> Note: This section is rather advanced and entirely optional. This workflow also complements the other alternate workflow called "[Unlock on Merge Mode](unlock-on-merge.md)".

At GitHub, we use custom logic to compare the newest identifiable Branch Deploy deployment with the latest commit on the default branch. This helps save CI time and prevent redundant deployments. The merge workflow skips deployment only when that Branch Deploy deployment is `ACTIVE` and its commit tree exactly matches the current default-branch tree.

Deployments created by other systems are ignored while finding the newest deployment whose payload identifies it as `branch-deploy`. A missing, failed, pending, inactive, or malformed relevant deployment requires a new deployment. Branch Deploy also validates repository identity, environment identity, and pagination progress while reading deployment history so incomplete or inconsistent history does not produce a false skip.

This Action comes bundled with an alternate workflow to help facilitate exactly this. Before explaining how this works, let's first review why this might be useful.

Example scenario 1:

1. You have a pull request with a branch deployment created by this Action
2. No one else except for you has created a deployment
3. You click the merge button on the pull request you just deployed
4. The "merge commit workflow strategy" is triggered on merge to your default branch
5. The workflow compares the newest active Branch Deploy deployment with the default-branch commit tree and finds they are identical
6. The workflow exits because the default-branch tree is already represented by the newest relevant deployment

Example scenario 2:

1. You have a pull request with a branch deployment created by this Action
2. You create a deployment on your pull request
3. You go to make a cup of coffee and while doing so, your teammate creates a deployment on their own (different) pull request
4. You click the merge button on the pull request you just deployed (which is now silently out of date)
5. The "merge commit workflow strategy" is triggered on merge to your default branch
6. The workflow compares the newest relevant Branch Deploy deployment with the default-branch commit tree and finds they are different, inactive, or unavailable
7. The workflow deploys the default-branch commit because the relevant deployment does not prove that tree is active

This strategy saves CI time without treating unrelated or unsuccessful deployment history as proof that the current default-branch tree is already deployed. Without it, a workflow that deploys on every default-branch push will redeploy that tree even when the newest active Branch Deploy deployment already represents it.

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
          merge_deploy_mode: true # required, tells the Action to use the merge commit workflow strategy
          environment: production # optional, defaults to 'production'

      # Now we can conditionally 'gate' our deployment logic based on the output of the Action
      # If the Action returns 'true' for the 'continue' output, we can continue with our deployment logic
      # Otherwise, all subsequent steps will be skipped

      # Check out the repository
      - uses: actions/checkout@v7.0.0
        if: ${{ steps.deployment-check.outputs.continue == 'true' }} # only run if the Action returned 'true' for the 'continue' output
        with:
          ref: ${{ steps.deployment-check.outputs.sha }} # checkout the EXACT sha of the default branch for deployment (latest commit on the default branch)
          persist-credentials: false

      # Do your deployment here! (However you want to do it)
      # This could be deployment logic via SSH, Terraform, AWS, Heroku, etc.
      - name: fake regular deploy
        if: ${{ steps.deployment-check.outputs.continue == 'true' }} # only run if the Action returned 'true' for the 'continue' output
        run: echo "I am doing a fake regular deploy"
```
