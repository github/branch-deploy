# Unlock On Merge Mode

Full Workflow Example:

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
          unlock_on_merge_mode: "true"
```
