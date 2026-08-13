//! WebAssembly bindings for the ThoughtML v0 parser.
//!
//! Exposes a single `parse` entry point that runs the exact same `parse_str`
//! pipeline as the native CLI and returns a JSON string, so the browser and the
//! CLI can never drift apart.

use serde::Serialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct Output<'a> {
    canonical: &'a thoughtml::Canonical,
    diagnostics: &'a thoughtml::Diagnostics,
    surface: &'a thoughtml::SurfaceFile,
    source_map: &'a thoughtml::SourceMap,
}

/// The full derived view the playground always wants: confidence, status, and
/// leverage all on.
fn playground_opts() -> thoughtml::Options {
    thoughtml::Options {
        emit_acts: false,
        derive_confidence: true,
        argument_status: true,
        sensitivity: true,
        formulas: true,
        decision_ev: true,
        audit: true,
        // Provenance lint stays opt-in — the playground shows the basis when
        // present, but does not flag numbers that omit it.
        strict_provenance: false,
    }
}

fn render(result: &thoughtml::ParseResult) -> String {
    let output = Output {
        canonical: &result.canonical,
        diagnostics: &result.diagnostics,
        surface: &result.surface,
        source_map: &result.source_map,
    };
    serde_json::to_string(&output).unwrap_or_else(|e| {
        // `e` is a controlled message; encode it as a JSON string safely.
        let msg = serde_json::to_string(&e.to_string()).unwrap_or_else(|_| "\"\"".into());
        format!("{{\"error\":{msg}}}")
    })
}

/// Parse ThoughtML source, returning a JSON string of the form
/// `{ "canonical": {...}, "diagnostics": {...}, "surface": {...} }`.
///
/// The playground opts into `derived_confidence` (§10.3), `argument_status`
/// (§10.4), and `leverage` (§10.5) so the whole evaluation layer is always
/// visible; the CLI keeps each behind a flag for stable default output.
#[wasm_bindgen]
pub fn parse(src: &str) -> String {
    render(&thoughtml::parse_str_with(src, playground_opts()))
}

/// Parse a multi-document project (§12.5): `sources_json` is a JSON object
/// `{ "<name>": "<source>", … }` of everything the entry can import. Resolves
/// imports, namespaces ids, and renders the merged document — the same
/// `parse_project` path the CLI uses, so the playground and CLI never drift.
#[wasm_bindgen]
pub fn parse_project(entry: &str, sources_json: &str) -> String {
    let sources: HashMap<String, String> = serde_json::from_str(sources_json).unwrap_or_default();
    render(&thoughtml::parse_project(
        entry,
        &sources,
        playground_opts(),
    ))
}

/// The parser crate version.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
