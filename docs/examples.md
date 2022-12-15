# Examples

This section contains real world and common examples of how you could use this Action

> Note: In all examples, we will be using `uses: github/branch-deploy@vX.X.X`. Replace `X.X.X` with the [latest version](https://github.com/marketplace/actions/branch-deploy) of this Action

## Simple Example

This is the simpliest possible example of how you could use the branch-deploy Action for reference

- `.deploy noop` has no effect here (but you could change that)
- `.deploy` will deploy the current branch (you can configure deployments however you like, this is just an example)

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
      - uses: actions/checkout@2541b1294d2704b0964813337f33b291d3f8596b # pin@v3.0.2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

        # If the branch-deploy Action was triggered, run the deployment (i.e. '.deploy')
      - name: deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        run: <do-your-deployment> # this could be anything you want
```

## Terraform

This example shows how you could use this Action with [Terraform](https://www.terraform.io/)

- `.deploy noop` triggers a Terraform plan
- `.deploy` triggers a Terraform apply

All deployment results get posted as a comment in the branch deploy output on your pull request

> A live example can be found [here](https://github.com/the-hideout/cloudflare/blob/de0682c6fe0640a9af122306354b9ea9694ca7a2/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [ created ]

# The working directory where our Terraform files are located
env:
  WORKING_DIR: terraform/

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write 
  checks: read

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
        uses: actions/checkout@ec3a7ce113134d7a93b817d10a8272cb61118579 # pin@v2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

        # Setup Terraform on our Actions runner
      - uses: hashicorp/setup-terraform@ed3a0531877aca392eb870f440d9ae7aba83a6bd # pin@v1
        if: steps.branch-deploy.outputs.continue == 'true'
        with:
          terraform_version: 1.1.7
          cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}

        # Run Terraform init in our working directory
      - name: Terraform init
        if: steps.branch-deploy.outputs.continue == 'true'
        run: terraform init

        # If '.deploy noop' was used, run a Terraform plan
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

## Heroku

This example shows how you could use this Action with [Heroku](https://heroku.com)

- `.deploy noop` has no effect here (but you could change that)
- `.deploy` takes your current branch and deploys it to Heroku

> A live example can be found [here](https://github.com/the-hideout/stash/blob/3d8cd979d124bd13878c4bc92f74f3830cf53c22/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [ created ]

permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read

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
        uses: actions/checkout@7884fcad6b5d53d10323aee724dc68d8b9096a2e # pin@v2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

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

- `.deploy noop` has no effect here (but you could change that)
- `.deploy` takes your current branch and deploys it to Railway

> A live example can be found [here](https://github.com/the-hideout/stash/blob/57d85e2092866b675a73ff23203c04962df12385/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [ created ]

permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read

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
        uses: actions/checkout@7884fcad6b5d53d10323aee724dc68d8b9096a2e # pin@v2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

        # Install the Railway CLI through npm
      - name: Install Railway
        run: npm i -g @railway/cli

        # Deploy our branch to Railway
      - name: Deploy to Railway
        if: steps.branch-deploy.outputs.continue == 'true'
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

## SSH

This example shows how you could use this Action with SSH

You can define any commands you want to be run in your SSH Action and they would be gated by the branch-deploy Action.

- `.deploy noop` has no effect here (but you could change that)
- `.deploy` runs the SSH action with your branch

> A live example can be found [here](https://github.com/the-hideout/cache/blob/c7dc4fa550f137efebf0ee656413985afba66770/.github/workflows/branch-deploy.yml)

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
        uses: actions/checkout@7884fcad6b5d53d10323aee724dc68d8b9096a2e # pin@v2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

        # Deploy our branch via SSH remote commands
      - name: SSH Remote Deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' }}
        uses: appleboy/ssh-action@1d1b21ca96111b1eb4c03c21c14ebb971d2200f6 # pin@v0.1.4
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

> A live example can be found [here](https://github.com/the-hideout/tarkov-dev/blob/3dc501f0117b9a482cfe0954fda75b1b7e2e0cc4/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [ created ]

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read

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
        uses: actions/checkout@7884fcad6b5d53d10323aee724dc68d8b9096a2e # pin@v2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

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
        uses: cloudflare/wrangler-action@4c10c1822abba527d820b29e6333e7f5dac2cabd # pin@2.0.0
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: pages publish build/ --project-name=<your-cloudflare-project-name>

        # If '.deploy' was used, branch deploy to the production environment
      - name: deploy - prod
        id: prod-deploy
        if: ${{ steps.branch-deploy.outputs.continue == 'true' && steps.branch-deploy.outputs.noop != 'true' && steps.branch-deploy.outputs.environment == 'production' }}
        uses: cloudflare/wrangler-action@4c10c1822abba527d820b29e6333e7f5dac2cabd # pin@2.0.0
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: pages publish build/ --project-name=<your-cloudflare-project-name> --branch=main
```

## Cloudflare Workers

This example shows how you could use this Action with [Cloudflare Workers](https://workers.cloudflare.com/)

- `.deploy to development` deploys your branch to the development environment (if you have one with your Cloudflare workers)
- `.deploy` deploys your branch to the production environment

> A live example can be found [here](https://github.com/the-hideout/tarkov-api/blob/8333e038ecf8831128732871e6137435792a5f63/.github/workflows/branch-deploy.yml)

```yaml
name: branch-deploy

on:
  issue_comment:
    types: [ created ]

# Permissions needed for reacting and adding comments for IssueOps commands
permissions:
  pull-requests: write
  deployments: write
  contents: write
  checks: read

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
        uses: actions/checkout@7884fcad6b5d53d10323aee724dc68d8b9096a2e # pin@v2
        with:
          ref: ${{ steps.branch-deploy.outputs.ref }}

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
        uses: cloudflare/wrangler-action@3424d15af26edad39d5276be3cc0cc9ffec22b55 # pin@1.3.0
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          environment: "development" # here we use development

        # If '.deploy' was used, branch deploy to the production environment
      - name: Publish - Production
        if: ${{ steps.branch-deploy.outputs.continue == 'true' &&
          steps.branch-deploy.outputs.noop != 'true' &&
          steps.branch-deploy.outputs.environment == 'production' }}
        uses: cloudflare/wrangler-action@3424d15af26edad39d5276be3cc0cc9ffec22b55 # pin@1.3.0
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
```

---

Are you using the `branch-deploy` Action and want your example included here? Open a pull request and we'll add it!
