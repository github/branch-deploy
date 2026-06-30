# AGENTS.md

## Scope and purpose

This file applies to the entire repository. It is the primary repository-specific instruction source for coding agents and automated contributors.

`branch-deploy` is a public GitHub Action that implements IssueOps-based branch deployments. Treat every source file, test, generated artifact, branch name, commit, pull request, comment, workflow log, and release artifact as public information.

The project prioritizes behavior preservation, a small dependency surface, strict static guarantees, reproducible committed bundles, and reviewable changes. Prefer the smallest change that completely solves the requested problem.

## Public-repository safety

- Never add credentials, tokens, cookies, private keys, authentication headers, customer data, private repository names, private URLs, internal hostnames, non-public infrastructure details, local registry or proxy configuration, or machine-specific identifiers.
- Never copy private material from another checkout, conversation, clipboard, log, browser session, or tool output into this repository.
- Do not commit absolute local paths. Pay particular attention to generated source maps, coverage output, archives, manifests, and copied command output.
- Keep fixtures, examples, branch names, commit messages, pull request text, comments, and workflow summaries generic and suitable for a public open-source repository.
- Before every commit and push, review the complete diff, staged content, untracked files, generated artifacts, commit metadata, and branch history for accidental disclosure.
- Before opening or updating a pull request, review the title, body, commit list, full branch diff, generated files, and any proposed comments with the same public-safety standard.
- If a requested change appears to require non-public context, stop before publication and ask for explicit direction.

## Repository and contribution boundary

- Base new work on the repository's current default branch unless the maintainer specifies another base.
- Refresh and inspect the selected base before broad migrations or dependency work. Do not silently combine base-branch synchronization with an unrelated feature or maintenance pull request.
- Follow the repository's established contribution process. Make the intended head and base explicit, and do not change the target repository or branch without authorization.
- Do not merge a pull request, publish a release, create or move tags, change repository settings, or bump the action version unless the current request explicitly authorizes that operation.
- Do not amend, rebase, force-push, or rewrite published history unless explicitly requested.
- Preserve unrelated working-tree changes. Never use destructive cleanup commands to discard files you did not create.

## Project architecture

The supported public product is the combination of `action.yml` and the committed JavaScript distribution under `dist/`. The TypeScript source tree is an implementation detail, not a supported package import surface.

The repository is intentionally an action-only package:

- It is private from npm's perspective through `"private": true`.
- It has no supported npm library API.
- It does not emit or publish declaration files.
- It has no `lib/` build tree.
- It has no `exports`, `types`, or source-import compatibility promise.
- Consumers are expected to reference the GitHub Action, not import `src/*.ts`.

The runtime entrypoint is `dist/index.js`. GitHub Actions executes the committed bundle directly; it does not install dependencies or compile TypeScript when a workflow invokes the action.

`action.yml` currently declares the Node 24 action runtime and uses `dist/index.js` for both the main and post entrypoints. Treat those values as public compatibility commitments.

The package boundary is ESM. Preserve `"type": "module"`, ESM exports, import-time behavior, and the main/post lifecycle unless a change explicitly authorizes a public runtime change.

## Repository organization

- `action.yml` defines the public action inputs, outputs, runtime, main entrypoint, and post entrypoint.
- `src/` contains the TypeScript runtime implementation.
- `src/main.ts` contains import-time dispatch and the primary exported `run` entrypoint.
- `src/actions-core.ts` is the project-owned compatibility layer for the narrow GitHub Actions runner-command surface consumed by this action.
- `src/action-io.ts` centralizes typed input, output, and action-state keys.
- `src/trust-boundaries.ts` contains the intentionally narrow assertions and legacy coercion boundaries that cannot be proven statically without changing runtime behavior.
- `src/types.ts` and related type modules define shared domain models and discriminated unions.
- `src/types/` contains local declarations for narrowly consumed third-party APIs.
- `__tests__/` contains the native Node test suite, typed test helpers, contract tests, policy fixtures, and intentionally invalid fixtures.
- `tools/typescript-policy.ts` is the project-owned TypeScript compiler-API safety checker used by `npm run lint`.
- `tools/coverage-reporter.ts` validates native V8 coverage and the complete executable first-party source inventory.
- `script/test` is the canonical native Node test entrypoint.
- `dist/` contains the committed ncc output executed by the GitHub Actions runner.
- `docs/maintainer-guide.md` documents the automatic immutable release process.
- `.github/workflows/` contains the required CI, package reproduction, schema validation, and release workflows.

