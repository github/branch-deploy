# Examples

This section contains real world and common examples of how you could use this Action

> Note: In all examples, we will be using `uses: github/branch-deploy@vX.X.X`. Replace `X.X.X` with the [latest version](https://github.com/marketplace/actions/branch-deploy) of this Action

## Terraform

This example shows how you could use this Action with Terraform

- `.deploy noop` triggers a Terraform plan
- `.deploy` triggers a Terraform apply

All deployment results get posted as a comment in the branch deploy output on your pull request

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [ created ]

env:
  WORKING_DIR: terraform/

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write

jobs:
  deploy:
    name: deploy
    runs-on: ubuntu-latest
    environment: secrets # the locked down environment we pull secrets from
    defaults:
      run:
        working-directory: ${{ env.WORKING_DIR }} # the directory we use where all our TF files are stored

    steps:
      - name: branch-deploy
        id: branch-deploy
        uses: github/branch-deploy@vX.X.X

      - name: Checkout
        if: steps.branch-deploy.outputs.continue == 'true'
        uses: actions/checkout@ec3a7ce113134d7a93b817d10a8272cb61118579 # pin@v2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

      - uses: hashicorp/setup-terraform@ed3a0531877aca392eb870f440d9ae7aba83a6bd # pin@v1
        if: steps.branch-deploy.outputs.continue == 'true'
        with:
          terraform_version: 1.1.7
          cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}

      - name: Terraform init
        if: steps.branch-deploy.outputs.continue == 'true'
        run: terraform init

      - name: Terraform plan
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' }}
        id: plan
        run: terraform plan -no-color
        continue-on-error: true # continue on error as we will handle errors later on

      - name: Terraform apply
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        id: apply
        run: terraform apply -no-color -auto-approve
        continue-on-error: true # continue on error as we will handle errors later on

        # This step writes the TF plan/apply output to $GITHUB_ENV which the branch-deploy Action will read from and post as a comment on the pull request
      - name: Terraform plan output
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' }}
        env:
          TF_STDOUT: ${{ steps.plan.outputs.stdout }}
        run: |
          TF_OUTPUT="\`\`\`terraform\n${TF_STDOUT}\n\`\`\`"
          echo 'DEPLOY_MESSAGE<<EOF' >> $GITHUB_ENV
          echo "$TF_OUTPUT" >> $GITHUB_ENV
          echo 'EOF' >> $GITHUB_ENV
      - name: Terraform apply output
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        env:
          TF_STDOUT: ${{ steps.apply.outputs.stdout }}
        run: |
          TF_OUTPUT="\`\`\`terraform\n${TF_STDOUT}\n\`\`\`"
          echo 'DEPLOY_MESSAGE<<EOF' >> $GITHUB_ENV
          echo "$TF_OUTPUT" >> $GITHUB_ENV
          echo 'EOF' >> $GITHUB_ENV

        # Here we handle any errors that might have occurred during the Terraform plan/apply and exit accordingly
      - name: Check Terraform plan output
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' && steps.plan.outcome == 'failure' }}
        run: exit 1
      - name: Check Terraform apply output
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' && steps.apply.outcome == 'failure' }}
        run: exit 1
```
