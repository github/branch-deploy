# Examples

This section contains real world and common examples of how you could use this Action

> Note: In all examples, we will be using `uses: github/branch-deploy@vX.X.X`. Replace `X.X.X` with the [latest version](https://github.com/marketplace/actions/branch-deploy) of this Action

## Table of Contents

Quick links below to jump to a specific branch-deploy example:

- [Examples](#examples)
  - [Table of Contents](#table-of-contents)
  - [Simple Example](#simple-example)
  - [Terraform](#terraform)
  - [Terraform with Trusted Checkouts](#terraform-with-trusted-checkouts)
  - [Heroku](#heroku)
  - [Railway](#railway)
  - [SSH](#ssh)
  - [Cloudflare Pages](#cloudflare-pages)
  - [Cloudflare Workers](#cloudflare-workers)
  - [Multiple Jobs](#multiple-jobs)
  - [Multiple Jobs with GitHub Pages and Hugo](#multiple-jobs-with-github-pages-and-hugo)
  - [Multiple Jobs with GitHub Pages and Astro](#multiple-jobs-with-github-pages-and-astro)
  - [Multiple Jobs with GitHub Environments](#multiple-jobs-with-github-environments)

## Simple Example

This is the simplest possible example of how you could use the branch-deploy Action for reference

- `.noop` will run the noop deploy step only (you can configure noop deployments however you like, this is just an example)
- `.deploy` will deploy the current branch via the deploy step only (you can configure deployments however you like, this is just an example)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [created]

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

jobs:
  deploy:
    name: deploy
    runs-on: ubuntu-latest
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments

    steps:
      # The branch-deploy Action
      - name: branch-deploy
        id: branch-deploy
        uses: github/branch-deploy@vX.X.X

        # If the branch-deploy Action was triggered, checkout our branch
      - uses: actions/checkout@v7.0.0
        with:
          ref: ${{ steps.branch-deploy.outputs.sha }}
          persist-credentials: false

        # If the branch-deploy Action was triggered, run the noop deployment (i.e. '.noop')
      - name: noop deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' }}
        run: <do-your-noop-deployment> # this could be anything you want

        # If the branch-deploy Action was triggered, run the real deployment (i.e. '.deploy')
      - name: deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        run: <do-your-deployment> # this could be anything you want
```

## Terraform

This example shows how you could use this Action with [Terraform](https://www.terraform.io/)

- `.noop` triggers a Terraform plan
- `.deploy` triggers a Terraform apply

All deployment results get posted as a comment in the branch deploy output on your pull request

> A live example can be found [here](https://github.com/the-hideout/cloudflare/blob/3f3adedb729b9aba0cc324a161ad8ddd6f56141b/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [created]

# The working directory where our Terraform files are located
env:
  WORKING_DIR: terraform/

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

jobs:
  deploy:
    name: deploy
    runs-on: ubuntu-latest
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    environment: production-secrets # the locked down environment we pull secrets from
    defaults:
      run:
        working-directory: ${{ env.WORKING_DIR }} # the directory we use where all our TF files are stored

    steps:
      # The branch-deploy Action
      - name: branch-deploy
        id: branch-deploy
        uses: github/branch-deploy@vX.X.X

        # If the branch-deploy Action was triggered, checkout our branch
      - name: Checkout
        if: steps.branch-deploy.outputs.continue == 'true'
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ steps.branch-deploy.outputs.sha }}
          persist-credentials: false

        # Setup Terraform on our Actions runner
      - uses: hashicorp/setup-terraform@ed3a0531877aca392eb870f440d9ae7aba83a6bd # pin@v1
        if: steps.branch-deploy.outputs.continue == 'true'
        with:
          terraform_version: 1.1.7 # use the version of Terraform your project uses here
          cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}

        # Run Terraform init in our working directory
      - name: Terraform init
        if: steps.branch-deploy.outputs.continue == 'true'
        run: terraform init

        # If '.noop' was used, run a Terraform plan
      - name: Terraform plan
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' }}
        id: plan
        run: terraform plan -no-color
        continue-on-error: true # continue on error as we will handle errors later on

        # If '.deploy' was used, run a Terraform apply
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
          delimiter="branch_deploy_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
          while printf '%s\n' "$TF_STDOUT" | grep -Fxq "$delimiter"; do
            delimiter="branch_deploy_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
          done
          {
            printf 'DEPLOY_MESSAGE<<%s\n' "$delimiter"
            printf '%s\n' '```terraform'
            printf '%s\n' "$TF_STDOUT"
            printf '%s\n' '```'
            printf '%s\n' "$delimiter"
          } >> "$GITHUB_ENV"

      - name: Terraform apply output
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        env:
          TF_STDOUT: ${{ steps.apply.outputs.stdout }}
        run: |
          delimiter="branch_deploy_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
          while printf '%s\n' "$TF_STDOUT" | grep -Fxq "$delimiter"; do
            delimiter="branch_deploy_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
          done
          {
            printf 'DEPLOY_MESSAGE<<%s\n' "$delimiter"
            printf '%s\n' '```terraform'
            printf '%s\n' "$TF_STDOUT"
            printf '%s\n' '```'
            printf '%s\n' "$delimiter"
          } >> "$GITHUB_ENV"

        # Here we handle any errors that might have occurred during the Terraform plan/apply and exit accordingly
      - name: Check Terraform plan output
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' && steps.plan.outcome == 'failure' }}
        run: exit 1
      - name: Check Terraform apply output
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' && steps.apply.outcome == 'failure' }}
        run: exit 1
```

## Terraform with Trusted Checkouts

This example shows a hardened Terraform setup that separates trusted deployment
helper code from the working pull request code selected by branch-deploy.

- `.noop` runs `terraform plan` from the exact working commit SHA selected by branch-deploy
- `.deploy` runs `terraform apply` from that same working commit SHA
- the deployment message template is fetched by Branch Deploy at the exact trusted workflow SHA
- Terraform output is captured in `RUNNER_TEMP` and exported through `DEPLOY_MESSAGE`
- merge deploy mode avoids redeploying a default-branch commit only when the newest relevant Branch Deploy deployment is active and has the same commit tree
- unlock-on-merge mode cleans up sticky locks after the pull request merges

For the general security model behind this pattern, see the
[trusted checkout hardening guide](trusted-checkouts.md).

### `.github/workflows/branch-deploy.yml`

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [created]

permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

env:
  TF_IN_AUTOMATION: "true"

jobs:
  branch-deploy:
    if:
      ${{ github.event.issue.pull_request &&
      (startsWith(github.event.comment.body, '.deploy') ||
      startsWith(github.event.comment.body, '.noop') ||
      startsWith(github.event.comment.body, '.lock') ||
      startsWith(github.event.comment.body, '.help') ||
      startsWith(github.event.comment.body, '.wcid') ||
      startsWith(github.event.comment.body, '.unlock')) }}
    runs-on: ubuntu-latest
    environment:
      name: production
      deployment: false
    concurrency:
      group: ${{ (startsWith(github.event.comment.body, '.deploy') || startsWith(github.event.comment.body, '.noop')) && 'terraform-production' || format('branch-deploy-support-{0}', github.run_id) }}
      cancel-in-progress: false
      queue: max

    steps:
      - name: branch-deploy
        id: branch-deploy
        uses: github/branch-deploy@vX.X.X
        with:
          trigger: ".deploy"
          sticky_locks: true
          deployment_confirmation: true
          deploy_message_path: .github/deployment_message.md
          allow_forks: false

      - name: derive working checkout path
        id: working-path
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        env:
          DEPLOY_SHA: ${{ steps.branch-deploy.outputs.sha }}
        run: |
          set -euo pipefail
          echo "DEPLOY_SHA=${DEPLOY_SHA}"

          if [[ ! "${DEPLOY_SHA}" =~ ^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$ ]]; then
            echo "invalid branch-deploy sha output: ${DEPLOY_SHA}" >&2
            exit 1
          fi

          working_dir="deployment-${DEPLOY_SHA}"

          echo "working_dir=${working_dir}" >> "${GITHUB_OUTPUT}"
          echo "working checkout directory: ${working_dir}"

      - name: checkout working deployment sha
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ steps.branch-deploy.outputs.sha }}
          path: ${{ steps.working-path.outputs.working_dir }}
          fetch-depth: 1
          persist-credentials: false

      - name: verify checkout provenance
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        env:
          WORKING_DIR: ${{ steps.working-path.outputs.working_dir }}
          WORKING_SHA: ${{ steps.branch-deploy.outputs.sha }}
        run: |
          set -euo pipefail

          working_head="$(git -C "${WORKING_DIR}" rev-parse HEAD)"

          if [[ "${working_head}" != "${WORKING_SHA}" ]]; then
            echo "working checkout HEAD mismatch: expected ${WORKING_SHA}, got ${working_head}" >&2
            exit 1
          fi

          echo "working checkout: ${WORKING_DIR}@${working_head}"

      - name: prepare terraform output path
        id: terraform-output
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        run: |
          set -euo pipefail

          output_dir="$(mktemp -d "${RUNNER_TEMP}/branch-deploy-output.XXXXXX")"
          output_path="${output_dir}/terraform-output.txt"
          : > "${output_path}"

          if [[ -L "${output_path}" || ! -f "${output_path}" ]]; then
            echo "terraform output path is not a regular file: ${output_path}" >&2
            exit 1
          fi

          echo "path=${output_path}" >> "${GITHUB_OUTPUT}"
          echo "terraform output path: ${output_path}"

      - name: read terraform version
        id: terraform-version
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        working-directory: ${{ steps.working-path.outputs.working_dir }}/terraform
        run: echo "version=$(cat .terraform-version)" >> "$GITHUB_OUTPUT"

      - name: setup terraform
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        uses: hashicorp/setup-terraform@v4
        with:
          terraform_version: ${{ steps.terraform-version.outputs.version }}

      - name: terraform init
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        working-directory: ${{ steps.working-path.outputs.working_dir }}/terraform
        env:
          TF_TOKEN_app_terraform_io: ${{ secrets.TF_API_TOKEN }}
        run: terraform init

      - name: terraform plan
        id: plan
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' }}
        continue-on-error: true
        working-directory: ${{ steps.working-path.outputs.working_dir }}/terraform
        env:
          TF_TOKEN_app_terraform_io: ${{ secrets.TF_API_TOKEN }}
          TERRAFORM_OUTPUT_PATH: ${{ steps.terraform-output.outputs.path }}
        run: |
          set -o pipefail
          terraform plan -no-color -compact-warnings | tee "$TERRAFORM_OUTPUT_PATH"

      - name: terraform apply
        id: apply
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        continue-on-error: true
        working-directory: ${{ steps.working-path.outputs.working_dir }}/terraform
        env:
          TF_TOKEN_app_terraform_io: ${{ secrets.TF_API_TOKEN }}
          TERRAFORM_OUTPUT_PATH: ${{ steps.terraform-output.outputs.path }}
        run: |
          set -o pipefail
          terraform apply -auto-approve -no-color -compact-warnings | tee "$TERRAFORM_OUTPUT_PATH"

      - name: verify terraform output capture
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        env:
          TERRAFORM_OUTPUT_PATH: ${{ steps.terraform-output.outputs.path }}
        run: |
          set -euo pipefail

          if [[ -L "${TERRAFORM_OUTPUT_PATH}" || ! -f "${TERRAFORM_OUTPUT_PATH}" ]]; then
            echo "terraform output path is not a regular file: ${TERRAFORM_OUTPUT_PATH}" >&2
            exit 1
          fi

      - name: export deploy message
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        env:
          RESULTS_PATH: ${{ steps.terraform-output.outputs.path }}
        run: |
          set -euo pipefail
          delimiter="branch_deploy_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
          while grep -Fxq "${delimiter}" "${RESULTS_PATH}"; do
            delimiter="branch_deploy_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
          done
          {
            printf 'DEPLOY_MESSAGE<<%s\n' "${delimiter}"
            cat "${RESULTS_PATH}"
            printf '\n%s\n' "${delimiter}"
          } >> "${GITHUB_ENV}"

      - name: check terraform plan
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop == 'true' && steps.plan.outcome == 'failure' }}
        run: exit 1

      - name: check terraform apply
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' && steps.apply.outcome == 'failure' }}
        run: exit 1
```

### `.github/workflows/deploy.yml`

```yaml
name: deploy

on:
  push:
    branches: ["main"]

permissions:
  contents: read
  deployments: write

jobs:
  deployment-check:
    runs-on: ubuntu-latest
    outputs:
      continue: ${{ steps.deployment-check.outputs.continue }}
      sha: ${{ steps.deployment-check.outputs.sha }}

    steps:
      - name: deployment check
        id: deployment-check
        uses: github/branch-deploy@vX.X.X
        with:
          merge_deploy_mode: true
          environment: production

  deploy:
    if: ${{ needs.deployment-check.outputs.continue == 'true' }}
    needs: deployment-check
    runs-on: ubuntu-latest
    concurrency:
      group: terraform-production
      cancel-in-progress: false
      queue: max
    environment: production
    defaults:
      run:
        working-directory: terraform/
    env:
      TF_IN_AUTOMATION: "true"

    steps:
      - name: checkout
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ needs.deployment-check.outputs.sha }}
          fetch-depth: 1
          persist-credentials: false

      - name: read terraform version
        id: terraform-version
        working-directory: .
        run: echo "version=$(cat terraform/.terraform-version)" >> "$GITHUB_OUTPUT"

      - name: setup terraform
        uses: hashicorp/setup-terraform@v4
        with:
          terraform_version: ${{ steps.terraform-version.outputs.version }}

      - name: terraform init
        env:
          TF_TOKEN_app_terraform_io: ${{ secrets.TF_API_TOKEN }}
        run: terraform init

      - name: terraform apply
        env:
          TF_TOKEN_app_terraform_io: ${{ secrets.TF_API_TOKEN }}
        run: terraform apply -auto-approve -no-color -compact-warnings
```

### `.github/workflows/unlock-on-merge.yml`

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
    if: github.event.pull_request.merged == true

    steps:
      - name: unlock on merge
        id: unlock-on-merge
        uses: github/branch-deploy@vX.X.X
        with:
          unlock_on_merge_mode: true
          environment_targets: production
```

### `.github/deployment_message.md`

````markdown
### Deployment Results {{ ":white_check_mark:" if status === "success" else ":x:" }}

{% if status === "success" %}**{{ actor }}** successfully **{{ "noop" if noop else "branch" }}** deployed branch `{{ ref }}` to **{{ environment }}**{% endif %}{% if status === "failure" %}**{{ actor }}** your **{{ "noop" if noop else "branch" }}** deployment of `{{ ref }}` failed to deploy to the **{{ environment }}** environment{% endif %}

<details><summary>Show Results</summary>

```terraform
{{ results }}
```

</details>
````

## Heroku

This example shows how you could use this Action with [Heroku](https://heroku.com)

- `.noop` has no effect here (but you could change that)
- `.deploy` takes your current branch and deploys it to Heroku

> A live example can be found [here](https://github.com/the-hideout/stash/blob/aef5a5f16b4fa6946d2eba107e7b92c5f6583c0d/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [created]

permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

jobs:
  deploy:
    name: deploy
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest
    environment: production-secrets # the locked down environment we pull secrets from

    steps:
      # The branch-deploy Action
      - name: branch-deploy
        id: branch-deploy
        uses: github/branch-deploy@vX.X.X

        # If the branch-deploy Action was triggered, checkout our branch
      - name: Checkout
        if: steps.branch-deploy.outputs.continue == 'true'
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ steps.branch-deploy.outputs.sha }}
          persist-credentials: false

        # Deploy our branch to Heroku
      - name: Deploy to Heroku
        if: steps.branch-deploy.outputs.continue == 'true'
        uses: AkhileshNS/heroku-deploy@79ef2ae4ff9b897010907016b268fd0f88561820 # pin@v3.12.12
        with:
          heroku_app_name: <your-heroku-app-name-here>
          heroku_email: ${{ secrets.HEROKU_EMAIL }}
          heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
```

## Railway

This example shows how you could use this Action with [Railway](https://railway.app)

- `.noop` has no effect here (but you could change that)
- `.deploy` takes your current branch and deploys it to Railway

> A live example can be found [here](https://github.com/the-hideout/stash/blob/ee8af01919f368f35dede3c93f703fd239dbac3c/.github/workflows/branch-deploy.yml) that has some slight modifications to the example below

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [created]

permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

jobs:
  deploy:
    name: deploy
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest
    environment: production-secrets # the locked down environment we pull secrets from

    steps:
      # The branch-deploy Action
      - name: branch-deploy
        id: branch-deploy
        uses: github/branch-deploy@vX.X.X

        # If the branch-deploy Action was triggered, checkout our branch
      - name: Checkout
        if: steps.branch-deploy.outputs.continue == 'true'
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ steps.branch-deploy.outputs.sha }}
          persist-credentials: false

        # Install the Railway CLI through npm
      - name: Install Railway
        run: npm i -g @railway/cli

        # Deploy our branch to Railway
      - name: Deploy to Railway
        if: steps.branch-deploy.outputs.continue == 'true'
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: railway up
```

## SSH

This example shows how you could use this Action with SSH

You can define any commands you want to be run in your SSH Action and they would be gated by the branch-deploy Action.

- `.noop` has no effect here (but you could change that)
- `.deploy` runs the SSH action with your branch

> A live example can be found [here](https://github.com/the-hideout/cache/blob/6ee6ee2a69104f165c9f20df6e4e5cbb337b7c54/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [created]

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

jobs:
  deploy:
    environment: production-secrets # the locked down environment we pull secrets from
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest

    steps:
      # The branch-deploy Action
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy

        # If the branch-deploy Action was triggered, checkout our branch
      - name: Checkout
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ steps.branch-deploy.outputs.sha }}
          persist-credentials: false

        # Deploy our branch via SSH remote commands
      - name: SSH Remote Deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        uses: appleboy/ssh-action@4a03da89e5c43da56e502053be4bbcb293411883 # pin@v0.1.6
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          port: ${{ secrets.SSH_PORT }}
          script_stop: true
          script: <run-some-ssh-commands-here> # this could be whatever you want
```

## Cloudflare Pages

This example shows how you could use this Action with [Cloudflare Pages](https://pages.cloudflare.com/)

- `.deploy to development` deploys your branch to the development environment
- `.deploy` deploys your branch to the production environment

> A live example can be found [here](https://github.com/the-hideout/tarkov-dev/blob/b4417dfeb903985b83a24096b2e1ba2a22f39ddd/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [created]

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

jobs:
  deploy:
    environment: secrets # the locked down environment we pull secrets from
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest

    steps:
      # The branch-deploy Action
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy

        # If the branch-deploy Action was triggered, checkout our branch
      - name: Checkout
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ steps.branch-deploy.outputs.sha }}
          persist-credentials: false

        # setup node
      - uses: actions/setup-node@v4
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        with:
          node-version: '18'
          cache: 'npm'

        # Install the npm dependencies to build our cloudflare pages site
      - name: Install
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        run: npm ci

        # Build our cloudflare pages site
      - name: Build
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        run: npm run build

        # If '.deploy to development' was used, branch deploy to the development environment
      - name: deploy - dev
        id: dev-deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' && steps.branch-deploy.outputs.environment == 'development' }}
        uses: cloudflare/wrangler-action@4b3eae832ab5113c67958be31ca062ad46c593b6 # pin@3.3.1
        with:
          wranglerVersion: '2.13.0' # this can be any version of wrangler you want
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: pages publish build/ --project-name=<your-cloudflare-project-name> --branch=preview

        # If '.deploy' was used, branch deploy to the production environment
      - name: deploy - prod
        id: prod-deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' && steps.branch-deploy.outputs.environment == 'production' }}
        uses: cloudflare/wrangler-action@4b3eae832ab5113c67958be31ca062ad46c593b6 # pin@3.3.1
        with:
          wranglerVersion: '2.13.0' # this can be any version of wrangler you want
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: pages publish build/ --project-name=<your-cloudflare-project-name> --branch=main
```

## Cloudflare Workers

This example shows how you could use this Action with [Cloudflare Workers](https://workers.cloudflare.com/)

- `.deploy to development` deploys your branch to the development environment (if you have one with your Cloudflare workers)
- `.deploy` deploys your branch to the production environment

> A live example can be found [here](https://github.com/the-hideout/tarkov-api/blob/1677543951d5f2a848c2650eb3400178b8f9a55b/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [created]

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

jobs:
  deploy:
    environment: secrets # the locked down environment we pull secrets from
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest

    steps:
      # The branch-deploy Action
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy

        # If the branch-deploy Action was triggered, checkout our branch
      - name: Checkout
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ steps.branch-deploy.outputs.sha }}
          persist-credentials: false

        # Install the npm dependencies for your cloudflare workers project
        # Most importantly, we need to install @cloudflare/wrangler
      - name: Install dependencies
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        run: npm ci

        # If '.deploy to development' was used, branch deploy to the development environment
      - name: Publish - Development
        if: ${{ steps.branch-deploy.outputs.environment == 'development' &&
          steps.branch-deploy.outputs.noop != 'true' &&
          steps.branch-deploy.outputs.continue == 'true' }}
        uses: cloudflare/wrangler-action@4c10c1822abba527d820b29e6333e7f5dac2cabd # pin@2.0.0
        with:
          wranglerVersion: '2.17.0' # this can be any version of wrangler you want
          apiToken: ${{ secrets.CF_API_TOKEN }}
          environment: 'development' # here we use development

        # If '.deploy' was used, branch deploy to the production environment
      - name: Publish - Production
        if: ${{ steps.branch-deploy.outputs.continue == 'true' &&
          steps.branch-deploy.outputs.noop != 'true' &&
          steps.branch-deploy.outputs.environment == 'production' }}
        uses: cloudflare/wrangler-action@4c10c1822abba527d820b29e6333e7f5dac2cabd # pin@2.0.0
        with:
          wranglerVersion: '2.17.0' # this can be any version of wrangler you want
          apiToken: ${{ secrets.CF_API_TOKEN }}
```

## Multiple Jobs

If you need a complex deployment workflow, you can complete the deployment manually in a separate job. With `skip_completing: true`, your workflow owns final deployment statuses, comments, reactions, labels, and non-sticky lock cleanup. See [here](https://github.com/github/branch-deploy/blob/main/README.md#manual-deployment-control) for more details.

> This is a more advanced example

```yaml
name: deploy

on:
  issue_comment:
    types: [created]

permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read
  statuses: read

jobs:
  trigger:
    if: ${{ github.event.issue.pull_request }} # only run on pull request comments
    runs-on: ubuntu-latest
    outputs:
      continue: ${{ steps.branch-deploy.outputs.continue }}
      noop: ${{ steps.branch-deploy.outputs.noop }}
      deployment_id: ${{ steps.branch-deploy.outputs.deployment_id }}
      environment: ${{ steps.branch-deploy.outputs.environment }}
      lock_ref_sha: ${{ steps.capture-lock.outputs.sha }}
      sha: ${{ steps.branch-deploy.outputs.sha }}
      comment_id: ${{ steps.branch-deploy.outputs.comment_id }}
      initial_reaction_id: ${{ steps.branch-deploy.outputs.initial_reaction_id }}
      actor_handle: ${{ steps.branch-deploy.outputs.actor_handle }}

    steps:
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy
        with:
          trigger: ".deploy"
          skip_completing: true # we will complete the deployment manually

      - name: Capture deployment lock
        id: capture-lock
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        env:
          ENVIRONMENT: ${{ steps.branch-deploy.outputs.environment }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
        run: |
          lock_branch="$(printf '%s' "$ENVIRONMENT" | jq -Rsr 'gsub("\\s"; "-")')-branch-deploy-lock"
          if lock_ref_sha="$(gh api --method GET "repos/{owner}/{repo}/git/ref/heads/${lock_branch}" --jq '.object.sha' 2>/dev/null)"; then
            printf 'sha=%s\n' "$lock_ref_sha" >> "$GITHUB_OUTPUT"
          else
            echo "::warning::Could not capture the original deployment lock; manual lock cleanup will be skipped"
          fi

  deploy:
    needs: trigger
    if: ${{ needs.trigger.outputs.continue == 'true' && needs.trigger.outputs.noop != 'true' }}
    runs-on: ubuntu-latest

    steps:
      # checkout the project's repository based on the commit SHA provided by the branch-deploy step
      - name: checkout
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ needs.trigger.outputs.sha }}
          persist-credentials: false

      # You will do your own deployment here
      - name: fake regular deploy
        run: echo "I am doing a fake regular deploy"

  # update the deployment result - manually complete the deployment that was created by the branch-deploy action
  result:
    needs: [trigger, deploy]
    runs-on: ubuntu-latest
    # run even on failures but only if the trigger job set continue to true
    if: ${{ always() && needs.trigger.outputs.continue == 'true' }}

    steps:
      # if a previous step failed, set a variable to use as the deployment status
      - name: set deployment status
        id: deploy-status
        if: ${{ needs.trigger.result == 'failure' || needs.deploy.result == 'failure' }}
        run: |
          echo "DEPLOY_STATUS=failure" >> $GITHUB_OUTPUT

      # use the GitHub CLI to update the deployment status that was initiated by the branch-deploy action
      - name: Create a deployment status
        env:
          DEPLOYMENT_ID: ${{ needs.trigger.outputs.deployment_id }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          DEPLOY_STATUS: ${{ steps.deploy-status.outputs.DEPLOY_STATUS }}
          ENVIRONMENT: ${{ needs.trigger.outputs.environment }}
        run: |
          if [ -z "${DEPLOY_STATUS}" ]; then
            DEPLOY_STATUS="success"
          fi

          gh api \
            --method POST \
            "repos/{owner}/{repo}/deployments/${DEPLOYMENT_ID}/statuses" \
            -f environment="${ENVIRONMENT}" \
            -f state="${DEPLOY_STATUS}"

      # use the GitHub CLI to remove the non-sticky lock that was created by the branch-deploy action
      - name: Remove a non-sticky lock
        env:
          COMMENT_ID: ${{ needs.trigger.outputs.comment_id }}
          ENVIRONMENT: ${{ needs.trigger.outputs.environment }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
          LOCK_ACTOR: ${{ github.actor }}
          LOCK_REF_SHA: ${{ needs.trigger.outputs.lock_ref_sha }}
        run: |
          if [ -z "${LOCK_REF_SHA}" ]; then
            echo "No captured deployment lock remains"
            exit 0
          fi

          lock_branch="$(printf '%s' "$ENVIRONMENT" | jq -Rsr 'gsub("\\s"; "-")')-branch-deploy-lock"
          lock_contents="$(gh api --method GET "repos/{owner}/{repo}/contents/lock.json?ref=${LOCK_REF_SHA}" --jq '.content' | base64 --decode)"
          lock_link="${GITHUB_SERVER_URL}/${GH_REPO}/pull/${ISSUE_NUMBER}#issuecomment-${COMMENT_ID}"

          if ! printf '%s' "$lock_contents" | jq -e \
            --arg actor "$LOCK_ACTOR" \
            --arg environment "$ENVIRONMENT" \
            --arg link "$lock_link" \
            '.created_by == $actor and .environment == $environment and .global == false and .sticky == false and .link == $link' >/dev/null; then
            echo "The captured deployment lock is sticky or belongs to another deployment"
            exit 0
          fi

          repository_id="$(gh api --method GET 'repos/{owner}/{repo}' --jq '.node_id')"
          if gh api graphql \
            -f query='mutation($repository: ID!, $name: GitRefname!, $before: GitObjectID!) { updateRefs(input: {repositoryId: $repository, refUpdates: [{name: $name, beforeOid: $before, afterOid: "0000000000000000000000000000000000000000"}]}) { clientMutationId } }' \
            -f repository="$repository_id" \
            -f name="refs/heads/${lock_branch}" \
            -f before="$LOCK_REF_SHA" >/dev/null; then
            echo "Removed the original deployment lock"
          else
            echo "::warning::The original deployment lock changed; leaving the current lock in place"
          fi

      # remove the default 'eyes' reaction from the comment that triggered the deployment
      # this reaction is added by the branch-deploy action by default
      - name: remove eyes reaction
        env:
          COMMENT_ID: ${{ needs.trigger.outputs.comment_id }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          INITIAL_REACTION_ID: ${{ needs.trigger.outputs.initial_reaction_id }}
        run: |
          if [ -n "${INITIAL_REACTION_ID}" ]; then
            gh api \
              --method DELETE \
              "repos/{owner}/{repo}/issues/comments/${COMMENT_ID}/reactions/${INITIAL_REACTION_ID}"
          fi

      # if the deployment was successful, add a 'rocket' reaction to the comment that triggered the deployment
      - name: rocket reaction
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS != 'failure' }}
        uses: GrantBirki/comment@e6bf4bc177996c9572b4ddb98b25eb1a80f9abc9 # pin@v2.0.7
        with:
          comment-id: ${{ needs.trigger.outputs.comment_id }}
          reactions: rocket

      # if the deployment failed, add a '-1' (thumbs down) reaction to the comment that triggered the deployment
      - name: failure reaction
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS == 'failure' }}
        uses: GrantBirki/comment@e6bf4bc177996c9572b4ddb98b25eb1a80f9abc9 # pin@v2.0.7
        with:
          comment-id: ${{ needs.trigger.outputs.comment_id }}
          reactions: '-1'

      # if the deployment was successful, add a 'success' comment
      - name: success comment
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS != 'failure' }}
        uses: peter-evans/create-or-update-comment@67dcc547d311b736a8e6c5c236542148a47adc3d # pin@v2.1.1
        with:
          issue-number: ${{ github.event.issue.number }}
          body: |
            ### Deployment Results ✅

            **${{ needs.trigger.outputs.actor_handle }}** successfully deployed `${{ needs.trigger.outputs.sha }}` to **${{ needs.trigger.outputs.environment }}**

      # if the deployment was not successful, add a 'failure' comment
      - name: failure comment
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS == 'failure' }}
        uses: peter-evans/create-or-update-comment@67dcc547d311b736a8e6c5c236542148a47adc3d # pin@v2.1.1
        with:
          issue-number: ${{ github.event.issue.number }}
          body: |
            ### Deployment Results ❌

            **${{ needs.trigger.outputs.actor_handle }}** had a failure when deploying `${{ needs.trigger.outputs.sha }}` to **${{ needs.trigger.outputs.environment }}**
```

## Multiple Jobs with GitHub Pages and Hugo

A detailed example using multiple jobs, custom deployment status creation, non-sticky lock removal, and comments. This example showcases building a static site with [hugo](https://gohugo.io/) and deploying it to [GitHub Pages](https://pages.github.com/).

> This live example can be found [here](https://github.com/GrantBirki/blog/blob/559b9be5cc3eac923be5d7923ec9a0b50429ced2/.github/workflows/branch-deploy.yml)

```yaml
name: branch deploy

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
  statuses: read

# set an environment variable for use in the jobs pointing to my blog
env:
  blog_url: https://test.example.com # <--- CHANGE THIS TO YOUR BLOG URL

jobs:
  # branch-deploy trigger job
  trigger:
    if: # only run on pull request comments and very specific comment body string as defined in our branch-deploy settings
      ${{ github.event.issue.pull_request &&
      (contains(github.event.comment.body, '.deploy') ||
      contains(github.event.comment.body, '.lock') ||
      contains(github.event.comment.body, '.noop') ||
      contains(github.event.comment.body, '.help') ||
      contains(github.event.comment.body, '.wcid') ||
      contains(github.event.comment.body, '.unlock')) }}
    runs-on: ubuntu-latest
    outputs: # set outputs for use in downstream jobs
      continue: ${{ steps.branch-deploy.outputs.continue }}
      noop: ${{ steps.branch-deploy.outputs.noop }}
      deployment_id: ${{ steps.branch-deploy.outputs.deployment_id }}
      environment: ${{ steps.branch-deploy.outputs.environment }}
      lock_ref_sha: ${{ steps.capture-lock.outputs.sha }}
      sha: ${{ steps.branch-deploy.outputs.sha }}
      comment_id: ${{ steps.branch-deploy.outputs.comment_id }}
      initial_reaction_id: ${{ steps.branch-deploy.outputs.initial_reaction_id }}
      actor_handle: ${{ steps.branch-deploy.outputs.actor_handle }}

    steps:
      # execute the branch-deploy action
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy
        with:
          trigger: '.deploy'
          environment: 'github-pages'
          production_environments: 'github-pages'
          skip_completing: true # we will complete the deployment manually in the 'result' job
          admins: 'false' # <--- add your GitHub username here (if you want to use the admins feature)

      - name: Capture deployment lock
        id: capture-lock
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        env:
          ENVIRONMENT: ${{ steps.branch-deploy.outputs.environment }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
        run: |
          lock_branch="$(printf '%s' "$ENVIRONMENT" | jq -Rsr 'gsub("\\s"; "-")')-branch-deploy-lock"
          if lock_ref_sha="$(gh api --method GET "repos/{owner}/{repo}/git/ref/heads/${lock_branch}" --jq '.object.sha' 2>/dev/null)"; then
            printf 'sha=%s\n' "$lock_ref_sha" >> "$GITHUB_OUTPUT"
          else
            echo "::warning::Could not capture the original deployment lock; manual lock cleanup will be skipped"
          fi

  # build the github-pages site with hugo
  build:
    needs: trigger
    if: ${{ needs.trigger.outputs.continue == 'true' }} # only run if the trigger job set continue to true
    runs-on: ubuntu-latest

    steps:
      # checkout the project's repository based on the commit SHA provided by the branch-deploy step
      - name: checkout
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ needs.trigger.outputs.sha }}
          persist-credentials: false

      # read the hugo version from the .hugo-version file in this repository
      - name: set hugo version
        id: hugo-version
        run: |
          HUGO_VERSION=$(cat .hugo-version)
          echo "HUGO_VERSION=${HUGO_VERSION}" >> $GITHUB_OUTPUT

      # install the hugo cli using the version detected in the previous step
      - name: install hugo cli
        env:
          HUGO_VERSION: ${{ steps.hugo-version.outputs.HUGO_VERSION }}
        run: |
          wget -O ${{ runner.temp }}/hugo.deb https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_${HUGO_VERSION}_linux-amd64.deb \
          && sudo dpkg -i ${{ runner.temp }}/hugo.deb

      # configure the GitHub Pages action
      - name: setup pages
        id: pages
        uses: actions/configure-pages@c5a3e1159e0cbdf0845eb8811bd39e39fc3099c2 # pin@v2.1.3

      # build the site with hugo
      - name: build with hugo
        env:
          BASE_URL: ${{ steps.pages.outputs.base_url }}
        run: |
          hugo --gc --verbose \
            --baseURL "$BASE_URL"

      # this step is custom to my blog and adds a 'commit' version to the site
      - name: write build version
        run: echo ${GITHUB_SHA} > ./public/version.txt

      # upload the built site as an artifact for the deploy step
      - name: upload artifact
        uses: actions/upload-pages-artifact@253fd476ed429e83b7aae64a92a75b4ceb1a17cf # pin@v1.0.7
        with:
          path: ./public

  # deploy to GitHub Pages
  deploy:
    needs: [trigger, build]
    if: ${{ needs.trigger.outputs.continue == 'true' }} # only run if the trigger job set continue to true
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest

    steps:
      # deploy the site to GitHub Pages
      - name: deploy
        id: deployment
        uses: actions/deploy-pages@20a4baa1095bad40ba7d6ca0d9abbc220b76603f # pin@v1.2.3

  # update the deployment result - manually complete the deployment that was created by the branch-deploy action
  result:
    needs: [trigger, build, deploy]
    runs-on: ubuntu-latest
    # run even on failures but only if the trigger job set continue to true
    if: ${{ always() && needs.trigger.outputs.continue == 'true' }}

    steps:
      # if a previous step failed, set a variable to use as the deployment status
      - name: set deployment status
        id: deploy-status
        if:
          ${{ needs.trigger.result == 'failure' || needs.build.result == 'failure' ||
          needs.deploy.result == 'failure' }}
        run: |
          echo "DEPLOY_STATUS=failure" >> $GITHUB_OUTPUT

      # use the GitHub CLI to update the deployment status that was initiated by the branch-deploy action
      - name: Create a deployment status
        env:
          DEPLOYMENT_ID: ${{ needs.trigger.outputs.deployment_id }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          DEPLOY_STATUS: ${{ steps.deploy-status.outputs.DEPLOY_STATUS }}
          ENVIRONMENT: ${{ needs.trigger.outputs.environment }}
        run: |
          if [ -z "${DEPLOY_STATUS}" ]; then
            DEPLOY_STATUS="success"
          fi

          gh api \
            --method POST \
            "repos/{owner}/{repo}/deployments/${DEPLOYMENT_ID}/statuses" \
            -f environment="${ENVIRONMENT}" \
            -f state="${DEPLOY_STATUS}"

      # use the GitHub CLI to remove the non-sticky lock that was created by the branch-deploy action
      - name: Remove a non-sticky lock
        env:
          COMMENT_ID: ${{ needs.trigger.outputs.comment_id }}
          ENVIRONMENT: ${{ needs.trigger.outputs.environment }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
          LOCK_ACTOR: ${{ github.actor }}
          LOCK_REF_SHA: ${{ needs.trigger.outputs.lock_ref_sha }}
        run: |
          if [ -z "${LOCK_REF_SHA}" ]; then
            echo "No captured deployment lock remains"
            exit 0
          fi

          lock_branch="$(printf '%s' "$ENVIRONMENT" | jq -Rsr 'gsub("\\s"; "-")')-branch-deploy-lock"
          lock_contents="$(gh api --method GET "repos/{owner}/{repo}/contents/lock.json?ref=${LOCK_REF_SHA}" --jq '.content' | base64 --decode)"
          lock_link="${GITHUB_SERVER_URL}/${GH_REPO}/pull/${ISSUE_NUMBER}#issuecomment-${COMMENT_ID}"

          if ! printf '%s' "$lock_contents" | jq -e \
            --arg actor "$LOCK_ACTOR" \
            --arg environment "$ENVIRONMENT" \
            --arg link "$lock_link" \
            '.created_by == $actor and .environment == $environment and .global == false and .sticky == false and .link == $link' >/dev/null; then
            echo "The captured deployment lock is sticky or belongs to another deployment"
            exit 0
          fi

          repository_id="$(gh api --method GET 'repos/{owner}/{repo}' --jq '.node_id')"
          if gh api graphql \
            -f query='mutation($repository: ID!, $name: GitRefname!, $before: GitObjectID!) { updateRefs(input: {repositoryId: $repository, refUpdates: [{name: $name, beforeOid: $before, afterOid: "0000000000000000000000000000000000000000"}]}) { clientMutationId } }' \
            -f repository="$repository_id" \
            -f name="refs/heads/${lock_branch}" \
            -f before="$LOCK_REF_SHA" >/dev/null; then
            echo "Removed the original deployment lock"
          else
            echo "::warning::The original deployment lock changed; leaving the current lock in place"
          fi

      # remove the default 'eyes' reaction from the comment that triggered the deployment
      # this reaction is added by the branch-deploy action by default
      - name: remove eyes reaction
        env:
          COMMENT_ID: ${{ needs.trigger.outputs.comment_id }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          INITIAL_REACTION_ID: ${{ needs.trigger.outputs.initial_reaction_id }}
        run: |
          if [ -n "${INITIAL_REACTION_ID}" ]; then
            gh api \
              --method DELETE \
              "repos/{owner}/{repo}/issues/comments/${COMMENT_ID}/reactions/${INITIAL_REACTION_ID}"
          fi

      # if the deployment was successful, add a 'rocket' reaction to the comment that triggered the deployment
      - name: rocket reaction
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS != 'failure' }}
        uses: GrantBirki/comment@e6bf4bc177996c9572b4ddb98b25eb1a80f9abc9 # pin@v2.0.7
        with:
          comment-id: ${{ needs.trigger.outputs.comment_id }}
          reactions: rocket

      # if the deployment failed, add a '-1' (thumbs down) reaction to the comment that triggered the deployment
      - name: failure reaction
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS == 'failure' }}
        uses: GrantBirki/comment@e6bf4bc177996c9572b4ddb98b25eb1a80f9abc9 # pin@v2.0.7
        with:
          comment-id: ${{ needs.trigger.outputs.comment_id }}
          reactions: '-1'

      # if the deployment was successful, add a 'success' comment
      - name: success comment
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS != 'failure' }}
        uses: peter-evans/create-or-update-comment@67dcc547d311b736a8e6c5c236542148a47adc3d # pin@v2.1.1
        with:
          issue-number: ${{ github.event.issue.number }}
          body: |
            ### Deployment Results ✅

            **${{ needs.trigger.outputs.actor_handle }}** successfully deployed `${{ needs.trigger.outputs.sha }}` to **${{ needs.trigger.outputs.environment }}**

            > [View Live Deployment](${{ env.blog_url }}) :link:

      # if the deployment was not successful, add a 'failure' comment
      - name: failure comment
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS == 'failure' }}
        uses: peter-evans/create-or-update-comment@67dcc547d311b736a8e6c5c236542148a47adc3d # pin@v2.1.1
        with:
          issue-number: ${{ github.event.issue.number }}
          body: |
            ### Deployment Results ❌

            **${{ needs.trigger.outputs.actor_handle }}** had a failure when deploying `${{ needs.trigger.outputs.sha }}` to **${{ needs.trigger.outputs.environment }}**
```

## Multiple Jobs with GitHub Pages and Astro

A detailed example using multiple jobs, custom deployment status creation, non-sticky lock removal, and comments - Using [Astro](https://astro.build) to create a static site and deploying to [GitHub Pages](https://pages.github.com/)

> A live example can be found [here](https://github.com/GrantBirki/astrowind-hard-fork/blob/be29d05cc0f3fe04e37ade9d38c653ed55c6cf53/.github/workflows/branch-deploy.yml)

```yaml
name: branch deploy

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
  statuses: read
  pages: write
  id-token: write

# set an environment variable for use in the jobs pointing the site_url
env:
  site_url: https://test.example.com # <--- change this to your site url

jobs:
  # branch-deploy trigger job
  trigger:
    if: # only run on pull request comments and very specific comment body string as defined in our branch-deploy settings
      ${{ github.event.issue.pull_request &&
      (contains(github.event.comment.body, '.deploy') ||
      contains(github.event.comment.body, '.lock') ||
      contains(github.event.comment.body, '.noop') ||
      contains(github.event.comment.body, '.help') ||
      contains(github.event.comment.body, '.wcid') ||
      contains(github.event.comment.body, '.unlock')) }}
    runs-on: ubuntu-latest
    outputs: # set outputs for use in downstream jobs
      continue: ${{ steps.branch-deploy.outputs.continue }}
      noop: ${{ steps.branch-deploy.outputs.noop }}
      deployment_id: ${{ steps.branch-deploy.outputs.deployment_id }}
      environment: ${{ steps.branch-deploy.outputs.environment }}
      lock_ref_sha: ${{ steps.capture-lock.outputs.sha }}
      sha: ${{ steps.branch-deploy.outputs.sha }}
      comment_id: ${{ steps.branch-deploy.outputs.comment_id }}
      initial_reaction_id: ${{ steps.branch-deploy.outputs.initial_reaction_id }}
      actor_handle: ${{ steps.branch-deploy.outputs.actor_handle }}

    steps:
      # execute the branch-deploy action
      - uses: github/branch-deploy@vX.X.X
        id: branch-deploy
        with:
          trigger: '.deploy'
          environment: 'github-pages'
          production_environments: 'github-pages'
          environment_targets: 'github-pages'
          skip_completing: true # we will complete the deployment manually in the 'result' job
          admins: 'false' # <--- add your GitHub username here (if you want to use the admins feature)

      - name: Capture deployment lock
        id: capture-lock
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        env:
          ENVIRONMENT: ${{ steps.branch-deploy.outputs.environment }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
        run: |
          lock_branch="$(printf '%s' "$ENVIRONMENT" | jq -Rsr 'gsub("\\s"; "-")')-branch-deploy-lock"
          if lock_ref_sha="$(gh api --method GET "repos/{owner}/{repo}/git/ref/heads/${lock_branch}" --jq '.object.sha' 2>/dev/null)"; then
            printf 'sha=%s\n' "$lock_ref_sha" >> "$GITHUB_OUTPUT"
          else
            echo "::warning::Could not capture the original deployment lock; manual lock cleanup will be skipped"
          fi

  # build the github-pages site with Astro
  build:
    needs: trigger
    if: ${{ needs.trigger.outputs.continue == 'true' }} # only run if the trigger job set continue to true
    runs-on: ubuntu-latest

    steps:
      - name: checkout
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ needs.trigger.outputs.sha }}
          persist-credentials: false

      - name: build with astro
        uses: withastro/action@e3193ac80e18917ceaeb9f2d47019ad3b2c0416a # pin@v0.3.0

  # deploy to GitHub Pages
  deploy:
    needs: [trigger, build]
    if: ${{ needs.trigger.outputs.continue == 'true' }} # only run if the trigger job set continue to true
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest

    steps:
      # deploy the site to GitHub Pages
      - name: deploy
        id: deployment
        uses: actions/deploy-pages@497da40f5225e762159b457c9ae5d6f75a136f5c # pin@v1.2.5

  # update the deployment result - manually complete the deployment that was created by the branch-deploy action
  result:
    needs: [trigger, build, deploy]
    runs-on: ubuntu-latest
    # run even on failures but only if the trigger job set continue to true
    if: ${{ always() && needs.trigger.outputs.continue == 'true' }}

    steps:
      # if a previous step failed, set a variable to use as the deployment status
      - name: set deployment status
        id: deploy-status
        if:
          ${{ needs.trigger.result == 'failure' || needs.build.result == 'failure' ||
          needs.deploy.result == 'failure' }}
        run: |
          echo "DEPLOY_STATUS=failure" >> $GITHUB_OUTPUT

      # use the GitHub CLI to update the deployment status that was initiated by the branch-deploy action
      - name: Create a deployment status
        env:
          DEPLOYMENT_ID: ${{ needs.trigger.outputs.deployment_id }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          DEPLOY_STATUS: ${{ steps.deploy-status.outputs.DEPLOY_STATUS }}
          ENVIRONMENT: ${{ needs.trigger.outputs.environment }}
        run: |
          if [ -z "${DEPLOY_STATUS}" ]; then
            DEPLOY_STATUS="success"
          fi

          gh api \
            --method POST \
            "repos/{owner}/{repo}/deployments/${DEPLOYMENT_ID}/statuses" \
            -f environment="${ENVIRONMENT}" \
            -f state="${DEPLOY_STATUS}"

      # use the GitHub CLI to remove the non-sticky lock that was created by the branch-deploy action
      - name: Remove a non-sticky lock
        env:
          COMMENT_ID: ${{ needs.trigger.outputs.comment_id }}
          ENVIRONMENT: ${{ needs.trigger.outputs.environment }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
          LOCK_ACTOR: ${{ github.actor }}
          LOCK_REF_SHA: ${{ needs.trigger.outputs.lock_ref_sha }}
        run: |
          if [ -z "${LOCK_REF_SHA}" ]; then
            echo "No captured deployment lock remains"
            exit 0
          fi

          lock_branch="$(printf '%s' "$ENVIRONMENT" | jq -Rsr 'gsub("\\s"; "-")')-branch-deploy-lock"
          lock_contents="$(gh api --method GET "repos/{owner}/{repo}/contents/lock.json?ref=${LOCK_REF_SHA}" --jq '.content' | base64 --decode)"
          lock_link="${GITHUB_SERVER_URL}/${GH_REPO}/pull/${ISSUE_NUMBER}#issuecomment-${COMMENT_ID}"

          if ! printf '%s' "$lock_contents" | jq -e \
            --arg actor "$LOCK_ACTOR" \
            --arg environment "$ENVIRONMENT" \
            --arg link "$lock_link" \
            '.created_by == $actor and .environment == $environment and .global == false and .sticky == false and .link == $link' >/dev/null; then
            echo "The captured deployment lock is sticky or belongs to another deployment"
            exit 0
          fi

          repository_id="$(gh api --method GET 'repos/{owner}/{repo}' --jq '.node_id')"
          if gh api graphql \
            -f query='mutation($repository: ID!, $name: GitRefname!, $before: GitObjectID!) { updateRefs(input: {repositoryId: $repository, refUpdates: [{name: $name, beforeOid: $before, afterOid: "0000000000000000000000000000000000000000"}]}) { clientMutationId } }' \
            -f repository="$repository_id" \
            -f name="refs/heads/${lock_branch}" \
            -f before="$LOCK_REF_SHA" >/dev/null; then
            echo "Removed the original deployment lock"
          else
            echo "::warning::The original deployment lock changed; leaving the current lock in place"
          fi

      # remove the default 'eyes' reaction from the comment that triggered the deployment
      # this reaction is added by the branch-deploy action by default
      - name: remove eyes reaction
        env:
          COMMENT_ID: ${{ needs.trigger.outputs.comment_id }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
          INITIAL_REACTION_ID: ${{ needs.trigger.outputs.initial_reaction_id }}
        run: |
          if [ -n "${INITIAL_REACTION_ID}" ]; then
            gh api \
              --method DELETE \
              "repos/{owner}/{repo}/issues/comments/${COMMENT_ID}/reactions/${INITIAL_REACTION_ID}"
          fi

      # if the deployment was successful, add a 'rocket' reaction to the comment that triggered the deployment
      - name: rocket reaction
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS != 'failure' }}
        uses: GrantBirki/comment@e6bf4bc177996c9572b4ddb98b25eb1a80f9abc9 # pin@v2.0.7
        with:
          comment-id: ${{ needs.trigger.outputs.comment_id }}
          reactions: rocket

      # if the deployment failed, add a '-1' (thumbs down) reaction to the comment that triggered the deployment
      - name: failure reaction
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS == 'failure' }}
        uses: GrantBirki/comment@e6bf4bc177996c9572b4ddb98b25eb1a80f9abc9 # pin@v2.0.7
        with:
          comment-id: ${{ needs.trigger.outputs.comment_id }}
          reactions: '-1'

      # if the deployment was successful, add a 'success' comment
      - name: success comment
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS != 'failure' }}
        uses: peter-evans/create-or-update-comment@67dcc547d311b736a8e6c5c236542148a47adc3d # pin@v2.1.1
        with:
          issue-number: ${{ github.event.issue.number }}
          body: |
            ### Deployment Results ✅

            **${{ needs.trigger.outputs.actor_handle }}** successfully deployed `${{ needs.trigger.outputs.sha }}` to **${{ needs.trigger.outputs.environment }}**

            > [View Live Deployment](${{ env.site_url }}) :link:

      # if the deployment was not successful, add a 'failure' comment
      - name: failure comment
        if: ${{ steps.deploy-status.outputs.DEPLOY_STATUS == 'failure' }}
        uses: peter-evans/create-or-update-comment@67dcc547d311b736a8e6c5c236542148a47adc3d # pin@v2.1.1
        with:
          issue-number: ${{ github.event.issue.number }}
          body: |
            ### Deployment Results ❌

            **${{ needs.trigger.outputs.actor_handle }}** had a failure when deploying `${{ needs.trigger.outputs.sha }}` to **${{ needs.trigger.outputs.environment }}**
```

## Multiple Jobs with GitHub Environments

A detailed example using multiple jobs, [repository environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment), and Terraform. As mentioned in the [README](https://github.com/github/branch-deploy#about-environments-), a deployment completes when the workflow targeting that environment completes. In this example, the branch deployment action targets a separate environment than the "actual" deployment logic, which lets us control the completion of the branch deployment while being able to manage environments separately.

```yaml
name: Branch Deploy

on:
  issue_comment:
    types:
      - created

env:
  # These variables are scoped to the **repository**.
  TF_VAR_image_repository: ${{ vars.IMAGE_REPOSITORY }}

permissions:
  checks: read
  statuses: read
  contents: write
  deployments: write
  packages: read
  pull-requests: write

jobs:
  start:
    name: Start Branch Deployment
    runs-on: ubuntu-latest

    # Only start branch deployments on pull request comments.
    if: ${{ github.event.issue.pull_request }}

    # The deployments environment is used by the branch-deploy workflow.
    environment: deployments

    # Set the outputs to be used by the rest of the workflow.
    outputs:
      continue: ${{ steps.branch-deploy.outputs.continue }}
      noop: ${{ steps.branch-deploy.outputs.noop }}
      deployment_id: ${{ steps.branch-deploy.outputs.deployment_id }}
      environment: ${{ steps.branch-deploy.outputs.environment }}
      lock_ref_sha: ${{ steps.capture-lock.outputs.sha }}
      sha: ${{ steps.branch-deploy.outputs.sha }}
      comment_id: ${{ steps.branch-deploy.outputs.comment_id }}
      initial_reaction_id: ${{ steps.branch-deploy.outputs.initial_reaction_id }}
      actor_handle: ${{ steps.branch-deploy.outputs.actor_handle }}

    steps:
      - name: Start Branch Deployment
        id: branch-deploy
        uses: github/branch-deploy@vX.X.X
        with:
          environment: development
          environment_targets: development,staging,production
          skip_completing: true

      - name: Capture deployment lock
        id: capture-lock
        if: ${{ steps.branch-deploy.outputs.continue == 'true' }}
        env:
          ENVIRONMENT: ${{ steps.branch-deploy.outputs.environment }}
          GH_REPO: ${{ github.repository }}
          GH_TOKEN: ${{ github.token }}
        run: |
          lock_branch="$(printf '%s' "$ENVIRONMENT" | jq -Rsr 'gsub("\\s"; "-")')-branch-deploy-lock"
          if lock_ref_sha="$(gh api --method GET "repos/{owner}/{repo}/git/ref/heads/${lock_branch}" --jq '.object.sha' 2>/dev/null)"; then
            printf 'sha=%s\n' "$lock_ref_sha" >> "$GITHUB_OUTPUT"
          else
            echo "::warning::Could not capture the original deployment lock; manual lock cleanup will be skipped"
          fi

  # This is the "actual" deployment logic. It uses the environment specified in
  # the branch deployment comment (e.g. `.deploy to development`).
  deploy:
    needs: start

    name: Deploy
    runs-on: ubuntu-latest

    # Only start after the branch deployment has initialized.
    if: ${{ needs.start.outputs.continue == 'true' }}

    # Use the environment specified by the `.noop` or `.deploy` comment.
    environment: ${{ needs.start.outputs.environment }}

    # Set the default working directory to `tf/` (or wherever your Terraform
    # code is located in your repository).
    defaults:
      run:
        working-directory: tf/

    # Set the deployment outcome based on if `terraform plan` (.noop) or
    # `terraform apply` (.deploy) succeeded. Defaults to 'failure'.
    outputs:
      outcome: ${{ (steps.plan.outcome == 'success' || steps.apply.outcome == 'success') && 'success' || 'failure' }}

    # These variables/secrets are scoped to the **environment**.
    env:
      ARM_CLIENT_ID: ${{ secrets.ARM_CLIENT_ID }}
      ARM_SUBSCRIPTION_ID: ${{ secrets.ARM_SUBSCRIPTION_ID }}
      ARM_TENANT_ID: ${{ secrets.ARM_TENANT_ID }}
      TF_VAR_location: ${{ vars.AZURE_LOCATION }}

    steps:
      - name: Checkout
        id: checkout
        uses: actions/checkout@v7.0.0
        with:
          ref: ${{ needs.start.outputs.sha }}
          persist-credentials: false

      # Authenticate to Azure using OpenID Connect.
      - name: Authenticate to Azure (OIDC)
        id: azure-oidc
        uses: azure/login@v1
        with:
          client-id: ${{ env.ARM_CLIENT_ID }}
          subscription-id: ${{ env.ARM_SUBSCRIPTION_ID }}
          tenant-id: ${{ env.ARM_TENANT_ID }}

      # Install Terraform on the runner.
      - name: Setup Terraform
        id: setup-terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.5.5

      # This example uses separate Terraform workspaces for each environment.
      - name: Terraform Init
        id: terraform-init
        env:
          ENVIRONMENT: ${{ needs.start.outputs.environment }}
        run: |
          terraform init -no-color
          terraform workspace select -or-create=true "$ENVIRONMENT"

      # If this is a `.noop`, run `terraform plan` to see what would change.
      - name: Terraform Plan
        id: plan
        if: ${{ needs.start.outputs.noop == 'true' }}
        run: terraform plan -no-color
        continue-on-error: true

      # If this is a `.deploy`, run `terraform apply` to apply the changes.
      - name: Terraform Apply
        id: apply
        if: ${{ needs.start.outputs.noop != 'true' }}
        run: terraform apply -no-color -auto-approve
        continue-on-error: true

      # Get the output from the plan/apply step.
      - name: Save Terraform Output
        id: output
        env:
          PLAN_STDOUT: ${{ steps.plan.outputs.stdout }}
          APPLY_STDOUT: ${{ steps.apply.outputs.stdout }}
        run: |
          if [ -z "$PLAN_STDOUT" ]
          then
            echo "$APPLY_STDOUT" > tf_output.txt
          else
            echo "$PLAN_STDOUT" > tf_output.txt
          fi

      # Upload the plan/apply output as an artifact so that it can be used in
      # the `stop` job.
      - name: Upload Terraform Output
        id: upload
        uses: actions/upload-artifact@v3
        with:
          name: tf_output
          path: tf/tf_output.txt

  stop:
    needs:
      - start
      - deploy

    name: Stop Branch Deployment
    runs-on: ubuntu-latest

    # Always run this job if the branch deployment was started.
    if: ${{ always() && needs.start.outputs.continue == 'true' }}

    # Switch back to the deployments environment to update the branch
    # deployment status.
    environment: deployments

    # Get the outputs from the `start` job. These are needed to finish the
    # branch deployment, comment on the PR, update reactions, etc.
    env:
      ACTOR: ${{ needs.start.outputs.actor_handle }}
      COMMENT_ID: ${{ needs.start.outputs.comment_id }}
      DEPLOYMENT_ID: ${{ needs.start.outputs.deployment_id }}
      DEPLOYMENT_STATUS: ${{ needs.deploy.outputs.outcome || 'failure' }}
      ENVIRONMENT: ${{ needs.start.outputs.environment }}
      GH_REPO: ${{ github.repository }}
      GH_TOKEN: ${{ github.token }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      INITIAL_REACTION_ID: ${{ needs.start.outputs.initial_reaction_id }}
      ISSUE_NUMBER: ${{ github.event.issue.number }}
      LOCK_ACTOR: ${{ github.actor }}
      LOCK_REF_SHA: ${{ needs.start.outputs.lock_ref_sha }}
      NOOP: ${{ needs.start.outputs.noop }}
      SHA: ${{ needs.start.outputs.sha }}
      REPOSITORY: ${{ github.repository }}

    steps:
      # Tf this was not a `.noop` deployment, set the status.
      - if: ${{ env.NOOP != 'true' }}
        name: Set Deployment Status
        id: set-status
        run: |
          gh api --method POST \
            "repos/${REPOSITORY}/deployments/${DEPLOYMENT_ID}/statuses" \
            -f environment="${ENVIRONMENT}" \
            -f state="${DEPLOYMENT_STATUS}"

      # Remove the non-sticky lock for either a `.noop` or `.deploy`.
      - name: Remove Non-Sticky Lock
        id: remove-lock
        run: |
          if [ -z "${LOCK_REF_SHA}" ]; then
            echo "No captured deployment lock remains"
            exit 0
          fi

          lock_branch="$(printf '%s' "$ENVIRONMENT" | jq -Rsr 'gsub("\\s"; "-")')-branch-deploy-lock"
          lock_contents="$(gh api --method GET "repos/{owner}/{repo}/contents/lock.json?ref=${LOCK_REF_SHA}" --jq '.content' | base64 --decode)"
          lock_link="${GITHUB_SERVER_URL}/${GH_REPO}/pull/${ISSUE_NUMBER}#issuecomment-${COMMENT_ID}"

          if ! printf '%s' "$lock_contents" | jq -e \
            --arg actor "$LOCK_ACTOR" \
            --arg environment "$ENVIRONMENT" \
            --arg link "$lock_link" \
            '.created_by == $actor and .environment == $environment and .global == false and .sticky == false and .link == $link' >/dev/null; then
            echo "The captured deployment lock is sticky or belongs to another deployment"
            exit 0
          fi

          repository_id="$(gh api --method GET 'repos/{owner}/{repo}' --jq '.node_id')"
          if gh api graphql \
            -f query='mutation($repository: ID!, $name: GitRefname!, $before: GitObjectID!) { updateRefs(input: {repositoryId: $repository, refUpdates: [{name: $name, beforeOid: $before, afterOid: "0000000000000000000000000000000000000000"}]}) { clientMutationId } }' \
            -f repository="$repository_id" \
            -f name="refs/heads/${lock_branch}" \
            -f before="$LOCK_REF_SHA" >/dev/null; then
            echo "Removed the original deployment lock"
          else
            echo "::warning::The original deployment lock changed; leaving the current lock in place"
          fi

      # Remove the trigger reaction added to the user's comment.
      - name: Remove Trigger Reaction
        id: remove-reaction
        run: |
          if [ -n "${INITIAL_REACTION_ID}" ]; then
            gh api --method DELETE \
              "repos/${REPOSITORY}/issues/comments/${COMMENT_ID}/reactions/${INITIAL_REACTION_ID}"
          fi

      # Add a new reaction based on if the deployment succeeded or failed.
      - name: Add Reaction
        id: add-reaction
        uses: GrantBirki/comment@e6bf4bc177996c9572b4ddb98b25eb1a80f9abc9 # pin@v2.0.7
        env:
          REACTION: ${{ env.DEPLOYMENT_STATUS == 'success' && 'rocket' || '-1' }}
        with:
          comment-id: ${{ env.COMMENT_ID }}
          reactions: ${{ env.DEPLOYMENT_STATUS == 'success' && 'rocket' || '-1' }}

      # If the plan/apply didn't run because of a failure, this step will also
      # fail, hence setting continue-on-error.
      - name: Get Terraform Output Artifact
        id: get-artifact
        uses: actions/download-artifact@v3
        with:
          name: tf_output
        continue-on-error: true

      # Add a success comment, including the plan/apply output (if present).
      - if: ${{ env.DEPLOYMENT_STATUS == 'success' }}
        name: Add Success Comment
        id: success-comment
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs')

            let output
            try { output = fs.readFileSync('tf_output.txt', 'utf8') }
            catch (err) { output = 'No Terraform output!' }

            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `### Deployment Results :white_check_mark:

            **${process.env.ACTOR}** successfully ${ process.env.NOOP === 'true' ? '**noop** deployed' : 'deployed' } sha \`${process.env.SHA}\` to **${process.env.ENVIRONMENT}**

            <details><summary>Show Results</summary>

            \`\`\`terraform\n${ output }\n\`\`\`

            </details>`
            })

      # Add a failure comment, including the plan/apply output (if present).
      - if: ${{ env.DEPLOYMENT_STATUS == 'failure' }}
        name: Add Failure Comment
        id: failure-comment
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs')

            let output
            try { output = fs.readFileSync('tf_output.txt', 'utf8') }
            catch (err) { output = 'No Terraform output!' }

            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `### Deployment Results :x:

            **${process.env.ACTOR}** had a failure when ${ process.env.NOOP === 'true' ? '**noop** deploying' : 'deploying' } sha \`${process.env.SHA}\` to **${process.env.ENVIRONMENT}**

            <details><summary>Show Results</summary>

            \`\`\`terraform\n${ output }\n\`\`\`

            </details>`
            })

      # If the deployment failed, fail the workflow.
      - if: ${{ env.DEPLOYMENT_STATUS == 'failure' }}
        name: Fail Workflow
        id: fail-workflow
        run: |
          echo "There was a deployment problem...failing the workflow!"
          exit 1
```

---

Are you using the `branch-deploy` Action and want your example included here? Open a pull request and we'll add it!