## Action contract

The action metadata and typed registries define a deliberately stable public interface. Current contract tests enforce all 49 input names and all 38 output names.

When changing action inputs or outputs:

- Update `action.yml` and the corresponding typed registry together.
- Preserve defaults, required flags, accepted literals, and stringification unless the change explicitly calls for a behavior change.
- Add or update contract tests proving that the metadata and typed registries are exactly synchronized.
- Preserve every output write that intentionally occurs before a later status or failure check.
- Do not rename state or output keys as a cleanup.
- Do not introduce undeclared outputs or untyped raw key strings.
- Treat additions, removals, default changes, and accepted-value changes as public API changes requiring explicit authorization and release consideration.

Action state is serialized by the GitHub Actions runner protocol. Values read back from state are strings even when the original saved value was a boolean, number, object, `null`, or `undefined`. Do not normalize that behavior merely because a stronger TypeScript model appears desirable.

Preserve the existing main/post dispatch rules. Post mode depends on the saved `isPost` state string, and normal import-time execution depends on the existing CI/test sentinels. The intentionally legacy-named `BRANCH_DEPLOY_VITEST_TEST` variable remains an import-dispatch compatibility boundary even though Vitest is no longer a dependency.

## Behavior-preservation standard

Maintenance and tooling pull requests should have zero intentional runtime behavior changes unless the request explicitly says otherwise.

Preserve, in particular:

- Function names, named exports, import-time side effects, and statement ordering where ordering is observable.
- Input trimming, required-input errors, boolean parsing, command escaping, state serialization, and output serialization.
- Existing literal results for success, noop, safe exit, failure, alternate modes, lock results, and deployment results.
- The current `false`, `null`, `"null"`, `"GLOBAL_REQUEST"`, empty-string, and `undefined` sentinels in their established paths.
- Existing swallowed-versus-thrown error behavior and the handling of HTTP 403, 404, and 422 responses.
- Error text, status access, stack access, annotation content, comments, reactions, labels, and ordering.
- GitHub REST and GraphQL routes, request headers, arguments, preview media types, pagination, retries, and response handling.
- Lock branch names, JSON shape, timestamps, metadata, ownership, sticky behavior, unlock behavior, and cleanup ordering.
- Deployment payloads, statuses, environment names, task names, polling intervals, and post-deploy completion behavior.
- Template escaping, rendered bytes, parameter parsing, positional arguments, short and long options, equals syntax, coercion, and nested dot paths.

If typing or a refactor exposes an existing bug, characterize the current behavior with a test and defer the behavior correction to a separate, explicitly scoped pull request.

## Node and TypeScript versions

Local development and CI use the exact Node version in `.node-version`. `script/test` deliberately fails if the running Node version does not match that file.

The development runtime and the GitHub Actions runtime are related but distinct contracts:

- `.node-version` pins the exact development and CI runtime used for native TypeScript stripping, native tests, module mocks, and coverage.
- `action.yml` declares the GitHub-hosted Node major used to execute the committed JavaScript bundle.
- `@types/node` must remain intentionally aligned with the supported Node 24 development/runtime surface.
- The ncc target remains ES2022 unless a separately reviewed runtime change authorizes another target.

Do not raise the runtime floor, switch module systems, change the TypeScript target, or rely on a newer Node API without explicit approval and version-specific documentation.

## TypeScript configuration and safety policy

The project uses strict TypeScript as a correctness boundary. `tsconfig.json` covers runtime source, tests, tools, and local declarations. `tsconfig.runtime.json` separately proves that runtime source and local declarations do not depend on test-only code.

Preserve the strict compiler posture, including:

