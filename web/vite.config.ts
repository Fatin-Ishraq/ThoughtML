import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Relative base so a production build can be hosted from any subpath.
// Vite handles `*.wasm?url` imports natively, so no extra wasm plugin is needed.
//
// Two entry points: `index.html` (the playground, with the wasm parser) and
// `viewer.html` (the standalone, read-only, wasm-free document view).
export default defineConfig({
  base: './',
  // Allow importing the baked standalone-viewer template from the sibling Rust
  // crate (`../crates/thoughtml/assets/viewer.html`) for the download feature.
  server: { fs: { allow: ['..'] } },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer.html'),
      },
    },
  },
})
