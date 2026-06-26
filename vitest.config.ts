import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./__tests__/setup.ts'],
    clearMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['node_modules', '__tests__'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    }
  }
})
