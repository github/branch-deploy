import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.js'],
      exclude: ['node_modules', '__tests__'],
      all: true,
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    },
    globals: true,
    reporters: ['default'],
    logHeapUsage: false,
    // Suppress console output from tests
    onConsoleLog() {
      return false
    }
  }
})
