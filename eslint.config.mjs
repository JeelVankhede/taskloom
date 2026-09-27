import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-seed/**',
      '**/coverage/**',
      '**/generated/**',
      'api/prisma/migrations/**',
      'web/storybook-static/**',
      'web/playwright-report/**',
      'web/test-results/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: false, skipComments: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Nest DI needs runtime imports of injected classes; decorators need value imports.
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-restricted-properties': [
        'error',
        { property: '$queryRawUnsafe', message: 'Use tagged $queryRaw.' },
        { property: '$executeRawUnsafe', message: 'Use tagged $executeRaw.' },
      ],
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: [
      '**/*.config.{ts,mjs,js}',
      'codegen.ts',
      'web/e2e/**',
      'web/e2e-stack/**',
      'web/scripts/**',
      'api/seed/**',
    ],
    languageOptions: { globals: globals.node },
  },
);
