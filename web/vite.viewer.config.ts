import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the standalone viewer into ONE self-contained HTML file — all JS, CSS,
// and fonts inlined — with the `<script id="thoughtml-model">` tag left empty.
// The output is the *template* the CLI bakes a document's canonical JSON into
// (`thml <doc>.thml --html`), so it lands directly in the crate's assets dir
// where `main.rs` embeds it via `include_str!`.
export default defineConfig({
  base: './',
  plugins: [
    viteSingleFile(),
    {
      // Some bundled dependencies carry spaces at the end of template-literal
      // lines. Keep the committed single-file artifact friendly to diff/check
      // tooling without changing its JavaScript semantics.
      name: 'trim-viewer-trailing-whitespace',
      enforce: 'post',
      transformIndexHtml: (html) => html.replace(/[ \t]+$/gm, ''),
      generateBundle: (_options, bundle) => {
        for (const output of Object.values(bundle)) {
          if (output.type === 'asset' && output.fileName.endsWith('.html') && typeof output.source === 'string') {
            output.source = output.source.replace(/[ \t]+$/gm, '')
          }
        }
      },
    },
  ],
  // Don't copy web/public (dev fixtures) into the crate's assets dir — the
  // template must be the single viewer.html and nothing else.
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: resolve(__dirname, '../crates/thoughtml/assets'),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'viewer.html'),
    },
  },
})
