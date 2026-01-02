import js from '@eslint/js'
import globals from 'globals'

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  // Centralize ignores here (ESLint v9 no longer supports `.eslintignore`).
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'badges/**']
  },

  // Equivalent of `extends: "eslint:recommended"` in flat-config land.
  js.configs.recommended,

  // Project-wide JS settings (ESM + Node).
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.es2022,
        ...globals.node
      }
    }
  },

  // Vitest globals for tests/config files.
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js', 'vitest.config.js'],
    languageOptions: {
      globals: {
        ...globals.es2022,
        ...globals.node,
        vi: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    }
  }
]
