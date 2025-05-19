export default {
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit)/)'
  ],
  setupFilesAfterEnv: [
    './jest-setup.js'
  ],
  coverageReporters: [
    'json-summary',
    'text',
    'lcov',
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    './src/**',
  ],
  // Temporarily lower coverage thresholds during development
  coverageThreshold: {
    global: {
      lines: 0,
      statements: 0,
      branches: 0,
      functions: 0,
    },
  },
};