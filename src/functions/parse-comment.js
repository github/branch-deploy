// A simple function that return the parsed comment
// :param environment: The default environment from the Actions inputs
// :param body: The comment body
// :param trigger: The trigger prefix
// :param noop_trigger: The noop trigger prefix
// :param stable_branch: The "stable" or "base" branch to deploy to (e.g. master|main)
// :returns: the parsed comment that excluded the branch-action operation
export async function parseComment(
  body,
  trigger,
  noop_trigger,
  stable_branch
) {
  let noop = false
  body = body.trim()
  const trigger_reg = new RegExp(`^${trigger}`)
  if (body.match(trigger_reg) == null) {
    return ''
  }

  body = body.replace(trigger, '').trim()
  const noop_reg = new RegExp(`^${noop_trigger}`)
  if (body.match(noop_reg) != null) {
    noop = true
    body = body.replace(noop_trigger, '').trim()
  }

  const stable_branch_reg = new RegExp(`^${stable_branch}`)
  if (body.match(stable_branch_reg) != null && !noop) {
    body = body.replace(stable_branch, '').trim()
  }

  const env_reg = new RegExp(`^(to )*[^ ]+`)
  const matched = body.match(env_reg)
  if (matched != null) {
    body = body.replace(matched[0], '').trim()
  }

  return body
}
