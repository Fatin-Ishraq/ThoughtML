//! ThoughtML v0 reference parser.
//!
//! Pipeline (spec §16): source text -> surface AST (`parser`) -> canonical
//! objects (`desugar`) -> validation (`validate`) -> derived temporal facts
//! (`derive`) -> canonical JSON.
//!
//! ```
//! let result = thoughtml::parse_str("team noticed metric-shift\n  Activation rose.");
//! assert!(!result.diagnostics.has_errors());
//! let json = serde_json::to_string_pretty(&result.canonical).unwrap();
//! assert!(json.contains("metric-shift"));
//! ```

pub mod canonical;
pub mod derive;
pub mod desugar;
pub mod diagnostics;
pub mod formula;
pub mod ids;
pub mod lex;
pub mod lines;
pub mod parser;
pub mod surface;
pub mod units;
pub mod validate;
pub mod vocab;

pub use canonical::Canonical;
pub use derive::Overrides;
pub use diagnostics::{Diagnostic, Diagnostics, Severity};
pub use surface::SurfaceFile;

use std::collections::{HashMap, HashSet};

/// The full result of parsing a ThoughtML source string.
pub struct ParseResult {
    /// The surface AST, preserved for round-tripping and `--ast` output.
    pub surface: SurfaceFile,
    /// The normalized canonical object model.
    pub canonical: Canonical,
    /// All diagnostics gathered across parsing, desugaring, and validation.
    pub diagnostics: Diagnostics,
}

/// Options controlling parsing/desugaring.
#[derive(Debug, Clone, Copy, Default)]
pub struct Options {
    /// Emit `Act` provenance objects for readable actions (§4.6). Off by
    /// default so the base canonical output stays stable.
    pub emit_acts: bool,
    /// Compute `derived_confidence` by propagating evidence (§10.3, Phase 4).
    /// Off by default so the base canonical output stays stable.
    pub derive_confidence: bool,
    /// Compute grounded `argument_status` over the attack graph (§10.4, Phase 5).
    /// Off by default so the base canonical output stays stable.
    pub argument_status: bool,
    /// Compute per-evidence `leverage` by single-edge ablation (§10.5, Phase 6).
    /// Off by default so the base canonical output stays stable.
    pub sensitivity: bool,
    /// Evaluate `= expr` foci into `computed_quantity` (§4.8, Phase 8). Off by
    /// default so the base canonical output stays stable.
    pub formulas: bool,
    /// Compute decision expected values over `leads-to` / `option-of` edges
    /// (§10.6, Phase 9). Off by default so the base canonical output stays stable.
    pub decision_ev: bool,
    /// Compute the mirror's conflict report — the engine's second reading
    /// disagreeing with the author (§10.7). Off by default; on under
    /// `--audit`/`--compute` and in the playground.
    pub audit: bool,
}

/// Parse a ThoughtML source string end-to-end with default options.
pub fn parse_str(source: &str) -> ParseResult {
    parse_str_with(source, Options::default())
}

/// Parse a ThoughtML source string end-to-end with explicit options.
pub fn parse_str_with(source: &str, opts: Options) -> ParseResult {
    parse_str_with_overrides(source, opts, &Overrides::default())
}

/// Parse with explicit options and a what-if perturbation of the evidence/attack
/// graphs (§10.5). The playground's what-if mode disables nodes/links and
/// re-derives through this; the CLI never perturbs.
pub fn parse_str_with_overrides(
    source: &str,
    opts: Options,
    overrides: &Overrides,
) -> ParseResult {
    let mut diagnostics = Diagnostics::new();
    let surface = parser::parse(source, &mut diagnostics);
    let mut canonical = desugar::desugar(&surface, opts.emit_acts, &mut diagnostics);
    validate::validate(&canonical, &mut diagnostics);
    derive::derive(
        &mut canonical,
        opts.derive_confidence,
        opts.argument_status,
        opts.sensitivity,
        opts.formulas,
        opts.decision_ev,
        opts.audit,
        overrides,
        &mut diagnostics,
    );
    ParseResult {
        surface,
        canonical,
        diagnostics,
    }
}

