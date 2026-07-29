import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    hookTimeout: 20000,
    testTimeout: 10000,
  },
});
