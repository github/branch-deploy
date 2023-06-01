# Unlock On Merge Mode

This is an alternate workflow configuration that is bundled into this Action for simplicity. It is not required to use this Action and it is entirely optional. Essentially, if you create a new workflow and pass in the `unlock_on_merge_mode` input with a value of `true`, then an entirely new workflow type will run.

This workflow can only run in the context of a merged pull request and it will look for all associated deployments that were created by the `branch-deploy` Action. It will then automatically unlock all of those deployments.

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
  deployments: read
  contents: write

jobs:
  unlock-on-merge:
    runs-on: ubuntu-latest

    steps:
      - name: unlock on merge
        uses: github/branch-deploy@vX.X.X
        id: unlock-on-merge
        with:
          unlock_on_merge_mode: "true" # <-- indicates that this is the "Unlock on Merge Mode" workflow
```
