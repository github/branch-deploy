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
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit)/)'
  ]
}
