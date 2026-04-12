/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@k12-ai/shared(.*)$': '<rootDir>/packages/shared/src$1',
    '^@k12-ai/(.*)$': '<rootDir>/packages/$1/src',
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/index.ts',
  ],
};
