# Contributing 💻

All contributions are welcome and greatly appreciated!

## Steps to Contribute 💡

> Check the `.node-version` file in the repository root to see which Node.js version is required for local development. The JavaScript action runtime is declared separately in `action.yml`. A version manager such as [nodenv](https://github.com/nodenv/nodenv) can use `.node-version` automatically.

1. Fork this repository
2. Commit your changes
3. Test your changes (learn how to test below)
4. Open a pull request back to this repository
   > For runtime source changes, run `npm run all` and commit the regenerated `dist/` artifacts. Do not regenerate `dist/` for documentation-only changes.
5. Notify the maintainers of this repository for peer review and approval
6. Merge!

The maintainers of this repository will create a new release with your changes so that everyone can use the new release and enjoy the awesome features of branch deployments.

> For maintainers, see the [Maintainer Guide](./docs/maintainer-guide.md) for more information on how to create a new release.

## Testing 🧪

This project requires every test to pass and **100%** line, branch, and function coverage

> The branch-deploy Action is used by enterprises, governments, and open source organizations - it is critical that we have 100% test coverage to ensure that we are not introducing any regressions. All changes will be throughly tested by maintainers of this repository before a new release is created.

### Running the test suite (required)

Simply run the following command to execute the entire test suite:

```bash
npm run test
```

Run the complete non-mutating formatting, typecheck, safety-policy, and test suite with:

```bash
npm run check
```

> Note: these commands require that you have already run `npm ci --ignore-scripts --no-audit --no-fund`

`npm run test` does not update the tracked coverage badge. The badge reflects the three enforced native Node coverage thresholds and the requirement that every test passes.

The suite uses `node:test`, native V8 coverage, and the exact Node version in `.node-version`. ESM module mocking and coverage are experimental test-only features pinned to that development runtime. `npm run lint` runs the repository's TypeScript compiler-API safety policy; formatting remains the responsibility of Prettier.

### Running the native acceptance suite

Runtime changes must be tested against a freshly rebuilt `dist/index.js`:

```bash
npm run package
npm run acceptance
```

The native Node acceptance harness runs the committed action bundle through its real main/post lifecycle against a strict local GitHub API mock. It is the normal acceptance gate and is also available directly as `script/acceptance` when `dist/index.js` is already current.
