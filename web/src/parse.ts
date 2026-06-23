// Parser adapter — the *compile* boundary. This calls the Rust parser compiled
// to wasm and hands back the canonical model (whose shapes live in `model.ts`).
// The view layer (graph, detail, legend) depends on `model.ts` alone, never on
// this file, so a renderer can be driven by canonical JSON that was produced
// anywhere — live here, or baked into a standalone artifact.

import init, { parse as wasmParse, parse_what_if as wasmWhatIf, parse_project as wasmProject } from './wasm/thoughtml_wasm.js'
import wasmUrl from './wasm/thoughtml_wasm_bg.wasm?url'
import type { ParseResult, Overrides } from './model'

// Re-export the model contract so existing `./parse` importers keep working and
// the compile boundary presents a single surface.
export * from './model'

let ready: Promise<void> | null = null

/** Load the wasm module once. */
export function initParser(): Promise<void> {
  if (!ready) ready = init({ module_or_path: wasmUrl }).then(() => undefined)
  return ready
}

/** Parse source into the canonical model, diagnostics, and surface AST. */
export function parse(src: string): ParseResult {
  return JSON.parse(wasmParse(src)) as ParseResult
}

/** Parse `src` as a project (§12.5), resolving any `import`s against `sources`
 *  (a `name -> source` map). A document with no imports parses just like `parse`. */
export function parseProject(src: string, sources: Record<string, string>): ParseResult {
  return JSON.parse(wasmProject(src, JSON.stringify(sources))) as ParseResult
}

/** Re-parse with a what-if perturbation (§10.5); confidence, status, and
 *  leverage are recomputed for the counterfactual. */
export function parseWhatIf(src: string, overrides: Overrides): ParseResult {
  return JSON.parse(wasmWhatIf(src, JSON.stringify(overrides))) as ParseResult
}