- `strict`
- `noImplicitReturns`
- `noUnusedLocals`
- `noUnusedParameters`
- `noFallthroughCasesInSwitch`
- `noImplicitOverride`
- `noUncheckedIndexedAccess`
- `noUncheckedSideEffectImports`
- `noPropertyAccessFromIndexSignature`
- `exactOptionalPropertyTypes`
- `useUnknownInCatchVariables`
- `allowUnreachableCode: false`
- `allowUnusedLabels: false`
- `isolatedModules`
- `verbatimModuleSyntax`
- `erasableSyntaxOnly`
- explicit `.ts` relative import specifiers
- full third-party declaration checking with `skipLibCheck: false`

Use TypeScript features that erase cleanly under the pinned Node runtime. Do not introduce enums, namespaces, parameter properties, decorators, path aliases, or other transform-dependent syntax without changing and reviewing the runtime strategy.

`npm run lint` runs the bounded compiler-API policy in `tools/typescript-policy.ts`. It is not a formatter and is not intended to reproduce stylistic ESLint rules. Preserve the named correctness and security guarantees it enforces, including:

- No TypeScript suppression directives.
- No explicit `any` or unsafe `any` data flow.
- No non-null assertions.
- Assertions only at documented trust boundaries.
- No `var`.
- Strict equality except at the documented legacy coercion boundary.
- Explicit return types on exported runtime functions.
- No floating promises unless explicitly discarded with `void`.
- `await` only for thenables.
- No Promise-returning callback where a void callback is expected.
- No async function without an `await`.
- Strict boolean conditions for unknown, any, and nullable primitive unions.
- Safe template interpolation and stringification.
- No CommonJS `require`, import-equals, export assignment, `debugger`, direct or indirect `eval`, or `Function` construction.
- No async Promise executors, assignments in conditions, unsafe prototype built-in calls, `NaN` comparisons, abrupt control flow from `finally`, non-Error throws, or deprecated symbol usage.

The policy checker must inspect all first-party TypeScript root files, emit stable sorted diagnostics, and fail on stale allowlist entries. Add fixture coverage for any policy change. Do not turn it into a generic plugin framework, add configuration syntax, or add autofixing.

## Trust boundaries and domain types

External GitHub payloads, saved state, decoded lock JSON, template data, environment values, REST responses, GraphQL responses, and caught errors are not trustworthy merely because an SDK supplies optimistic types.

Use the existing domain types and discriminated unions to correlate status values with the fields that are actually present. Prefer named request objects over growing positional or mode-boolean APIs.

Keep unavoidable unsafe assertions centralized in `src/trust-boundaries.ts`. The test-only `__tests__/unsafe-fixtures.ts` helper is the only other intentional assertion escape hatch, and it exists solely for tests that pass JavaScript values outside the TypeScript contract.

Do not add scattered double assertions, explicit `any`, non-null assertions, `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck`. Do not weaken the compiler or policy checker to make new code compile.

Caught values remain `unknown`. Narrow or route existing property access through the trust-boundary helper without adding new fallback messages, normalization, or swallowing behavior.

Do not add runtime schema validation, coercion, defaulting, or error normalization solely to satisfy TypeScript. A new malformed-input rejection policy is a behavior change and belongs in a separately authorized change.

## Coding approach

- Prefer small typed functions and direct control flow.
- Prefer the minimum abstraction needed by more than one real call site.
- Do not introduce classes, inheritance, service containers, repositories, factories, or speculative interfaces when a function or small discriminated union is sufficient.
- Model state machines and correlated success/failure results with discriminated unions.
- Use readonly properties and readonly arrays when production code does not mutate the value.
- Give exported runtime functions, parsers, predicates, state-machine functions, and literal-significant functions explicit return types.
- Use inference for simple private helpers when the inferred type is clear and stable.
- Use `as const satisfies` for literal registries and configuration constants where it preserves narrow values while checking the intended shape.
- Use bracket access for environment and other index-signature values instead of pretending dynamic keys are required properties.
- Use `node:` specifiers for Node standard-library imports.
- Prefer `const`; use `let` only for genuine reassignment.
- Use explicit `String`, joining, or JSON formatting when implicit conversion could stringify objects, arrays, nullish values, or unknown values.
- Keep comments focused on why a non-obvious invariant exists. Do not narrate straightforward code.
- Match existing naming and module boundaries before inventing new helpers.
- Do not opportunistically refactor adjacent code in a bug fix, dependency update, or documentation change.

## Dependencies and installation

