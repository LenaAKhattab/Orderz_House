import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tailwind v4: process `@import "tailwindcss"` via postcss.config.mjs (`@tailwindcss/postcss`).
// The Vite-only plugin can leave that import for postcss-import, which resolves `tailwindcss`
// as a bogus filesystem path (e.g. frontend/tailwindcss on Windows).
export default defineConfig({
  plugins: [react()],
})
