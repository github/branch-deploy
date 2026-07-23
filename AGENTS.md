# AGENTS.md

## Scope and instruction design

This file applies to the entire repository. It is the repository-specific instruction source for coding agents and automated contributors.

Keep this file durable, small, and focused on rules that should apply every time work happens in this repository. Do not add one-off task plans, temporary investigation notes, local machine details, or long procedure transcripts here. Move detailed operating procedures to `docs/`, reusable workflows to skills, and directory-specific rules to a closer nested `AGENTS.md` if that scope ever appears.

Codex loads project guidance from the repository root down to the working directory, and closer files override broader guidance. Codex also has a default project-instruction size budget, so this file should stay compact enough to load completely. If a new rule would make this file sprawl, prefer replacing repeated guidance with a pointer to the authoritative script, test, or document.

`branch-deploy` is a public GitHub Action for IssueOps-based branch deployments. Treat every source file, test, generated artifact, branch name, commit, pull request, comment, workflow log, release artifact, example, and fixture as public information.

The project prioritizes behavior preservation, a small dependency surface, strict static guarantees, reproducible committed bundles, and reviewable changes. Prefer the smallest change that completely solves the requested problem.

## Public-repository safety

- Never add credentials, tokens, cookies, private keys, authentication headers, customer data, private repository names, private URLs, internal hostnames, non-public infrastructure details, local registry or proxy configuration, or machine-specific identifiers.
- Never copy private material from another checkout, conversation, clipboard, log, browser session, or tool output into this repository.
- Do not commit absolute local paths. Pay particular attention to source maps, coverage output, archives, manifests, copied command output, and generated files.
- Keep fixtures, examples, branch names, commit messages, pull request text, comments, workflow summaries, and documentation generic and suitable for a public open-source repository.
- Before every commit, push, pull request, or public comment, review the relevant diff, staged content, untracked files, generated artifacts, commit metadata, branch history, PR title, and PR body for accidental disclosure.
- If a requested change appears to require non-public context, stop before publication and ask for explicit direction.

## Repository and contribution boundary

- Base new work on the repository's current default branch unless the maintainer specifies another base.
- Inspect `git status --short --branch` and the actual diff before editing, staging, committing, or opening a pull request.
- Preserve unrelated working-tree changes. Never discard, overwrite, amend, rebase, or force-push user or upstream work unless explicitly requested.
- Do not merge a pull request, publish a release, create or move tags, change repository settings, or bump the action version unless the current request explicitly authorizes that operation.
- Keep unrelated refactors, dependency upgrades, release bumps, base synchronization, workflow hardening, and behavior changes in separate pull requests.
- Make the intended head, base, public compatibility impact, and generated-artifact impact clear in PR work.

## Product and architecture model

The supported public product is the combination of `action.yml` and the committed JavaScript bundle under `dist/`. The TypeScript source tree is an implementation detail, not a supported package import surface.

This repository is intentionally an action-only package:

- `package.json` is private from npm's perspective.
- There is no supported npm library API.
- There are no emitted declarations, `lib/` build tree, `exports`, `types`, or source-import compatibility promise.
- Consumers are expected to reference the GitHub Action, not import `src/*.ts`.

`action.yml` declares the GitHub-hosted Node action runtime and uses `dist/index.js` for both the main and post entrypoints. GitHub Actions executes the committed bundle directly; consumer workflows do not install dependencies or compile TypeScript when invoking the action.

The package boundary is ESM. Preserve `"type": "module"`, ESM exports, import-time behavior, and the main/post lifecycle unless the maintainer explicitly authorizes a public runtime change.

## Important files

- `action.yml` defines the public action inputs, outputs, runtime, main entrypoint, and post entrypoint.
- `src/main.ts` contains import-time dispatch and the primary exported `run` entrypoint.
- `src/actions-core.ts` is the project-owned compatibility layer for the narrow GitHub Actions runner-command surface consumed by this action.
- `src/action-io.ts` centralizes typed input, output, and action-state keys.
- `src/trust-boundaries.ts` contains intentionally narrow assertions and legacy coercion boundaries that cannot be proven statically without changing runtime behavior.
- `src/types.ts` and related modules define shared domain models and discriminated unions.
- `src/functions/` contains the runtime behavior for prechecks, locks, deployments, comments, labels, parameters, rulesets, and post-deploy completion.
- `__tests__/` contains the native Node test suite, typed test helpers, contract tests, policy fixtures, and intentionally invalid fixtures.
- `tools/typescript-policy.ts` is the project-owned TypeScript compiler-API safety checker used by `npm run lint`.
- `tools/coverage-reporter.ts` validates native V8 coverage and the complete executable first-party source inventory.
- `script/test` is the canonical native Node test entrypoint.
- `dist/` contains the committed ncc output executed by the GitHub Actions runner.
- `docs/maintainer-guide.md` documents the automatic immutable release process.
- `.github/workflows/` contains the required CI, package reproduction, schema validation, and release workflows.

