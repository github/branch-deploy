# Maintainer Guide 🧑‍🔬

This document is intended for maintainers of the project. It describes the process of maintaining the project, including how to release new versions.

## Release Process 🏷️

Here is a very high level flow of how we go from idea to release:

1. User XYZ wants to add feature ABC to the project
2. The user likely opens an issue
3. Either the user or a maintainer creates a pull request with the feature
4. The pull request is reviewed by a maintainer - CI passing, etc
5. The pull request is merged
6. A new tag is pushed to the repository
7. A pre-release is created on GitHub. Maintainers can test this pre-release and so can users.
8. The pre-release looks good, so the maintainer(s) flip the release to a full release (aka latest)
9. The [`update-latest-release-tag`](../.github/workflows/update-latest-release-tag.yml) workflow is run to sync major release tags with the latest release tag

### Creating a Release

> This project uses semantic versioning

Creating a release is a rather straight forward process.

Simply run the following script and follow the prompts to create, and push a new release tag:

```bash
script/release
```

Now that the new release is published you can set it as a pre-release to test it out, or set it as the latest release.

Once a tag is set to the latest release, we need to update the major release tags to point to the latest release tag.

_What does that mean?_... Here is an example! Let's say we just pushed a new release with the tag `v1.2.3` and we want our "major" release tag `v1` to point to this new release. We would run the [`update-latest-release-tag`](../.github/workflows/update-latest-release-tag.yml) workflow to accomplish this. The workflow has a few inputs with descriptions that will help you along with this process.

The reason that we update release tags to point to major releases is for the convenience of users. If a user wants to use the latest version of this Action, all they need to do is simply point to the latest major release tag. If they point at `v1` then they will pick up **all** changes made to `v1.x.x` without having to update their workflows. When/if a `v2` tag rolls out, then they will need to update their workflows (example).
