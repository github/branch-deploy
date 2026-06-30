# Copilot Instructions

## Environment Setup

Bootstrap the project by running:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

Use the exact dependency versions recorded in `package-lock.json`. Do not add or update a dependency without maintainer approval, and pin approved development-tool additions to an exact version.

## Checks and Testing

Run the complete non-mutating project check before bundling:

```bash
npm run check
```

This verifies formatting, the full project and runtime-only TypeScript configurations, the project-owned TypeScript safety policy, and the complete native Node test suite. Every test must pass, and executable first-party code must maintain 100% line, function, and branch coverage.

Both TypeScript projects check third-party declarations. `tsconfig.runtime.json` separately proves that runtime source and local declarations do not depend on test tooling.

`npm run test` must not rewrite tracked files. The tracked 100% coverage badge reflects the enforced coverage thresholds and does not need a separate update command.

Unit tests should exist in the `__tests__` directory. They use `node:test`, `node:assert/strict`, and the exact Node version in `.node-version`. Native ESM module mocking and coverage are experimental test-only boundaries; keep their use inside the typed test helpers.

## Bundling

The supported public interface is `action.yml` plus the committed `dist/index.js` bundle. This repository is not an npm library and does not publish a source-import API or declaration package.

Regenerate the committed bundle with:

```bash
npm run bundle
```

This uses Vercel's `ncc` to bundle TypeScript source into ES2022 JavaScript for the Node 24 GitHub Actions runtime. Bundling must be reproducible: every tracked and untracked change under `dist/` must be intentional and committed. `npm run all` runs the complete check and then regenerates the bundle.

## Project Guidelines

- Base new work on latest `main` branch
- Changes should maintain consistency with existing patterns and style.
- Prefer small, typed functions and the simplest design that expresses the domain. Do not introduce classes, object-oriented patterns, or abstractions unless the behavior genuinely requires them.
- Keep strict compiler and TypeScript safety-policy checks enabled. Model correlated states with discriminated unions, use readonly data where production does not mutate it, and give exported state-machine or literal-significant functions explicit return types.
- Treat GitHub payloads, saved state, decoded JSON, and external API responses as untrusted boundary values. Keep unavoidable assertions in the named trust-boundary module; do not scatter double assertions, non-null assertions, `any`, `@ts-ignore`, or `@ts-nocheck` through project code.
- Use native typed mocks (`mock.fn`, `mock.method`, and the narrow ESM module-mock helper) and fixtures derived from production `Parameters` and `ReturnType` types. Use the single named unsafe fixture helper only for tests intentionally passing values outside the TypeScript contract.
- Preserve the complete `action.yml` input, output, lifecycle, state-serialization, and ESM bundle contracts unless a change explicitly authorizes a public behavior change.
- Document changes clearly and thoroughly, including updates to existing comments when appropriate. Try to use the same "voice" as the other comments, mimicking their tone and style.
- When responding to code refactoring suggestions, function suggestions, or other code changes, keep responses concise. After refactoring, run `npm run check`.
- When suggesting code changes, always opt for the most maintainable approach. Try your best to keep the code clean and follow DRY principles. Avoid unnecessary complexity and always consider the long-term maintainability of the code.
- When writing unit tests, try to consider edge cases as well as the main path of success. This will help ensure that the code is robust and can handle unexpected inputs or situations.
- Hard-coded strings should almost always be constant variables.
- In writing code, take the following as preferences but not rules:
  - understandability over concision
  - syntax, expressions, and blocks that are common across many languages over language-specific syntax.
  - more descriptive names over brevity of variable, function, and class names
  - the use of whitespace (newlines) over compactness of files
  - naming of variables and methods that lead to expressions and blocks reading more like English sentences.
  - less lines of code over more. Keep changes minimal and focused.

## Pull Request Requirements

- All tests must pass.
- The TypeScript safety policy must pass.
- Documentation must be up-to-date.
- The body of the Pull Request should:
  - contain a summary of the changes
  - make special note of any changes to dependencies
  - comment on the security of the changes being made and offer suggestions for further securing the code

## Repository Organization

- `.github/` - GitHub configurations and settings
- `docs/` - Main documentation storage
- `script/` - Repository maintenance scripts
- `src/` - Main code for the project. This is where the main application/service code lives
- `__tests__/` - Tests for the project. This is where the unit tests live
- `dist/` - The committed JavaScript bundle executed by the GitHub Actions runner
- `action.yml` - The GitHub Action file. This is where the GitHub Action is defined