/// Parse a multi-document *project*: an `entry` source plus a `name -> source`
/// map of everything it can `import` (§12.5). Imported documents are resolved
/// recursively, their ids and references prefixed with the import namespace
/// (`ns.`), and merged into one canonical model that is validated and derived as
/// a whole. Import cycles are reported and broken. The host supplies `sources`:
/// the CLI reads sibling files, the playground passes its bundled examples.
pub fn parse_project(entry: &str, sources: &HashMap<String, String>, opts: Options) -> ParseResult {
    let mut diagnostics = Diagnostics::new();
    let surface = parser::parse(entry, &mut diagnostics);
    let mut objects = Vec::new();
    let mut visiting = HashSet::new();
    resolve_doc(
        &surface,
        "",
        sources,
        opts,
        &mut objects,
        &mut visiting,
        &mut diagnostics,
    );

    let mut canonical = Canonical {
        objects,
        timeline: None,
        audit: None,
    };
    validate::validate(&canonical, &mut diagnostics);
    derive::derive(
        &mut canonical,
        opts.derive_confidence,
        opts.argument_status,
        opts.sensitivity,
        opts.formulas,
        opts.decision_ev,
        opts.audit,
        &Overrides::default(),
        &mut diagnostics,
    );
    ParseResult {
        surface,
        canonical,
        diagnostics,
    }
}

/// Desugar one document's surface into `out`, after recursively resolving every
/// document it imports. `prefix` namespaces this document's ids/refs: the entry
/// uses the empty prefix; an `import … as ns` nests its target under
/// `{prefix}{ns}.`.
fn resolve_doc(
    surface: &SurfaceFile,
    prefix: &str,
    sources: &HashMap<String, String>,
    opts: Options,
    out: &mut Vec<canonical::Object>,
    visiting: &mut HashSet<String>,
    diags: &mut Diagnostics,
) {
    for rec in &surface.records {
        let surface::Header::Import { name, ns } = &rec.header else {
            continue;
        };
        if visiting.contains(name) {
            diags.warning(rec.line, format!("import cycle through `{name}`; skipped"));
            continue;
        }
        let Some(src) = sources.get(name) else {
            diags.warning(rec.line, format!("unknown import `{name}`"));
            continue;
        };
        visiting.insert(name.clone());
        let child = parser::parse(src, diags);
        resolve_doc(
            &child,
            &format!("{prefix}{ns}."),
            sources,
            opts,
            out,
            visiting,
            diags,
        );
        visiting.remove(name);
    }
    let mut objs = desugar::desugar(surface, opts.emit_acts, diags).objects;
    if !prefix.is_empty() {
        prefix_objects(&mut objs, prefix);
    }
    out.extend(objs);
}

fn prefix_id(prefix: &str, s: &mut String) {
    *s = format!("{prefix}{s}");
}

/// Namespace every id and structural reference in `objects` with `prefix`. The
/// uniform prefixing composes: a local ref `foo` becomes `{prefix}foo` (the local
/// object), and an imported ref `ns.bar` becomes `{prefix}ns.bar` (that import
/// resolved under `{prefix}ns.`). Runs pre-derive, so `superseded_by` and the
/// computed fields are still empty. v1 limitation: refs inside a `formula` string
/// are not rewritten, and agent names are left global.
fn prefix_objects(objects: &mut [canonical::Object], prefix: &str) {
    use canonical::Object;
    for o in objects {
        match o {
            Object::Focus(x) => {
                prefix_id(prefix, &mut x.id);
                prefix_fields(&mut x.fields, prefix);
            }
            Object::Question(x) => {
                prefix_id(prefix, &mut x.id);
                for r in &mut x.asks_about {
                    prefix_id(prefix, r);
                }
                prefix_fields(&mut x.fields, prefix);
            }
            Object::Link(x) => {
                prefix_id(prefix, &mut x.id);
                prefix_id(prefix, &mut x.from);
                prefix_id(prefix, &mut x.to);
                prefix_fields(&mut x.fields, prefix);
            }
            Object::Stance(x) => {
                prefix_id(prefix, &mut x.id);
                prefix_id(prefix, &mut x.target);
                prefix_fields(&mut x.fields, prefix);
            }
            Object::Scope(x) => {
                prefix_id(prefix, &mut x.id);
                for r in &mut x.includes {
                    prefix_id(prefix, r);
                }
                prefix_fields(&mut x.fields, prefix);
            }
            Object::Act(x) => {
                prefix_id(prefix, &mut x.id);
                for r in &mut x.expands_to {
                    prefix_id(prefix, r);
                }
                prefix_fields(&mut x.fields, prefix);
            }
            Object::Profile(x) => prefix_id(prefix, &mut x.name),
        }
    }
}

/// Prefix every `Ref`-valued field (an object reference such as `answers q`).
/// Non-object label refs (e.g. a `source` value) get prefixed too, which is
/// harmless — they are not object ids, so nothing resolves to them.
fn prefix_fields(fields: &mut canonical::Fields, prefix: &str) {
    for (_, v) in &mut fields.0 {
        if let lex::Value::Ref(r) = v {
            prefix_id(prefix, r);
        }
    }
}

#[cfg(test)]
mod integration_tests;