Use npm and the committed `package-lock.json`. The supported installation command is:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

Do not run a floating install, add a loose range, switch package managers, or regenerate the lockfile casually.

All direct dependencies and development dependencies are exact pins. `__tests__/dependency-policy.test.ts` is the executable allowlist and graph policy. It verifies:

- The exact approved direct runtime and development package names and versions.
- Agreement between `package.json` and the lockfile root.
- Absence of package overrides unless an override is explicitly justified and policy-tested.
- Public npm registry resolutions and integrity digests for every resolved package.
- No Git, file, local, or private-registry dependencies.
- Zero optional packages.
- Zero install-script packages.
- The expected resolved runtime and development graph sizes.

When changing dependencies:

1. Explain why removal, addition, upgrade, or override is necessary.
2. Inspect direct and transitive consumers, version ranges, engines, release support, lifecycle scripts, advisories, licenses, and bundle impact.
3. Use a protected dependency-fetch path approved by the maintainer. Do not print or commit machine registry, proxy, or credential configuration.
4. Use exact direct versions. Allow transitive versions to be selected by declared dependency constraints and the lockfile unless a documented compatibility or security issue requires an override.
5. Reject unrelated lockfile churn.
6. Recompute direct, resolved, runtime, development, optional, and install-script counts.
7. Rebuild and semantically review the committed distribution.
8. Update the dependency-policy test deliberately rather than weakening it.

The runtime dependencies are intentionally few and retained for specific reasons:

- `@actions/github` provides GitHub context, GHES-aware endpoints, Octokit REST/GraphQL integration, and a large behavior-critical API surface.
- `@octokit/plugin-retry` preserves established retry and rate-limit behavior for state-changing GitHub operations.
- `nunjucks` provides the supported user-facing template language, including expressions, conditionals, filters, and escaping.
- `yargs-parser` provides the observable deployment-parameter grammar.

The development dependencies are also deliberate:

- `typescript` provides strict type checking and the compiler API used by the safety policy.
- `@types/node` provides the exact Node declarations.
- `@vercel/ncc` creates the committed single-file GitHub Action bundle.
- `prettier` is the formatting authority.
- `js-yaml` parses `action.yml` in contract and policy tests.

Do not replace protocol clients, template engines, or parsers with incomplete local implementations merely to reduce a package-count headline. A dependency reduction is successful only when behavior, security, maintenance cost, and artifact reproducibility remain stronger overall.

## Local GitHub Actions core compatibility layer

`src/actions-core.ts` replaces the narrow `@actions/core` surface actually used by this project. It is an internal runner-protocol adapter, not a general-purpose toolkit replacement.

Preserve byte-level behavior for:

- Input environment-name normalization, trimming, required-input handling, and exact error text.
- YAML 1.2 boolean spellings and malformed-boolean errors.
- String, boxed-string, number, boolean, object, array, `null`, and `undefined` conversion.
- `GITHUB_OUTPUT` and `GITHUB_STATE` file-command heredocs, delimiter generation, delimiter collision rejection, UTF-8 append behavior, and platform newlines.
- Missing command-file environment variables and missing file paths.
- Deprecated stdout command fallback, including the existing leading newline from `setOutput`.
- Command and property escaping for percent signs, carriage returns, line feeds, colons, and commas.
- `STATE_<name>` reads.
- Debug, informational, warning, and error output.
- `Error` conversion for warning and error annotations.
- `setFailed` setting `process.exitCode = 1` before emitting the error.

Do not expand the adapter with unused summaries, OIDC, environment export, path mutation, masking, groups, notices, or command echoing without a real production consumer and focused compatibility tests.

## Testing

The test suite uses the native Node test runner. Do not reintroduce Vitest, Jest, Babel, a coverage wrapper, or a compatibility implementation of another test API without explicit approval.

Run the suite through the canonical entrypoint:

```bash
npm run test
```

`script/test`:

- Verifies the exact `.node-version` runtime.
- Recreates the ignored `coverage/` directory.
- Discovers `__tests__/**/*.test.ts` deterministically.
- Sets the legacy import-dispatch sentinel.
- Runs each test file in an isolated process with no intra-file concurrency.
- Enables the pinned experimental ESM module-mocking and native coverage features.
- Writes LCOV output to `coverage/lcov.info`.
- Routes the coverage event through the project-owned coverage reporter.

