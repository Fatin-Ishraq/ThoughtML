import { defineConfig } from 'vite'

// Relative base so a production build can be hosted from any subpath.
// Vite handles `*.wasm?url` imports natively, so no extra wasm plugin is needed.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
})
