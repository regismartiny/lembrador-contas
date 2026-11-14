import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    // Server-side Node code (default for the whole project)
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2024,
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      // Allow intentionally-unused params/vars marked with a leading underscore
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Browser-bundled front-end code (jQuery, DOM, web push)
    files: ['src/public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        $: 'readonly',
        jQuery: 'readonly',
      },
    },
  },
  {
    // Service worker runtime
    files: ['src/public/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    // Shared browser globals in the multi-script front-end bundle (main.js)
    files: ['src/public/main.js'],
    languageOptions: {
      globals: {
        swRegistration: 'writable',
        applicationServerPublicKey: 'writable',
        isSubscribed: 'writable',
      },
    },
  },
  {
    // Bun/Jest-style test globals
    files: ['src/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  {
    ignores: ['node_modules/**', 'downloads/**', '.credentials/**'],
  },
];
