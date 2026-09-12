const nextJest = require("next/jest");
module.exports = nextJest({ dir: "./" })({
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/tests/ui/**/*.test.tsx"],
  rootDir: "../..",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  clearMocks: true,
});
