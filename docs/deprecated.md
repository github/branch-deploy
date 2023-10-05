# Deprecated

This document contains a list of features that have been deprecated, removed, or are no longer supported.

## `.deploy noop`

> Changes made in [`v7.0.0`](https://github.com/github/branch-deploy/releases/tag/v7.0.0)

First off, it should be made clear that "noop" style deployments are absolutely still supported in this Action. However, they are no longer invoked with `.deploy noop` and are now invoked with `.noop` by default.

If you are running any version of this Action prior to `v7.0.0` you are likely using `.deploy noop` to invoke noop style deploys. From version `v7.0.0` and beyond, the default behavior of this Action is to invoke noop style deploys with `.noop`. You can change this behavior by setting the `noop_trigger` input to be something else, but it is no longer possible to make the noop command a subcommand of `.deploy`.

You can learn more about why this change was made by viewing [this pull request](https://github.com/github/branch-deploy/pull/169) or [this issue](https://github.com/github/branch-deploy/issues/108).

After release `v7.0.0` all future `.deploy noop` commands will result in a deprecation warning, a halted noop deployment, and a link to this document.

Nearly all users should just be able to use `.noop` instead, or change the `noop_trigger` input to be whatever their preferred noop trigger is.
