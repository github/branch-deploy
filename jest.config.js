export default {
  transform: {},
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit)/)'
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