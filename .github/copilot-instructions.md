# Copilot Instructions

## Environment Setup

Bootstrap the project by running:

```bash
npm install
```

## Testing

Ensure all unit tests pass by running the following:

```bash
npm run test
```

This project should include unit tests for all lines, functions, and branches of code.

This project **requires 100% test coverage** of code.

Unit tests should exist in the `__tests__` directory. They are powered by `jest`.

## Bundling

The final commit should always be a bundle of the code. This is done by running the following command:

```bash
npm run all
```

This uses Vercel's `ncc` to bundle JS code for running in GitHub Actions.

## Project Guidelines

- Follow:
   - Object-Oriented best practices, especially abstraction and encapsulation
   - GRASP Principles, especially Information Expert, Creator, Indirection, Low Coupling, High Cohesion, and Pure Fabrication
   - SOLID principles, especially Dependency Inversion, Open/Closed, and Single Responsibility
- Base new work on latest `main` branch
- Changes should maintain consistency with existing patterns and style.
- Document changes clearly and thoroughly, including updates to existing comments when appropriate. Try to use the same "voice" as the other comments, mimicking their tone and style.
- When responding to code refactoring suggestions, function suggestions, or other code changes, please keep your responses as concise as possible. We are capable engineers and can understand the code changes without excessive explanation. If you feel that a more detailed explanation is necessary, you can provide it, but keep it concise. After doing any refactoring, ensure to run `npm run test` to ensure that all tests still pass.
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
- The linter must pass.
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
- `dist/` - This is where the JS compiled code lives for the GitHub Action
- `action.yml` - The GitHub Action file. This is where the GitHub Action is defined