## Action contract

The action metadata and typed registries define the public interface. Contract tests currently enforce all action inputs, outputs, state keys, accepted literal values, default values, required flags, output writes, state producers and consumers, and runner entrypoints.

When changing action inputs or outputs:

- Update `action.yml`, `src/action-io.ts`, `src/functions/inputs.ts` when relevant, schema fixtures, documentation, and contract tests together.
- Preserve defaults, required flags, accepted literals, stringification, and output timing unless the request explicitly authorizes a behavior change.
- Do not rename state or output keys as cleanup.
- Do not introduce undeclared outputs, untyped raw key strings, or scattered direct `core.getInput`, `core.setOutput`, `core.saveState`, or `core.getState` calls.
- Treat additions, removals, default changes, accepted-value changes, and entrypoint changes as public API changes requiring explicit authorization and release consideration.

Action state is serialized by the GitHub Actions runner protocol. Values read back from state are strings even when the saved value was originally a boolean, number, object, `null`, or `undefined`. Do not normalize that behavior merely because a stronger TypeScript model appears desirable.

Preserve the main/post dispatch rules. Post mode depends on the saved `isPost` state string, and normal import-time execution depends on the existing CI/test sentinels. The legacy-named `BRANCH_DEPLOY_VITEST_TEST` variable remains an import-dispatch compatibility boundary even though Vitest is no longer a dependency.

## Behavior-preservation standard

Maintenance, docs, dependency, tooling, and typing pull requests should have zero intentional runtime behavior changes unless the request explicitly says otherwise.

Preserve observable behavior, especially:

- Function names, named exports, import-time side effects, and statement ordering where ordering is observable.
- Input trimming, required-input errors, boolean parsing, command escaping, state serialization, output serialization, and runner-command formatting.
- Existing literal results for success, noop, safe exit, failure, alternate modes, lock results, deployment results, and structured operation results.
- Existing `false`, `null`, `"null"`, `"GLOBAL_REQUEST"`, empty-string, and `undefined` sentinels in their established paths.
- Swallowed-versus-thrown error behavior and HTTP 403, 404, 409, 422, retry, pagination, and status handling.
- Error text, status access, stack access, annotation content, comments, reactions, labels, and ordering.
- GitHub REST and GraphQL routes, headers, arguments, preview media types, pagination, retries, and response handling.
- Lock branch names, lock JSON shape, timestamps, metadata, ownership, sticky behavior, unlock behavior, global-lock behavior, ambiguity handling, and cleanup ordering.
- Deployment payloads, statuses, environment names, environment URLs, task names, polling intervals, and post-deploy completion behavior.
- Template escaping, rendered bytes, parameter parsing, positional arguments, short and long options, equals syntax, coercion, and nested dot paths.

If typing or a refactor exposes an existing bug, characterize the current behavior with a test and defer the behavior correction to a separate, explicitly scoped pull request.

## TypeScript and coding rules

Local development and CI use the exact Node version in `.node-version`; `script/test` fails when the running Node version differs. `action.yml` declares the GitHub Actions runtime. Do not raise the runtime floor, switch module systems, change the TypeScript target, or rely on newer Node APIs without explicit approval and version-specific documentation.

Preserve the strict compiler posture in `tsconfig.json` and `tsconfig.runtime.json`, including `strict`, `noUncheckedIndexedAccess`, `noUncheckedSideEffectImports`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `isolatedModules`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, explicit `.ts` relative import specifiers, and `skipLibCheck: false`.

