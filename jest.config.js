module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Run test suites serially — they share MySQL/MongoDB/Redis test databases
  maxWorkers: 1,

  // Timeout per individual test (order tests with 2 concurrent requests need more time)
  testTimeout: 30000,

  // Coverage configuration
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',          // entry point — not unit-testable
    '!src/config/index.js',    // env validation only
  ],
  coverageThreshold: {
    global: {
      lines: 70,
      functions: 70,
      branches: 60,
      statements: 70
    }
  },
  coverageReporters: ['text', 'text-summary', 'lcov', 'html']
};
