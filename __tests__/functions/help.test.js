import * as core from '@actions/core'
import dedent from 'dedent-js'
import {help} from '../../src/functions/help'
import * as actionStatus from '../../src/functions/action-status'

const debugMock = jest.spyOn(core, 'debug').mockImplementation(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  jest.spyOn(core, 'debug').mockImplementation(() => {})
})

const context = {
  repo: {
    owner: 'corp',
    repo: 'test'
  },
  issue: {
    number: 1
  },
  payload: {
    pull_request: {
      head: {
        ref: 'test'
      }
    }
  }
}
const octokit = {}

const defaultInputs = {
  trigger: '.deploy',
  reaction: 'eyes',
  prefixOnly: 'true',
  environment: 'production',
  stable_branch: 'main',
  noop_trigger: 'noop',
  lock_trigger: '.lock',
  production_environment: 'production',
  environment_targets: 'production,staging,development',
  unlock_trigger: '.unlock',
  help_trigger: '.help',
  lock_info_alias: '.wcid',
  update_branch: 'warn',
  required_contexts: 'false',
  allowForks: 'true',
  skipCi: '',
  skipReviews: '',
  admins: 'false'
}

test('successfully calls help with defaults', async () => {
  expect(await help(octokit, context, 123, defaultInputs))

  const comment = dedent(`
  ## 📚 Branch Deployment Help

  This help message was automatically generated based on the inputs provided to this Action.

  ### 💻 Available Commands

  - \`${defaultInputs.help_trigger}\` - Show this help message
  - \`${defaultInputs.trigger}\` - Deploy this branch to the \`${
    defaultInputs.environment
  }\` environment
  - \`${defaultInputs.trigger} ${
    defaultInputs.stable_branch
  }\` - Rollback the \`${defaultInputs.environment}\` environment to the \`${
    defaultInputs.stable_branch
  }\` branch
  - \`${defaultInputs.trigger} ${
    defaultInputs.noop_trigger
  }\` - Deploy this branch to the \`${
    defaultInputs.environment
  }\` environment in noop mode
  - \`${
    defaultInputs.lock_trigger
  }\` - Obtain the deployment lock (will persist until the lock is released)
  - \`${
    defaultInputs.lock_trigger
  } --reason <text>\` - Obtain the deployment lock with a reason (will persist until the lock is released)
  - \`${
    defaultInputs.unlock_trigger
  }\` - Release the deployment lock (if one exists)
  - \`${
    defaultInputs.lock_trigger
  } --info\` - Show information about the current deployment lock (if one exists)
  - \`${defaultInputs.lock_info_alias}\` - Alias for \`${
    defaultInputs.lock_trigger
  } --info\`

  ### 🌍 Environments

  These are the available environments for this Action as defined by the inputs provided to this Action.

  > Note: Just because an environment is listed here does not mean it is available for deployment

  - \`${defaultInputs.environment}\` - The default environment for this Action
  - \`${
    defaultInputs.production_environment
  }\` - The environment that is considered "production"
  - \`${
    defaultInputs.environment_targets
  }\` - The list of environments that can be targeted for deployment

  ### 🔭 Example Commands

  The following set of examples use this Action's inputs to show you how to use the commands.

  - \`${defaultInputs.trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${defaultInputs.environment}\` environment
  - \`${defaultInputs.trigger} ${
    defaultInputs.stable_branch
  }\` - Rollback the \`${defaultInputs.environment}\` environment to the \`${
    defaultInputs.stable_branch
  }\` branch
  - \`${defaultInputs.trigger} ${defaultInputs.noop_trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${defaultInputs.environment}\` environment in noop mode
  - \`${defaultInputs.trigger} to <${defaultInputs.environment_targets.replace(
    ',',
    '|'
  )}>\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the specified environment (note: the \`to\` keyword is optional)

  ### ⚙️ Configuration

  The following configuration options have been defined for this Action:

  - \`reaction: ${
    defaultInputs.reaction
  }\` - The GitHub reaction icon to add to the deployment comment when a deployment is triggered
  - \`update_branch: ${
    defaultInputs.update_branch
  }\` - This Action will warn if the branch is out of date with the base branch
  - \`required_contexts: ${
    defaultInputs.required_contexts
  }\` - There are no designated required contexts for this Action (default and suggested)
  - \`allowForks: ${defaultInputs.allowForks}\` - This Action will ${
    defaultInputs.allowForks === 'true' ? 'run' : 'not run'
  } on forked repositories
  - \`prefixOnly: ${defaultInputs.prefixOnly}\` - This Action will ${
    defaultInputs.prefixOnly === 'true'
      ? 'only run if the comment starts with the trigger'
      : 'run if the comment contains the trigger anywhere in the comment body'
  }
  - \`skipCi: ${
    defaultInputs.skipCi
  }\` - This Action will require passing CI for all environments
  - \`skipReviews: ${
    defaultInputs.skipReviews
  }\` - This Action will require passing reviews for all environments
  - \`admins: ${
    defaultInputs.admins
  }\` - This Action has no designated admins (default)

  ---

  > View the full usage guide [here](https://github.com/github/branch-deploy/blob/main/docs/usage.md) for additional help
  `)

  expect(debugMock).toHaveBeenCalledWith(comment)
})

