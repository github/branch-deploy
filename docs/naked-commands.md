# Naked Commands

"Naked commands" are commands that are not associated with an environment. They are convenient but can potentially be dangerous if a user hits `enter` before their command is fully typed out and they ship changes to production. Here are a few examples of naked commands:

- `.deploy`
- `.noop`
- `.lock`
- `.unlock`
- `.wcid`

These commands are "naked" because they do not have a listed environment. This means that they will default to what ever environment is configured _as the default_. In most cases, this is **production**.

Here are some examples of non-naked commands:

- `.deploy staging`
- `.noop production`
- `.deploy to production`
- `.noop to staging`
- `.lock staging`
- `.unlock production`
- `.wcid development`

If you want to **enforce** non-naked commands as the default for your project, you can!

## Disabling Naked Commands

By setting the following input option (`disable_naked_commands`), you can disable naked commands for your project. This means that users will have to specify an environment for their command to run.

```yaml
- uses: github/branch-deploy@vX.X.X
  id: branch-deploy
  with:
    disable_naked_commands: "true" # <--- this option must be "true" to disable naked commands
```

---

[reference](https://github.com/github/branch-deploy/issues/210)