`npm run lint` is the repository-owned TypeScript policy checker, not ESLint. Preserve its guarantees: no TypeScript suppression directives, explicit `any`, unsafe `any` flow, non-null assertions, scattered unsafe assertions, `var`, broad loose equality, CommonJS, direct or indirect `eval`, `Function` construction, floating promises, non-Error throws, unsafe template interpolation, unsafe conditions, and other policy-covered hazards.

External GitHub payloads, saved state, decoded lock JSON, template data, environment values, REST responses, GraphQL responses, and caught errors are not trustworthy merely because an SDK has optimistic types. Keep unavoidable unsafe assertions centralized in `src/trust-boundaries.ts`; the test-only `__tests__/unsafe-fixtures.ts` helper is the other intentional assertion escape hatch.

Use the existing domain types and discriminated unions to correlate status values with fields that are actually present. Prefer named request objects over growing positional or mode-boolean APIs.

Prefer small typed functions and direct control flow. Add abstractions only when they remove real duplication or match an existing pattern. Do not introduce classes, inheritance, service containers, repositories, factories, speculative interfaces, enums, namespaces, parameter properties, decorators, path aliases, or transform-dependent syntax without explicit review.

Use `readonly` properties and arrays where production code does not mutate values. Give exported runtime functions, parsers, predicates, state-machine helpers, and literal-significant functions explicit return types. Use inference for simple private helpers when the inferred type is clear.

Use `as const satisfies` for literal registries and configuration constants where it preserves narrow values while checking the intended shape. Use bracket access for environment and other index-signature values. Use `node:` specifiers for Node standard-library imports.

Prefer `const`; use `let` only for genuine reassignment. Use explicit `String`, joining, or JSON formatting when implicit conversion could stringify objects, arrays, nullish values, or unknown values.

Keep comments focused on why a non-obvious invariant exists. Do not narrate straightforward code. Match existing naming and module boundaries before inventing helpers. Do not opportunistically refactor adjacent code in a bug fix, dependency update, or documentation change.

## Dependencies and installation

Use npm and the committed `package-lock.json`. The supported install command is:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

Do not run dependency install, fetch, update, or package-manager execution commands unless the maintainer has explicitly approved that work. When dependency work is approved, use the protected package-manager path required by the maintainer or environment, use exact direct versions, and do not print or commit machine registry, proxy, or credential configuration.

All direct runtime and development dependencies are exact pins. `__tests__/dependency-policy.test.ts` is the executable allowlist and graph policy. It verifies approved direct package names and versions, root lockfile agreement, absence of unjustified overrides, public npm registry resolutions, integrity digests, no Git/file/local/private-registry dependencies, zero optional packages, zero install-script packages, and expected graph counts.

Dependency changes require a narrow justification, direct and transitive consumer review, version-range and engine review, lifecycle-script and advisory review, license and bundle-impact review, lockfile churn review, dependency-policy updates, and generated-bundle review when affected.

Do not replace protocol clients, template engines, or parsers with incomplete local implementations merely to reduce package count. A dependency reduction is successful only when behavior, security, maintenance cost, and artifact reproducibility remain stronger overall.

## Local GitHub Actions core compatibility

`src/actions-core.ts` replaces only the narrow `@actions/core` surface actually used by this project. It is an internal runner-protocol adapter, not a general toolkit replacement.

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

## Testing and validation

Stable commands:

```bash
npm run format
npm run format-check
npm run typecheck
npm run typecheck:runtime
npm run lint
npm run test
npm run check
npm run package
npm run all
```

`npm run format` rewrites source formatting. `npm run format-check`, `npm run typecheck`, `npm run typecheck:runtime`, and `npm run lint` are non-mutating. `npm run test` is non-mutating with respect to tracked files but recreates ignored `coverage/`. `npm run check` runs formatting verification, both TypeScript projects, the TypeScript policy, and the complete native Node suite. `npm run package` rebuilds `dist/`; `npm run all` checks and then packages.

The test suite uses the native Node test runner through `script/test`. Do not reintroduce Vitest, Jest, Babel, a coverage wrapper, or a compatibility implementation of another test API without explicit approval.

`script/test` verifies the exact `.node-version`, discovers `__tests__/**/*.test.ts` deterministically, sets the import-dispatch sentinel, runs each test file in an isolated process with no intra-file concurrency, enables pinned experimental ESM module mocking and native coverage features, writes LCOV output, and routes coverage through the project-owned reporter.