test('successfully calls help with non-defaults', async () => {
  const inputs = {
    trigger: '.deploy',
    reaction: 'eyes',
    prefixOnly: 'false',
    environment: 'production',
    stable_branch: 'main',
    noop_trigger: 'noop',
    lock_trigger: '.lock',
    production_environment: 'production',
    environment_targets: 'production,staging,development',
    unlock_trigger: '.unlock',
    help_trigger: '.help',
    lock_info_alias: '.wcid',
    update_branch: 'force',
    required_contexts: 'cat',
    allowForks: 'false',
    skipCi: 'development',
    skipReviews: 'development',
    admins: 'monalisa'
  }

  expect(await help(octokit, context, 123, inputs))

  const comment = dedent(`
  ## 📚 Branch Deployment Help

  This help message was automatically generated based on the inputs provided to this Action.

  ### 💻 Available Commands

  - \`${inputs.help_trigger}\` - Show this help message
  - \`${inputs.trigger}\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.trigger} ${
    inputs.noop_trigger
  }\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment in noop mode
  - \`${
    inputs.lock_trigger
  }\` - Obtain the deployment lock (will persist until the lock is released)
  - \`${
    inputs.lock_trigger
  } --reason <text>\` - Obtain the deployment lock with a reason (will persist until the lock is released)
  - \`${inputs.unlock_trigger}\` - Release the deployment lock (if one exists)
  - \`${
    inputs.lock_trigger
  } --info\` - Show information about the current deployment lock (if one exists)
  - \`${inputs.lock_info_alias}\` - Alias for \`${inputs.lock_trigger} --info\`

  ### 🌍 Environments

  These are the available environments for this Action as defined by the inputs provided to this Action.

  > Note: Just because an environment is listed here does not mean it is available for deployment

  - \`${inputs.environment}\` - The default environment for this Action
  - \`${
    inputs.production_environment
  }\` - The environment that is considered "production"
  - \`${
    inputs.environment_targets
  }\` - The list of environments that can be targeted for deployment

  ### 🔭 Example Commands

  The following set of examples use this Action's inputs to show you how to use the commands.

  - \`${inputs.trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${inputs.environment}\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.trigger} ${inputs.noop_trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${inputs.environment}\` environment in noop mode
  - \`${inputs.trigger} to <${inputs.environment_targets.replace(
    ',',
    '|'
  )}>\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the specified environment (note: the \`to\` keyword is optional)

  ### ⚙️ Configuration

  The following configuration options have been defined for this Action:

  - \`reaction: ${
    inputs.reaction
  }\` - The GitHub reaction icon to add to the deployment comment when a deployment is triggered
  - \`update_branch: ${
    inputs.update_branch
  }\` - This Action will force update the branch to the base branch if it is out of date
  - \`required_contexts: ${
    inputs.required_contexts
  }\` - There are required contexts designated for this Action
  - \`allowForks: ${inputs.allowForks}\` - This Action will ${
    inputs.allowForks === 'true' ? 'run' : 'not run'
  } on forked repositories
  - \`prefixOnly: ${inputs.prefixOnly}\` - This Action will ${
    inputs.prefixOnly === 'true'
      ? 'only run if the comment starts with the trigger'
      : 'run if the comment contains the trigger anywhere in the comment body'
  }
  - \`skipCi: ${
    inputs.skipCi
  }\` - This Action will not require passing CI for the environments specified
  - \`skipReviews: ${
    inputs.skipReviews
  }\` - This Action will not require passing reviews for the environments specified
  - \`admins: ${
    inputs.admins
  }\` - This Action will allow the listed admins to bypass pull request reviews before deployment

  ---

  > View the full usage guide [here](https://github.com/github/branch-deploy/blob/main/docs/usage.md) for additional help
  `)

  expect(debugMock).toHaveBeenCalledWith(comment)
})