Every test must pass. Skipped, todo, cancelled, and failed tests are not acceptable substitutes for coverage.

Executable first-party source must maintain 100% native line, branch, and function coverage. The coverage reporter inventories executable `src/**/*.ts` and `tools/**/*.ts`, excludes only declarations and the intentionally type-only module, rejects synthetic mocked URLs as proof, rejects missing or unexpected source files, and requires every covered count to equal its total.

Do not add broad coverage exclusions. Add characterization tests for defensive branches and observable edge cases.

Use `node:test` and `node:assert/strict` directly:

- Use `assert.strictEqual` for identity and primitive equality.
- Use `assert.deepStrictEqual` for complete structural equality.
- Use `assert.partialDeepStrictEqual` only when a partial contract is the actual assertion.
- Use `assert.match`, `assert.throws`, and `assert.rejects` for their corresponding cases.
- Prefer explicit awaited values over assertion DSLs for resolved promises.
- Register table cases with deterministic loops and stable names.

Use the narrow helpers in `__tests__/node-test-helpers.ts` rather than building a general mock framework.

- Use `mock.method` for mutable object methods such as Octokit calls, timers, and writers.
- Use `mock.fn` for typed standalone functions and controlled queues.
- Install ESM module mocks before dynamically importing the subject under test.
- Keep stable mocked-export identities for the test-file lifetime and reset calls and queued implementations before each test.
- Rely on process-per-file isolation for module-cache separation.
- Do not add production dependency-injection seams solely for tests.
- Do not globally mock the local actions-core adapter because its own suite must exercise the real implementation.
- Derive fixtures from production `Parameters`, `ReturnType`, and exported domain types where practical.
- Use the single unsafe fixture helper only for intentionally invalid JavaScript values.

Compile-time contract checks use project-owned equality and extension assertion types plus `tsc`. Do not add a type-testing dependency or experimental standalone type-test runner.

## Formatting, type checking, policy checking, and complete checks

The stable commands are:

```bash
npm run format
npm run format-check
npm run typecheck
npm run typecheck:runtime
npm run lint
npm run test
npm run check
```

Command semantics matter:

- `npm run format` is the source-rewriting formatting command.
- `npm run format-check` is non-mutating.
- `npm run typecheck` checks the complete project.
- `npm run typecheck:runtime` checks runtime source independently.
- `npm run lint` runs the TypeScript safety policy and is non-mutating.
- `npm run test` is non-mutating with respect to tracked files.
- `npm run check` runs formatting verification, both typechecks, the safety policy, and the complete native Node test suite.

Do not hide failures with warning-only wrappers or remove a check from `npm run check` to make a change pass.

## Bundling and committed distribution

Build the action with:

```bash
npm run package
```

or the equivalent packaging-only alias:

```bash
npm run bundle
```

Run checks and then package with:

```bash
npm run all
```

`npm run package` invokes ncc on `src/main.ts` with ESM output, source maps, collected licenses, and an explicit ES2022 target.

The committed `dist/` contract consists of exactly six files:

- `dist/index.js`
- `dist/index.js.map`
- `dist/licenses.txt`
- `dist/package.json`
- `dist/sourcemap-register.cjs`
- `dist/sourcemap-register.js`

Any source change that affects packaging must regenerate the bundle. Keep generated distribution changes in a reviewable commit when practical.

Package reproduction is exact. The `package-check` workflow installs from the lockfile, rebuilds from checked-out source, fails on tracked or untracked `dist/` changes, and smoke-imports the committed ESM bundle with action dispatch disabled.

Review generated changes semantically, not only by size or hash:

- Compare all six filenames, hashes, sizes, licenses, source-map loaders, package boundary, module inventory, and runtime dependencies.
- Inspect `dist/index.js` for changed action strings, defaults, state/output keys, API routes, API arguments, control flow, errors, serialization, templates, and dependencies.
- Expect source maps to change when source text or filenames change, but scan them for absolute paths and private material.
- Require `dist/licenses.txt`, `dist/package.json`, and source-map loaders to remain byte-identical when runtime dependencies and distribution structure are unchanged.
- Treat unexplained semantic bundle differences as blockers even when tests pass.