Every test must pass. Skipped, todo, cancelled, and failed tests are not acceptable substitutes for coverage. Executable first-party source must maintain 100% native line, branch, and function coverage. Do not add broad coverage exclusions.

Use `node:test` and `node:assert/strict` directly. Prefer explicit awaited values over assertion DSLs. Register table cases with deterministic loops and stable names. Use the narrow helpers in `__tests__/node-test-helpers.ts`, install ESM module mocks before dynamic imports, keep stable mocked-export identities, and rely on process-per-file isolation instead of production dependency-injection seams solely for tests.

For documentation-only or instruction-only changes, verify claims against current scripts, package metadata, action metadata, workflows, and tests. Run formatting verification only for files covered by the formatter. Do not regenerate `dist/` when runtime source is unchanged.

## Bundling and committed distribution

The committed distribution contract consists of exactly:

- `dist/index.js`
- `dist/index.js.map`
- `dist/licenses.txt`
- `dist/package.json`
- `dist/sourcemap-register.cjs`
- `dist/sourcemap-register.js`

Any source change that affects packaging must regenerate the bundle with `npm run package` or `npm run all`. Do not manually edit generated `dist/` files.

Package reproduction is exact. The `package-check` workflow installs from the lockfile, rebuilds `dist/`, and fails on tracked or untracked `dist/` changes.

Review generated changes semantically, not only by size or hash. Compare filenames, hashes, sizes, licenses, source-map loaders, package boundary, module inventory, runtime dependencies, action strings, defaults, state/output keys, API routes, API arguments, control flow, errors, serialization, templates, and private/local path exposure.

## Continuous integration

Preserve existing workflow and required-check identities:

- `actions-config-validation` validates action metadata.
- `lint` runs formatting verification, both TypeScript projects, and the TypeScript policy.
- `test` runs the complete native Node suite and coverage contract.
- `package-check` proves exact bundle reproduction.
- `acceptance` rebuilds and executes the ESM bundle through its main and post entrypoints.

CI uses `.node-version` and repository scripts. Do not duplicate long tool flags in workflow YAML when a script is the source of truth.

Checkout credentials should not persist in workflows that do not need to push. Keep `persist-credentials: false` where present.

Release-critical third-party actions are pinned to full commit SHAs. Do not loosen those pins. Treat broad workflow-action pinning or replacement outside the release chain as a separate security-maintenance scope rather than incidental churn.

## Release process

`src/version.ts` is the sole normal release input. Only stable `vMAJOR.MINOR.PATCH` versions are accepted.

A normal release is a dedicated, reviewed version-bump pull request that changes `src/version.ts`, runs complete checks, regenerates the committed distribution, and includes only the version source plus mechanically affected bundle artifacts unless another change is explicitly part of the release.

The `release` workflow runs from protected `main` when `src/version.ts` changes. It freezes the merge SHA, reinstalls from the exact lockfile with lifecycle scripts disabled, runs checks, rebuilds and verifies the committed distribution, attests `action.yml` and all six distribution files, verifies direct attestations, creates or validates an annotated exact-version tag, creates an assetless stable immutable GitHub Release, verifies release integrity, and moves the ordinary `vMAJOR` compatibility tag only after exact release verification.

Do not manually push release tags, attach arbitrary release assets, create release candidates, create a `vMAJOR.MINOR` alias, move the major tag outside the verified workflow, or bump `src/version.ts` as part of unrelated work.

Do not describe the compact single-job release workflow as SLSA Build Level 3. It provides GitHub build provenance and immutable-release integrity but does not isolate the build in a separate reusable workflow boundary.

## Live acceptance for runtime changes

Unit, type, policy, and bundle checks are necessary but may not be sufficient for deployed behavior, runner protocol, dependency, bundler, or main/post lifecycle changes.

For high-risk runtime changes, use an exact candidate commit SHA in a public-safe consumer repository rather than a mutable branch reference. Remember that `issue_comment` workflows execute the workflow definition from the consumer repository's default branch, so reliable live acceptance may require a reviewed temporary default-branch pin before comments can exercise the candidate.

Useful IssueOps acceptance can include `.wcid`, `.help`, `.noop`, `.deploy`, stable-branch or rollback deploys, `.unlock`, merge-deploy mode, and unlock-on-merge mode. Record the resolved action SHA, selected checkout SHA, key outputs, step conclusions, deployment state, lock state, comments, and post-action result. Any candidate commit change invalidates earlier exact-SHA live results.

