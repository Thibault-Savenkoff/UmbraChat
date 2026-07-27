import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // wasm-crypto is a sibling package (file: dependency, symlinked via
      // node_modules), so it resolves outside this project's root — Vite's
      // dev server blocks serving files outside it by default.
      allow: ['..'],
    },
  },
})
