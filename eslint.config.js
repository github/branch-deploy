// @ts-check

import js from '@eslint/js'
import {defineConfig} from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  // Centralize ignores here (ESLint v9 no longer supports `.eslintignore`).
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'badges/**']
  },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  // Project-wide type-aware settings (ESM + Node).
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowAny: false,
          allowBoolean: true,
          allowNever: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false
        }
      ],
      '@typescript-eslint/strict-boolean-expressions': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },

  // Exported runtime boundaries carry explicit return types; private helpers
  // can continue to use local inference.
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error'
    }
  },

  // These two files are the only named trust boundaries permitted to model
  // runtime values that intentionally fall outside the static type contract.
  {
    files: ['src/trust-boundaries.ts', '__tests__/unsafe-fixtures.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'off'
    }
  }
)