Do not manually edit generated `dist/` files.

## Continuous integration

Preserve the existing workflow and required-check identities:

- `actions-config-validation` validates action metadata.
- `lint` runs formatting verification, both TypeScript projects, and the TypeScript policy.
- `test` runs the complete native Node suite and coverage contract.
- `package-check` proves exact bundle reproduction and ESM loading.

CI uses the `.node-version` file and the stable npm commands. Do not duplicate long tool flags in workflow YAML when the repository script is the source of truth.

Checkout credentials should not persist in workflows that do not need to push. Keep `persist-credentials: false` where present.

Release-critical third-party actions are pinned to full commit SHAs. Do not loosen those pins. Treat broad workflow-action pinning or replacement outside the release chain as a separate security-maintenance scope rather than incidental churn.

## Release process

`src/version.ts` is the sole normal release input. Only stable `vMAJOR.MINOR.PATCH` versions are accepted.

A normal release is created by a dedicated, reviewed version-bump pull request:

1. Change `src/version.ts` to the next stable version.
2. Run the complete checks and regenerate the committed distribution.
3. Commit only the version source and mechanically affected bundle artifacts unless another change is explicitly part of the release.
4. Merge the reviewed pull request to protected `main` after CI passes.

The `release` workflow then:

- Freezes the merge SHA.
- Reinstalls from the exact lockfile with lifecycle scripts disabled.
- Runs the complete project checks.
- Rebuilds and verifies the committed distribution.
- Attests `action.yml` and all six distribution files.
- Verifies the direct attestations before release publication.
- Creates or validates an annotated exact-version tag.
- Creates an assetless stable GitHub Release with generated notes.
- Verifies immutable release integrity.
- Moves the ordinary `vMAJOR` compatibility tag only after the exact release verifies.

Do not manually push release tags, attach arbitrary release assets, create release candidates, create a `vMAJOR.MINOR` alias, or move the major tag outside the verified workflow.

Do not claim that the compact single-job release workflow is SLSA Build Level 3. It provides GitHub build provenance and immutable-release integrity but does not isolate the build in a separate reusable workflow boundary.

Do not bump `src/version.ts` as part of an unrelated maintenance pull request. A version change triggers publication when it reaches the repository's protected default branch.

## Live acceptance for runtime changes

Unit, type, policy, and bundle checks are necessary but may not be sufficient for changes to deployed behavior or committed bundle internals.

For high-risk runtime, protocol, dependency, bundler, or main/post lifecycle changes, use an exact candidate commit SHA in a public-safe consumer repository rather than a mutable branch reference.

Remember that `issue_comment` workflows execute the workflow definition from the consumer repository's default branch. A reliable live acceptance flow therefore requires a reviewed temporary default-branch pin before comments can exercise the candidate.

A thorough IssueOps characterization can include:

- An initial `.wcid` to detect residual locks.
- `.help` to verify help output, comments, reactions, safe exit, and post bypass.
- `.noop` to verify outputs, exact PR-head checkout, noop execution, and non-sticky cleanup.
- A normal `.deploy` to verify deployment creation, exact checkout, post completion, and sticky locking.
- `.wcid` to verify lock ownership.
- `.deploy main` to verify default-branch or rollback selection.
- `.unlock` followed by `.wcid` to verify cleanup and a no-lock result.
- A final deployment and lock check before merge-mode testing.
- Merge-deploy and unlock-on-merge verification after merging the harmless consumer pull request.

Every live run should prove the downloaded action repository resolved to the frozen candidate SHA and record the selected checkout SHA, key outputs, step conclusions, deployment state, lock state, comments, and post-action result.

After acceptance, restore every consumer workflow reference to its previous value through normal review, remove harmless markers, delete temporary branches, and verify that no test lock remains. Preserve unrelated pre-existing locks and unrelated pull requests.

Any candidate commit change invalidates earlier exact-SHA live results.

## Documentation and Markdown

