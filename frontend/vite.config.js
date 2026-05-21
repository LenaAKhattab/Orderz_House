import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tailwind v4: process `@import "tailwindcss"` via postcss.config.mjs (`@tailwindcss/postcss`).
// The Vite-only plugin can leave that import for postcss-import, which resolves `tailwindcss`
// as a bogus filesystem path (e.g. frontend/tailwindcss on Windows).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/posthog-js')) {
            return 'vendor-posthog';
          }
          if (id.includes('node_modules/recharts')) {
            return 'vendor-recharts';
          }
          if (id.includes('node_modules/embla-carousel')) {
            return 'vendor-embla';
          }
          if (
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/@remix-run/router')
          ) {
            return 'vendor-router';
          }
        },
      },
    },
  },
})
