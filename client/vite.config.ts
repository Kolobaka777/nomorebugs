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
  },
})
