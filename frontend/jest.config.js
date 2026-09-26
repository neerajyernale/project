/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@wms/core$': '<rootDir>/src/app/core/index.ts',
    '^@wms/design-system$': '<rootDir>/src/app/shared/index.ts',
    '^@env/(.*)$': '<rootDir>/src/environments/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.spec.json',
      stringifyContentPathRegex: '\\.(html|svg)$',
    },
  },
  collectCoverageFrom: ['src/app/**/*.ts', '!src/app/**/*.module.ts', '!src/app/**/index.ts'],
};
