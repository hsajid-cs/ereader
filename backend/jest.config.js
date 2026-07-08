/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  maxWorkers: 1,
  setupFiles: ["<rootDir>/tests/env.ts"],
  globalSetup: "<rootDir>/tests/globalSetup.ts",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};
