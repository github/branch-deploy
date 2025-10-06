export default {
  coverageReporters: ['json-summary', 'text', 'lcov'],
  collectCoverage: true,
  collectCoverageFrom: ['./src/**'],
  coverageThreshold: {
    global: {
      lines: 100,
      statements: 100,
      branches: 100,
      functions: 100
    }
  },
  testEnvironment: 'node',
  // Allow Jest to transform @octokit packages from node_modules
  // This enables support for ESM packages from the Octokit ecosystem
  transformIgnorePatterns: ['node_modules/(?!(@octokit)/)']
}
