# Parameters

Given the highly customizable nature of the `branch-deploy` Action, users may often find that they need to pass in a number of parameters into subsequent steps during their deployments. This Action provides a way to pass in parameters to the `.deploy` command without any required structure or format.

## Example

Here are a few examples of how to pass in parameters to the `.deploy` command and why they might be used.

### Example 1

**Command**:

```text
.deploy to development | LOG_LEVEL=debug,CPU_CORES=4
```

**Outputs**: `params` = `LOG_LEVEL=debug,CPU_CORES=4`

**Why**: A user might need to deploy to the development environment and tell subsequent workflow steps to use a `LOG_LEVEL` of `debug` and `CPU_CORES` of `4`.

### Example 2

**Command**:

```text
.deploy | something1 something2 something3
```

**Outputs**: `params` = `something1 something2 something3`

**Why**: This example shows that the `params` output is just a string that can be literally anything your heart desires. It is up to the user to parse the string and use it in subsequent steps.

## Parameter Separator

The `param_separator` input defaults to `|` and will collect any text that is provided after this character and save it as a GitHub Actions output called `params`. This output can then be used in subsequent steps.

This value can be configured to be any character (or string) that you want.

## Parameter Output

The `params` output can be accessed just like any other output from the `branch-deploy` Action. Here is a quick example:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: github/branch-deploy@vX.X.X
  with:
    trigger: .deploy
    param_separator: "|"

- name: example
  if: steps.branch-deploy.outputs.continue == 'true'
  run: |
    echo "params: ${{ steps.branch-deploy.outputs.params }}"
```
