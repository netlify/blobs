'use strict'

const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  parserOptions: {
    sourceType: 'module',
  },
  rules: {
    complexity: 'off',
    'import/extensions': 'off',
    'max-lines': 'off',
    'max-lines-per-function': 'off',
    'max-statements': 'off',
    'node/no-missing-import': 'off',
    'import/no-unresolved': 'off',
    'n/no-missing-import': 'off',
    'no-magic-numbers': 'off',
    'no-shadow': 'off',
    'no-use-before-define': 'off',
    'unicorn/prefer-json-parse-buffer': 'off',
    'unicorn/prefer-ternary': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
  },
  overrides: [
    ...overrides,
    {
      files: ['src/**/*.test.ts', 'vitest.config.ts'],
      rules: {
        'max-lines-per-function': 'off',
        'max-nested-callbacks': 'off',
        'max-statements': 'off',
        'no-magic-numbers': 'off',
        'require-await': 'off',
        'unicorn/consistent-function-scoping': 'off',
      },
    },
  ],
}
