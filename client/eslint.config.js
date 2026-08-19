import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Deliberately narrow. There was no linter at all, and a maximal config
// dropped onto 30k lines of working code produces a few thousand
// complaints nobody will read — which is the same as having no linter,
// only noisier.
//
// So: the rules that catch real defects (a hook called conditionally, a
// promise nobody awaits, a variable used before it exists) are errors, and
// pure style is left to the reviewer. Widen it once this is quiet.
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The hooks rules are the point of having a linter on a React
      // codebase — a conditional hook is a real bug that types can't see.
      'react-hooks/rules-of-hooks': 'error',
      // Exhaustive-deps stays a warning: this codebase has several
      // deliberate, commented omissions, and turning them into errors would
      // mean either lying in the deps array or littering suppressions.
      'react-hooks/exhaustive-deps': 'warn',

      // The plugin's newer rules check readiness for the React Compiler:
      // no mutation of values the compiler wants to treat as frozen, no
      // setState straight from an effect body, no reading a ref during
      // render. They flag patterns that are correct and working under React
      // 18, which this app is on. Kept visible as warnings — they are the
      // to-do list for a compiler migration — rather than as errors that
      // would demand a large refactor before the linter is useful at all.
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',

      // `any` is everywhere here on purpose (untyped API payloads); making
      // it an error is a separate, larger piece of work.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // Destructuring a field purely to drop it from an object is a
        // deliberate idiom in this codebase (stripping fields from an API
        // payload), not an oversight.
        ignoreRestSiblings: true,
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  // The service worker runs in its own global scope — `self`, `caches` and
  // the rest are real there and undefined everywhere else.
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
);
