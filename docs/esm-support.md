# ESM Support

This document explains the current ESM (ECMAScript Modules) support in this project and how to work with ESM dependencies.

## Current State

This project is configured to support ESM dependencies while maintaining compatibility with Jest for testing. The key configurations are:

### Jest Configuration (`jest.config.js`)

```javascript
export default {
  // ... other config ...
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit)/)'
  ]
}
```

This configuration tells Jest to transform (using Babel) any packages in `node_modules` that match the pattern `@octokit/*`. This allows the project to use ESM packages from the Octokit ecosystem.

### Babel Configuration (`.babelrc`)

```json
{
    "env": {
        "test": {
            "plugins": [
                "@babel/plugin-transform-modules-commonjs"
            ]
        }
    }
}
```

This configuration tells Babel to transform ESM imports to CommonJS when running in the test environment (`NODE_ENV=test`).

## Supported Packages

The following types of packages are supported:

1. **CommonJS packages** - Work natively
2. **Dual-mode packages** (ESM + CommonJS) - Work with the current configuration as long as they provide a CommonJS entry point (e.g., `@octokit/plugin-retry@6.x`)
3. **Pure ESM packages with CommonJS fallback** - Work if they provide `dist-node` or similar CommonJS builds

## Known Limitations

### Pure ESM Packages (e.g., `@octokit/plugin-retry@7.x+`)

Pure ESM packages that only provide an ESM entry point (with `"type": "module"` and only `"exports"` field pointing to ESM code) are **not currently supported** with this Jest configuration.

The `@octokit/plugin-retry@7.0.0` package is a pure ESM package and encounters issues because:
1. It has `"type": "module"` in its package.json
2. It only provides an `"exports"` field with ESM entry points
3. Jest's Babel transform cannot properly resolve and transform the nested ESM dependencies

## Code Changes Made for ESM Compatibility

### Import Statement Updates

The import statement for `@octokit/plugin-retry` was updated to use the correct named export:

**Before:**
```javascript
import {octokitRetry} from '@octokit/plugin-retry'
```

**After:**
```javascript
import {retry} from '@octokit/plugin-retry'
```

This matches the actual export name from the package and works with both v6 (CommonJS) and future ESM versions.

### Usage Updates

All usages were updated accordingly:

```javascript
const octokit = github.getOctokit(token, {
  userAgent: `github/branch-deploy@${VERSION}`,
  additionalPlugins: [retry]  // Changed from octokitRetry
})
```

## Future: Full ESM Support

To support pure ESM packages (like `@octokit/plugin-retry@7.x+`), the project would need to either:

### Option 1: Convert to Full ESM (Recommended but requires significant changes)

1. Add `"type": "module"` to `package.json`
2. Update all test files to import Jest globals from `@jest/globals`:
   ```javascript
   import {jest, test, expect, beforeEach} from '@jest/globals'
   ```
3. Use `NODE_OPTIONS="--experimental-vm-modules"` when running Jest
4. Update Jest config to:
   ```javascript
   export default {
     testEnvironment: 'node',
     transform: {},
     // Remove transformIgnorePatterns as ESM works natively
   }
   ```

### Option 2: Use a Custom Resolver (Partial solution)

Create a custom Jest resolver that maps pure ESM packages to their bundled versions or creates shims. This is complex and maintenance-intensive.

### Option 3: Wait for Jest Native ESM Support

Jest's ESM support is still experimental. Future versions of Jest may provide better native ESM support without requiring `--experimental-vm-modules`.

## Current Recommendation

For now, stay with dual-mode or CommonJS-compatible versions of dependencies (e.g., `@octokit/plugin-retry@6.x`). The current configuration is "ESM-ready" and will make future migration easier when:
1. Jest has better native ESM support, or
2. The team decides to convert the entire project to ESM

The code changes made (using `{retry}` import) are compatible with both current and future ESM versions of the packages.