After acceptance, restore consumer workflow references through normal review, remove harmless markers, delete temporary branches, verify that no test lock remains, and preserve unrelated existing locks or pull requests.

## Documentation and Markdown

- Keep public documentation accurate with executable scripts, package metadata, action metadata, workflows, and tests.
- Do not hard-wrap Markdown prose. Keep each paragraph and list item on one source line and let the renderer wrap it.
- Preserve structural line breaks for headings, blank lines, lists, tables, block quotes, code fences, and explicit hard breaks.
- Use repository-relative links for tracked documentation.
- Avoid duplicating volatile version, package-count, input-count, output-count, or workflow facts unless a test or update process keeps them synchronized.
- Describe security properties precisely. Distinguish exact lockfile reproducibility, disabled install scripts, provenance, immutable releases, branch-deploy locks, workflow concurrency, and full hermeticity rather than treating them as synonyms.
- Keep contributor-facing instructions understandable without assuming knowledge of private conversations or local machine setup.

## Pull request expectations

- Keep the title short and descriptive.
- Keep the body concise and focused on purpose, important behavior or security boundaries, dependency changes, generated artifacts, and public compatibility impact.
- Do not paste routine local validation transcripts when CI exposes the same result.
- Call out intentional deviations, remaining risks, generated-artifact changes, and deferred behavior fixes.
- Prefer reviewable commits that separate policy/tooling, runtime behavior, tests, dependency resolution, documentation, and generated distribution when that separation helps reviewers.
- The final head, not an intermediate commit, is the acceptance unit.
- Wait for existing required checks and inspect review comments against the current head before recommending merge.

## Change-specific rules

Documentation-only or instruction-only changes:

- Verify factual claims against the repository.
- Keep examples public-safe.
- Do not regenerate `dist/` when runtime source is unchanged.

Dependency changes:

- Establish the current graph and bundle inventory before editing.
- Use an approved protected dependency-fetch path.
- Update package manifests, lockfile, dependency-policy expectations, licenses, docs, and bundle only where the actual result requires it.
- Reject unrelated resolution churn.
- Prove removed packages or overrides are absent and retained transitive versions remain expected.
- Run complete checks and package reproduction when packaging is affected.

Runtime behavior changes:

- Add characterization tests before changing poorly specified behavior.
- Preserve main/post dispatch, action state, inputs, outputs, API calls, locks, deployments, templates, and error handling unless explicitly changing that contract.
- Run complete checks, rebuild `dist/`, and perform a semantic bundle audit.
- Use exact-SHA live acceptance when the observable action path is materially affected.

Test or tooling migrations:

- Preserve behavior cases and stable test names where practical.
- Do not weaken coverage, compiler, or policy gates.
- Prove test isolation, module-mock behavior, source inventory, deterministic reporting, dependency exposure, and install-script exposure.
- Treat experimental Node features as exact-version-pinned test-only boundaries.

Action metadata changes:

- Update typed registries, schema fixtures, documentation, and contract tests with `action.yml`.
- Preserve `runs.using`, `runs.main`, and `runs.post` unless explicitly authorized.
- Treat any input, output, default, or accepted-value change as a public compatibility decision.

Release changes:

- Keep ordinary feature work separate from `src/version.ts`.
- Verify the exact version transition and generated bundle diff.
- Do not publish from a feature branch or create tags manually.
- After an authorized release merge, monitor build, attestation, tag, release, immutability, latest-release, and major-alias verification to completion.

## Definition of done

A change is complete only when the applicable conditions are satisfied:

- The requested behavior or maintenance goal is implemented without unapproved scope expansion.
- The worktree and branch contain no unrelated edits or private material.
- Formatting, type checking, linting, tests, coverage, action-contract checks, dependency policy, package reproduction, and generated-artifact review have been run as appropriate for the change.
- Runtime source changes that affect packaging include regenerated and semantically reviewed `dist/` files.
- Existing CI check identities remain intact and green.
- High-risk runtime changes have appropriate exact-SHA live acceptance.
- Pull request metadata and commit history are concise, accurate, public-safe, and targeted to the intended repository and branch.
- No release, tag, version bump, settings change, target change, merge, or destructive cleanup occurred without explicit authorization.
