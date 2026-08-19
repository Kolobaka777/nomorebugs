import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Runs before any test file imports the app — see the file for why.
    setupFiles: ['./test/setup-limits.js'],
    hookTimeout: 20000,
    testTimeout: 10000,
    // See the note in client/vite.config.ts — the numbers exist so a drop
    // is visible, not to be admired. db/seedDemoContent.js is data, and the
    // seed script is a one-off dev utility neither of which the suite runs.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      include: ['src/**/*.js', 'db/schema.js'],
      exclude: ['db/seed.js', 'db/seedDemoContent.js', 'db/migrate_*.mjs'],
      thresholds: { lines: 70, functions: 70, branches: 75, statements: 70 },
    },
  },
});
