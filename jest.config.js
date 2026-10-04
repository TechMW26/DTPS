const nextJest = require('next/jest');
module.exports = nextJest({dir:'./'})({
  testEnvironment:'node',
  setupFilesAfterEnv:['<rootDir>/tests/setup/jest.setup.ts'],
  testMatch:['<rootDir>/tests/**/*.integration.test.ts'],
  moduleNameMapper:{'^@/(.*)$':'<rootDir>/src/$1','^formidable$':'<rootDir>/tests/mocks/formidable.js'},
  clearMocks:true,
  restoreMocks:true,
  maxWorkers:1,
  testTimeout:15000,
  coverageProvider:'v8',
  coverageReporters:['text','lcov','json-summary'],
});
