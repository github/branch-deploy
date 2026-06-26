// @ts-check

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** @type {import("typescript-eslint").ConfigArray} */
export default [
  // Centralize ignores here (ESLint v9 no longer supports `.eslintignore`).
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'badges/**']
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Project-wide TypeScript settings (ESM + Node).
  {
    files: ['**/*.ts', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',

      // Preserve the JavaScript runtime exactly during this migration. These
      // rules would otherwise require control-flow or emitted-code rewrites.
      'no-var': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off'
    }
  },

  // Vitest globals for tests/config files.
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', 'vitest.config.ts'],
    languageOptions: {
      globals: {
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
