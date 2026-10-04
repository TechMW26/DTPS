const nextJest = require('next/jest');
module.exports = nextJest({dir:'./'})({
  // Transaction contention retries can exceed Jest's default five seconds.
  testTimeout:30000,
  rootDir:'../..',testEnvironment:'node',testMatch:['<rootDir>/tests/database/**/*.test.ts'],
  moduleNameMapper:{'^@/(.*)$':'<rootDir>/src/$1'},clearMocks:true,
});
