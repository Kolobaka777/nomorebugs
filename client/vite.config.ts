import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // React/react-dom/react-router/axios almost never change between
        // deploys (they're pinned deps, not app code) — splitting them into
        // their own chunk means a returning user re-downloads only the
        // page code that actually changed on redeploy, instead of the
        // whole eagerly-loaded entry bundle every single time.
        manualChunks(id) {
          // Anchored to "node_modules/<pkg>/" specifically — a loose
          // "/react/" test also matches unrelated scoped packages whose
          // folder happens to be named "react" (e.g. @tiptap/react),
          // which would drag the whole Tiptap editor into this
          // eagerly-loaded vendor chunk and defeat GuideEditor's lazy split.
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/node_modules[\\/]react-router/.test(id)) return 'vendor-router';
          if (/node_modules[\\/]axios[\\/]/.test(id)) return 'vendor-axios';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Until this existed, "669 tests" was a count of tests and told nobody
    // what fraction of the code ever runs. The thresholds are set at
    // roughly where the suite already stands, so they hold the line rather
    // than failing the build on day one — raise them as coverage grows.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Hand-authored pixel-art and icon path data: thousands of lines of
        // static shapes with no branches to exercise.
        'src/components/Pixel*.tsx',
        'src/components/Icon.tsx',
        'src/assets/**',
      ],
      // A ratchet, not an aspiration: set just under where the suite
      // actually stands (measured 48.4 / 35.2 / 44.4 / 45.6), so a change
      // that drops coverage fails the build while today's number passes. A
      // threshold that fails on the day it lands gets deleted instead of
      // met. Raise these as coverage climbs — the client is the weak half;
      // the server sits near 80%.
      thresholds: { lines: 47, functions: 34, branches: 43, statements: 44 },
    },
  },
})
