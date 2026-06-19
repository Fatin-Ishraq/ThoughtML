//! The surface AST (spec §3.1, §6). This is the structure produced directly by
//! parsing, before desugaring into the canonical core.

use crate::lex::Value;
use serde::Serialize;

/// A parsed surface file: an ordered list of records.
#[derive(Debug, Clone, Serialize)]
pub struct SurfaceFile {
    pub records: Vec<Record>,
}

/// A record: a header, its indented block, and any records nested under it.
#[derive(Debug, Clone, Serialize)]
pub struct Record {
    /// 1-based line number of the header.
    pub line: usize,
    pub header: Header,
    pub block: Block,
    /// Records nested under this one by indentation (§6, Phase 5). Only a
    /// `scope` gives these meaning (membership); empty for flat documents, so
    /// existing surface output is unchanged.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Record>,
}

/// A top-level header (§6).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "header", rename_all = "lowercase")]
pub enum Header {
    Scope {
        id: String,
    },
    Question {
        id: String,
    },
    Focus {
        id: String,
    },
    Link {
        alias: Option<String>,
        from: String,
        relation: String,
        to: String,
        /// Relation strength from a `strongly`/`weakly` adverb (v0.2).
        weight: Option<f64>,
    },
    Stance {
        alias: Option<String>,
        agent: String,
        posture: String,
        target: String,
    },
    /// A readable action header (`agent action-form`, §6.1).
    Action {
        agent: String,
        posture: String,
        form: ActionForm,
    },
    /// A profile declaration (`profile <name>`, Phase 5): its block lists the
    /// custom `kinds`/`relations`/`fields`/`postures` the document's dialect adds.
    Profile {
        name: String,
    },
    /// An import (`import <name> as <ns>`, Phase 5): pulls another document's
    /// objects in under the namespace `ns`, referenced as `ns.id`. Resolved by
    /// `parse_project`; a no-op in single-document parsing.
    Import {
        name: String,
        ns: String,
    },
}

/// The body of a readable action header (§6.1).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "form", rename_all = "lowercase")]
pub enum ActionForm {
    /// `noticed`, `considers`, `asks`, `holds`, `chooses`, `rejects`,
    /// `revises`, `remembers`, `doubts`, `accepts` — all single-target.
    Single { target: String },
    /// `suspects id relation id [as id]`.
    Suspects {
        from: String,
        relation: String,
        to: String,
        alias: Option<String>,
    },
    /// `infers id from id-list`.
    Infers { target: String, from: Vec<String> },
}

/// The indented block under a header (§7).
#[derive(Debug, Clone, Default, Serialize)]
pub struct Block {
    /// Joined body text (consecutive body lines joined with `\n`).
    pub body: Option<String>,
    pub fields: Vec<Field>,
    /// A `= <expr>` formula line (v0.2, Phase 8), if the block has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
}

/// A field phrase within a block (§7).
#[derive(Debug, Clone, Serialize)]
pub struct Field {
    /// 1-based source line.
    pub line: usize,
    pub name: String,
    /// Raw tokens after the field name.
    pub args: Vec<String>,
    /// Best-effort classified value of the joined args.
    pub value: Value,
    /// Whether the field name is in the known vocabulary (§7).
    pub known: bool,
}

impl Field {
    /// First argument token, if any (used by fields like `because`, `until`).
    pub fn first_arg(&self) -> Option<&str> {
        self.args.first().map(String::as_str)
    }
}

impl Block {
    /// Look up the first field with the given name.
    pub fn field(&self, name: &str) -> Option<&Field> {
        self.fields.iter().find(|f| f.name == name)
    }
}
