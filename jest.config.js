export default {
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
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
  coverageThreshold: {
    global: {
      lines: 100,
      statements: 100,
      branches: 100,
      functions: 100,
    },
  },
};