test('successfully calls help with non-defaults', async () => {
  const inputs = {
    trigger: '.deploy',
    reaction: 'eyes',
    prefixOnly: 'false',
    environment: 'production',
    stable_branch: 'main',
    noop_trigger: 'noop',
    lock_trigger: '.lock',
    production_environment: 'production',
    environment_targets: 'production,staging,development',
    unlock_trigger: '.unlock',
    help_trigger: '.help',
    lock_info_alias: '.wcid',
    update_branch: 'force',
    required_contexts: 'cat',
    allowForks: 'false',
    skipCi: 'development',
    skipReviews: 'development',
    admins: 'monalisa'
  }

  expect(await help(octokit, context, 123, inputs))

  const comment = dedent(`
  ## 📚 Branch Deployment Help

  This help message was automatically generated based on the inputs provided to this Action.

  ### 💻 Available Commands

  - \`${inputs.help_trigger}\` - Show this help message
  - \`${inputs.trigger}\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.trigger} ${
    inputs.noop_trigger
  }\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment in noop mode
  - \`${
    inputs.lock_trigger
  }\` - Obtain the deployment lock (will persist until the lock is released)
  - \`${
    inputs.lock_trigger
  } --reason <text>\` - Obtain the deployment lock with a reason (will persist until the lock is released)
  - \`${inputs.unlock_trigger}\` - Release the deployment lock (if one exists)
  - \`${
    inputs.lock_trigger
  } --info\` - Show information about the current deployment lock (if one exists)
  - \`${inputs.lock_info_alias}\` - Alias for \`${inputs.lock_trigger} --info\`

  ### 🌍 Environments

  These are the available environments for this Action as defined by the inputs provided to this Action.

  > Note: Just because an environment is listed here does not mean it is available for deployment

  - \`${inputs.environment}\` - The default environment for this Action
  - \`${
    inputs.production_environment
  }\` - The environment that is considered "production"
  - \`${
    inputs.environment_targets
  }\` - The list of environments that can be targeted for deployment

  ### 🔭 Example Commands

  The following set of examples use this Action's inputs to show you how to use the commands.

  - \`${inputs.trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${inputs.environment}\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.trigger} ${inputs.noop_trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${inputs.environment}\` environment in noop mode
  - \`${inputs.trigger} to <${inputs.environment_targets.replace(
    ',',
    '|'
  )}>\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the specified environment (note: the \`to\` keyword is optional)

  ### ⚙️ Configuration

  The following configuration options have been defined for this Action:

  - \`reaction: ${
    inputs.reaction
  }\` - The GitHub reaction icon to add to the deployment comment when a deployment is triggered
  - \`update_branch: ${
    inputs.update_branch
  }\` - This Action will force update the branch to the base branch if it is out of date
  - \`required_contexts: ${
    inputs.required_contexts
  }\` - There are required contexts designated for this Action
  - \`allowForks: ${inputs.allowForks}\` - This Action will ${
    inputs.allowForks === 'true' ? 'run' : 'not run'
  } on forked repositories
  - \`prefixOnly: ${inputs.prefixOnly}\` - This Action will ${
    inputs.prefixOnly === 'true'
      ? 'only run if the comment starts with the trigger'
      : 'run if the comment contains the trigger anywhere in the comment body'
  }
  - \`skipCi: ${
    inputs.skipCi
  }\` - This Action will not require passing CI for the environments specified
  - \`skipReviews: ${
    inputs.skipReviews
  }\` - This Action will not require passing reviews for the environments specified
  - \`admins: ${
    inputs.admins
  }\` - This Action will allow the listed admins to bypass pull request reviews before deployment

  ---

  > View the full usage guide [here](https://github.com/github/branch-deploy/blob/main/docs/usage.md) for additional help
  `)

  expect(debugMock).toHaveBeenCalledWith(comment)

  var inputsSecond = inputs
  inputsSecond.update_branch = 'disabled'
  expect(await help(octokit, context, 123, inputsSecond))

  const commentSecond = dedent(`
  ## 📚 Branch Deployment Help

  This help message was automatically generated based on the inputs provided to this Action.

  ### 💻 Available Commands

  - \`${inputs.help_trigger}\` - Show this help message
  - \`${inputs.trigger}\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.trigger} ${
    inputs.noop_trigger
  }\` - Deploy this branch to the \`${
    inputs.environment
  }\` environment in noop mode
  - \`${
    inputs.lock_trigger
  }\` - Obtain the deployment lock (will persist until the lock is released)
  - \`${
    inputs.lock_trigger
  } --reason <text>\` - Obtain the deployment lock with a reason (will persist until the lock is released)
  - \`${inputs.unlock_trigger}\` - Release the deployment lock (if one exists)
  - \`${
    inputs.lock_trigger
  } --info\` - Show information about the current deployment lock (if one exists)
  - \`${inputs.lock_info_alias}\` - Alias for \`${inputs.lock_trigger} --info\`

  ### 🌍 Environments

  These are the available environments for this Action as defined by the inputs provided to this Action.

  > Note: Just because an environment is listed here does not mean it is available for deployment

  - \`${inputs.environment}\` - The default environment for this Action
  - \`${
    inputs.production_environment
  }\` - The environment that is considered "production"
  - \`${
    inputs.environment_targets
  }\` - The list of environments that can be targeted for deployment

  ### 🔭 Example Commands

  The following set of examples use this Action's inputs to show you how to use the commands.

  - \`${inputs.trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${inputs.environment}\` environment
  - \`${inputs.trigger} ${inputs.stable_branch}\` - Rollback the \`${
    inputs.environment
  }\` environment to the \`${inputs.stable_branch}\` branch
  - \`${inputs.trigger} ${inputs.noop_trigger}\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the \`${inputs.environment}\` environment in noop mode
  - \`${inputs.trigger} to <${inputs.environment_targets.replace(
    ',',
    '|'
  )}>\` - Deploy the \`${
    context.payload.pull_request.head.ref
  }\` branch to the specified environment (note: the \`to\` keyword is optional)

  ### ⚙️ Configuration

  The following configuration options have been defined for this Action:

  - \`reaction: ${
    inputs.reaction
  }\` - The GitHub reaction icon to add to the deployment comment when a deployment is triggered
  - \`update_branch: ${
    inputs.update_branch
  }\` - This Action will not update the branch to the base branch before deployment
  - \`required_contexts: ${
    inputs.required_contexts
  }\` - There are required contexts designated for this Action
  - \`allowForks: ${inputs.allowForks}\` - This Action will ${
    inputs.allowForks === 'true' ? 'run' : 'not run'
  } on forked repositories
  - \`prefixOnly: ${inputs.prefixOnly}\` - This Action will ${
    inputs.prefixOnly === 'true'
      ? 'only run if the comment starts with the trigger'
      : 'run if the comment contains the trigger anywhere in the comment body'
  }
  - \`skipCi: ${
    inputs.skipCi
  }\` - This Action will not require passing CI for the environments specified
  - \`skipReviews: ${
    inputs.skipReviews
  }\` - This Action will not require passing reviews for the environments specified
  - \`admins: ${
    inputs.admins
  }\` - This Action will allow the listed admins to bypass pull request reviews before deployment

  ---

  > View the full usage guide [here](https://github.com/github/branch-deploy/blob/main/docs/usage.md) for additional help
  `)

  expect(debugMock).toHaveBeenCalledWith(commentSecond)
})
