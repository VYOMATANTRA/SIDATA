import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';

export default [
  { ignores: ['generated/**'] },

  js.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      '@typescript-eslint/no-unused-vars': 'error',
      // TODO(PM): flip to 'error' once existing `any` usages (e.g. auth.middleware.ts) are typed.
      '@typescript-eslint/no-explicit-any': 'warn',

      'prettier/prettier': 'error',
    },
  },

  // Plain Node scripts (e.g. scripts/coverage.mjs) — no TypeScript parser needed, just Node globals.
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },

  prettierConfig,
];
