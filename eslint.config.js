import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'legacy/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Browser tests run in Node, but their page callbacks run in the page.
    files: ['test/e2e/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { URL: 'readonly', console: 'readonly', document: 'readonly' },
    },
  },
);
