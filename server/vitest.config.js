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
      // 'text' as well as the summary: the four aggregate numbers hide
      // the shape, and the shape is the useful part. An 81% total sat on
      // top of a 0%-covered shutdown path and a 0.44%-covered profile
      // editor, and nothing in the default output said so.
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.js', 'db/schema.js'],
      exclude: ['db/seed.js', 'db/seedDemoContent.js'],
      thresholds: { lines: 70, functions: 70, branches: 75, statements: 70 },
    },
  },
});