- Keep public documentation accurate with the executable scripts and workflow behavior.
- Do not hard-wrap Markdown prose. Keep each paragraph and list item on one source line and let the renderer wrap it.
- Preserve structural line breaks for headings, blank lines, lists, tables, block quotes, and code fences.
- Use repository-relative links for tracked documentation.
- Avoid duplicating volatile version or package-count facts unless a test or update process keeps them synchronized.
- Describe security properties precisely. Distinguish exact lockfile reproducibility, disabled install scripts, provenance, immutable releases, and full hermeticity rather than treating them as synonyms.
- Keep contributor-facing instructions understandable without assuming knowledge of prior private conversations or local machine setup.

## Pull request expectations

- Keep the title short and descriptive.
- Keep the body concise and focused on purpose, important behavior or security boundaries, dependency changes, and public compatibility impact.
- Do not paste routine local validation transcripts when CI already exposes the same result.
- Call out intentional deviations, remaining risks, generated-artifact changes, and deferred behavior fixes.
- Keep unrelated refactors, dependency upgrades, release bumps, base-branch synchronization, and workflow-security changes in separate pull requests.
- Prefer reviewable commits that separate policy/tooling, runtime behavior, tests, dependency resolution, documentation, and generated distribution where that separation helps reviewers.
- The final head, not an intermediate commit, is the acceptance unit.
- Wait for the existing required checks and inspect any review comments against the current head before recommending merge.

## Change-specific checklists

### Documentation-only or instruction changes

- Verify claims against current scripts, package metadata, action metadata, workflows, and tests.
- Run formatting verification for files covered by Prettier.
- Ensure examples contain only public-safe placeholders.
- Do not regenerate `dist/` when runtime source is unchanged.

### Dependency changes

- Establish the current graph and bundle inventory before editing.
- Confirm declared dependency constraints and the newest compatible release from authoritative metadata.
- Use the approved protected registry path without exposing its configuration.
- Update `package.json`, `package-lock.json`, dependency-policy expectations, licenses, docs, and bundle only where the actual result requires it.
- Reject unrelated resolution churn.
- Prove removed packages or overrides are absent and retained transitive versions remain expected.
- Run the complete checks and exact package reproduction.

### Runtime behavior changes

- Add characterization tests before changing poorly specified behavior.
- Preserve main/post dispatch, action state, inputs, outputs, API calls, locks, deployments, templates, and error handling unless explicitly changing that contract.
- Run complete checks, rebuild `dist/`, and perform a semantic bundle audit.
- Use exact-SHA live acceptance when the observable action path is materially affected.

### Test or tooling migrations

- Preserve every behavior case and stable test name where practical.
- Do not weaken coverage, compiler, or policy gates.
- Prove test isolation, module-mock behavior, source inventory, and deterministic reporting.
- Recompute dependency and install-script exposure.
- Treat experimental Node features as exact-version-pinned test-only boundaries.

### Action metadata changes

- Update typed registries and contract tests with `action.yml`.
- Preserve `runs.using`, `runs.main`, and `runs.post` unless explicitly authorized.
- Run action schema validation and all contract tests.
- Treat any input/output/default change as a public compatibility decision.

### Release changes

- Keep ordinary feature work separate from `src/version.ts`.
- Verify the exact version transition and generated bundle diff.
- Do not publish from a feature branch or create tags manually.
- After an authorized release merge, monitor build, attestation, tag, release, immutability, latest-release, and major-alias verification to completion.

## Definition of done

A change is complete only when all applicable conditions are satisfied:

- The requested behavior or maintenance goal is implemented without unapproved scope expansion.
- The worktree and branch contain no unrelated edits or private material.
- Formatting verification passes.
- Both TypeScript projects pass.
- The TypeScript safety policy passes.
- The complete native Node suite passes with no failed, skipped, todo, or cancelled tests.
- Native line, branch, and function coverage remain 100% for every executable first-party source file.
- Action metadata and typed contract tests remain synchronized.
- Dependencies and lockfile satisfy the exact dependency policy.
- The committed distribution reproduces exactly when packaging is affected.
- Generated artifacts have been semantically audited and scanned for local or private material.
- Existing CI check identities remain intact and green.
- High-risk runtime changes have appropriate exact-SHA live acceptance.
- Pull request metadata and commit history are concise, accurate, public-safe, and targeted to the intended repository and branch.
- No release, tag, version bump, settings change, target change, or merge occurred without explicit authorization.
