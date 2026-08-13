//! Authoritative locations for canonical objects produced from source records.
//!
//! This metadata deliberately lives beside, rather than inside, the canonical
//! model. Canonical JSON therefore stays stable while editors can still navigate
//! every authored or desugared object back to its exact project file and line.

use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceLocation {
    /// `entry` for the project root, otherwise the imported module name.
    pub source: String,
    /// One-based source line.
    pub line: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct SourceMap {
    /// Canonical object id to its originating source record.
    pub objects: BTreeMap<String, SourceLocation>,
}

impl SourceMap {
    pub(crate) fn record(&mut self, id: String, source: &str, line: usize) {
        self.objects.entry(id).or_insert_with(|| SourceLocation {
            source: source.to_string(),
            line,
        });
    }
}
