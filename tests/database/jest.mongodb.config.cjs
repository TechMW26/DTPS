const nextJest = require('next/jest');
module.exports = nextJest({dir:'./'})({
  testTimeout:30000, rootDir:'../..', testEnvironment:'<rootDir>/tests/database/mongo-environment.cjs',
  testMatch:['<rootDir>/tests/database/**/*.test.ts'],
  setupFilesAfterEnv:['<rootDir>/tests/database/mongo-local-setup.cjs'],
  moduleNameMapper:{'^@/(.*)$':'<rootDir>/src/$1'}, clearMocks:true,
});
