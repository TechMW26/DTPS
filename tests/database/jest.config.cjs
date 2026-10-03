const nextJest = require('next/jest');
module.exports = nextJest({dir:'./'})({
  rootDir:'../..',testEnvironment:'node',testMatch:['<rootDir>/tests/database/**/*.test.ts'],
  moduleNameMapper:{'^@/(.*)$':'<rootDir>/src/$1'},clearMocks:true,
});
