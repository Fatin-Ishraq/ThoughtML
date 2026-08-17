//! The surface AST (spec §3.1, §6). This is the structure produced directly by
//! parsing, before desugaring into the canonical core.

use crate::lex::Value;
use serde::Serialize;

/// A parsed surface file: an ordered list of records.
#[derive(Debug, Clone, Serialize)]
pub struct SurfaceFile {
    pub records: Vec<Record>,
    /// Comment lines after the last record, which belong to no record.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub trailing_comments: Vec<String>,
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// A record: a header, its indented block, and any records nested under it.
#[derive(Debug, Clone, Serialize)]
pub struct Record {
    /// 1-based line number of the header.
    pub line: usize,
    /// Unindented comment lines standing immediately above this header, verbatim
    /// and in order. A comment belongs to whatever it sits above, which is how
    /// people write them and what lets the formatter put them back.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub comments: Vec<String>,
    /// Whether the author left a blank line between that comment block and this
    /// header. A blank line means the comment introduces a *section* (or the
    /// whole file) rather than this one record, so the formatter keeps the gap.
    #[serde(skip_serializing_if = "is_false")]
    pub comments_detached: bool,
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
    /// A typed focus declaration: a built-in kind used as a one-line header, e.g.
    /// `observation internet-speeds-improving` or `decision migrate`. Pure sugar —
    /// it desugars to a `focus` with an explicit `kind`, so the canonical model is
    /// unchanged.
    TypedFocus {
        id: String,
        kind: String,
    },
    Link {
        alias: Option<String>,
        from: String,
        relation: String,
        to: String,
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
    /// An evidence bundle (`<relation> <target>`): its indented block lists source
    /// ids, each desugaring to a `link <source> <relation> <target>`. Pure sugar —
    /// the canonical model still sees only `link` objects.
    EvidenceBundle {
        relation: String,
        target: String,
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
    /// Members of an `<relation> <target>` evidence bundle: each desugars to a
    /// `link <source> <relation> <target>`. Empty for every other record.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub evidence: Vec<EvidenceEntry>,
    /// Indented comment lines found inside this block, verbatim. The formatter
    /// reorders a block's contents, so these are re-emitted at the top of it
    /// rather than at their original position — kept, not placed.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub comments: Vec<String>,
}

impl Block {
    /// Whether the record's header stands alone — nothing indented under it.
    pub fn is_empty(&self) -> bool {
        self.body.is_none()
            && self.fields.is_empty()
            && self.formula.is_none()
            && self.evidence.is_empty()
            && self.comments.is_empty()
    }
}

/// One member line of an evidence bundle: a source id and the optional strength
/// (`weight`) and provenance (`measured`/`estimated`/`assumed`) for its link.
#[derive(Debug, Clone, Serialize)]
pub struct EvidenceEntry {
    /// 1-based source line.
    pub line: usize,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub basis: Option<String>,
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
