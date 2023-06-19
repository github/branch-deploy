# Unlock On Merge Mode

This is an alternate workflow configuration that is bundled into this Action for simplicity. It is not required to use this Action and it is entirely optional. Essentially, if you create a new workflow and pass in the `unlock_on_merge_mode` input with a value of `true`, then an entirely new workflow type will run.

This workflow can only run in the context of a merged pull request and it will look for all locks associated with the merged pull request. If "sticky" locks are found that were created from the merged pull request, then they will be removed via this workflow.

This can be especially useful when you merge a pull request and want the "sticky" locks that you claimed with `.lock` to be automatically cleaned up.

> The "Unlock on Merge Mode" is very similar to the "[Merge Commit Strategy](merge-commit-strategy.md)" workflow and they often complement each other well.

## Full Workflow Example

This is a complete Actions workflow example that demonstrates how to use the "Unlock on Merge Mode" workflow.

```yaml
name: Unlock On Merge

on:
  pull_request:
    types: [closed]

permissions:
  contents: write

jobs:
  unlock-on-merge:
    runs-on: ubuntu-latest
    # Gate this job to only run when the pull request is merged (not closed)
    # https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#running-your-pull_request-workflow-when-a-pull-request-merges
    if: github.event.pull_request.merged == true

    steps:
      - name: unlock on merge
        uses: github/branch-deploy@vX.X.X
        id: unlock-on-merge
        with:
          unlock_on_merge_mode: "true" # <-- indicates that this is the "Unlock on Merge Mode" workflow
```

**Note**: It should be noted that if you use custom `environment_targets` on your main `branch-deploy` workflow, then you must also bring those settings over to this new workflow as well. See the example below:

```yaml
# .github/workflows/branch-deploy.yml
- uses: github/branch-deploy@vX.X.X
  id: branch-deploy
  with:
    trigger: ".deploy"
    environment_targets: "prod,stage,dev"

# -------------------------------------------------

# .github/workflows/unlock-on-merge.yml
- name: unlock on merge
  uses: github/branch-deploy@vX.X.X
  id: unlock-on-merge
  with:
    unlock_on_merge_mode: "true" # <-- indicates that this is the "Unlock on Merge Mode" workflow
    environment_targets: "prod,stage,dev"
