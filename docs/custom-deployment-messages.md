# Custom Deployment Messages ✏️

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

## Additional Custom Message Examples 📚

### Adding newlines to your message

```bash
echo "DEPLOY_MESSAGE=NOOP Result:\nI would have **updated** 1 server" >> $GITHUB_ENV
```

### Multi-line strings ([reference](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#example-2))

```bash
echo 'DEPLOY_MESSAGE<<EOF' >> $GITHUB_ENV
echo "$SOME_MULTI_LINE_STRING_HERE" >> $GITHUB_ENV
echo 'EOF' >> $GITHUB_ENV
```

> Where `$SOME_MULTI_LINE_STRING_HERE` is a bash variable containing a multi-line string

### Adding a code block to your message

```bash
echo "DEPLOY_MESSAGE=\`\`\`yaml\nname: value\n\`\`\`" >> $GITHUB_ENV
```

## How does this work? 🤔

To add custom messages to our final deployment message we need to use the GitHub Actions environment. This is so that we can dynamically pass data into the post action workflow that leaves a comment on our PR. The post action workflow will look to see if this environment variable is set (`DEPLOY_MESSAGE`). If the variable is set, it adds to to the PR comment. Otherwise, it will use a simple comment body that doesn't include the custom message.
