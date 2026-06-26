import {defineConfig} from 'vitest/config'
import type {CoverageV8Options} from 'vitest/node'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['node_modules', '__tests__'],
      all: true,
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    } as CoverageV8Options & {all: boolean},
    globals: true,
    reporters: ['default'],
    logHeapUsage: false,
    // Suppress console output from tests
    onConsoleLog() {
      return false
    }
  }
})
