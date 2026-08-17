//! Canonical formatter: render a parsed surface AST back to normalized ThoughtML
//! text — one style, deterministic and idempotent. Blocks are indented two spaces
//! per level, a blank line separates every record, field/body/formula/member order
//! is normalized: `kind` under the header, then the body prose, then the remaining
//! fields, the formula, and the members. The CLI (`thoughtml fmt`) re-parses the
//! output and checks it desugars to an identical canonical model before writing, so
//! formatting can never change meaning.
//!
//! Comments are preserved. A comment belongs to whatever it sits above, so an
//! unindented block is re-emitted immediately above its record and a trailing one
//! stays at the end of the file. A blank line between the comment and the record —
//! how people write a file header or a section divider — means the comment
//! introduces more than that one record, so the gap is kept. Comments *inside* a
//! block are kept but move to the top of that block, because the formatter reorders
//! a block's contents and there is no stable position to return them to.

use crate::surface::{ActionForm, Block, EvidenceEntry, Field, Header, Record, SurfaceFile};

const INDENT: &str = "  ";

/// Render a whole file. Records are separated by a blank line; each ends in `\n`.
pub fn format(file: &SurfaceFile) -> String {
    let mut out = String::new();
    let mut prev_lone = false;
    for rec in &file.records {
        render_record(rec, 0, &mut out, &mut prev_lone);
    }
    // Comments that trailed the last record belong to no record; keep them last.
    if !file.trailing_comments.is_empty() {
        if !out.is_empty() {
            out.push('\n');
        }
        for c in &file.trailing_comments {
            out.push_str(c.trim_end());
            out.push('\n');
        }
    }
    out
}

/// A record that is nothing but its header line — nothing indented under it. A run
/// of these (the links closing a document, a stack of imports) reads as one list,
/// so the formatter keeps them tight instead of spacing them out.
fn is_lone_header(rec: &Record) -> bool {
    rec.children.is_empty() && rec.block.is_empty()
}

fn render_record(rec: &Record, depth: usize, out: &mut String, prev_lone: &mut bool) {
    let lone = is_lone_header(rec);
    // A blank line before every record, except the first line of output and a lone
    // header joining the run above it. A comment of its own always breaks the run —
    // it introduces this record, so it needs the air.
    let joins_run = lone && *prev_lone && rec.comments.is_empty();
    if !out.is_empty() && !joins_run {
        out.push('\n');
    }
    *prev_lone = lone;
    let pad = INDENT.repeat(depth);
    // The record's own comments sit directly above its header, at the header's
    // indentation, so they travel with it if the record is nested or moved.
    for c in &rec.comments {
        out.push_str(&pad);
        out.push_str(c.trim());
        out.push('\n');
    }
    // A comment block the author set off with a blank line introduces a section,
    // not just the next record; keep the gap so it still reads that way.
    if rec.comments_detached {
        out.push('\n');
    }
    out.push_str(&pad);
    out.push_str(&header_line(&rec.header));
    out.push('\n');
    render_block(&rec.block, depth + 1, out);
    for child in &rec.children {
        render_record(child, depth + 1, out, prev_lone);
    }
}

fn header_line(h: &Header) -> String {
    match h {
        Header::Scope { id } => format!("scope {id}"),
        Header::Question { id } => format!("question {id}"),
        Header::Focus { id } => format!("focus {id}"),
        Header::TypedFocus { id, kind } => format!("{kind} {id}"),
        Header::Link {
            alias,
            from,
            relation,
            to,
        } => {
            let a = alias.as_ref().map(|a| format!("{a}: ")).unwrap_or_default();
            format!("link {a}{from} {relation} {to}")
        }
        Header::Stance {
            alias,
            agent,
            posture,
            target,
        } => {
            let a = alias.as_ref().map(|a| format!("{a}: ")).unwrap_or_default();
            format!("stance {a}{agent} {posture} {target}")
        }
        Header::Action {
            agent,
            posture,
            form,
        } => match form {
            ActionForm::Single { target } => format!("{agent} {posture} {target}"),
            ActionForm::Suspects {
                from,
                relation,
                to,
                alias,
            } => {
                let tail = alias
                    .as_ref()
                    .map(|a| format!(" as {a}"))
                    .unwrap_or_default();
                format!("{agent} {posture} {from} {relation} {to}{tail}")
            }
            ActionForm::Infers { target, from } => {
                format!("{agent} {posture} {target} from {}", from.join(" "))
            }
        },
        Header::EvidenceBundle { relation, target } => format!("{relation} {target}"),
        Header::Profile { name } => format!("profile {name}"),
        Header::Import { name, ns } => format!("import {name} as {ns}"),
    }
}

fn render_block(block: &Block, depth: usize, out: &mut String) {
    let pad = INDENT.repeat(depth);
    // Kept, not placed: the block's contents get reordered below, so there is no
    // original position to restore these to. They go at the top of the block.
    for c in &block.comments {
        out.push_str(&pad);
        out.push_str(c.trim());
        out.push('\n');
    }
    // `kind` qualifies the header rather than describing the node, so it goes
    // directly under it — the way the language is written everywhere else.
    let (kind, rest): (Vec<_>, Vec<_>) = block.fields.iter().partition(|f| f.name == "kind");
    let field_line = |f: &Field, out: &mut String| {
        out.push_str(&pad);
        out.push_str(&f.name);
        if !f.args.is_empty() {
            out.push(' ');
            out.push_str(&f.args.join(" "));
        }
        out.push('\n');
    };
    for f in kind {
        field_line(f, out);
    }
    if let Some(body) = &block.body {
        for line in body.split('\n') {
            out.push_str(&pad);
            out.push_str(line);
            out.push('\n');
        }
    }
    for f in rest {
        field_line(f, out);
    }
    if let Some(expr) = &block.formula {
        out.push_str(&pad);
        out.push_str("= ");
        out.push_str(expr);
        out.push('\n');
    }
    for e in &block.evidence {
        out.push_str(&pad);
        out.push_str(&member_line(e));
        out.push('\n');
    }
}

fn member_line(e: &EvidenceEntry) -> String {
    let mut s = e.source.clone();
    if let Some(w) = e.weight {
        s.push_str(" weight ");
        s.push_str(&num(w));
    }
    if let Some(b) = &e.basis {
        s.push(' ');
        s.push_str(b);
    }
    s
}

/// Render a number the way an author would type it (no trailing zeros).
fn num(n: f64) -> String {
    format!("{n}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::Diagnostics;
    use crate::parser;

    fn fmt(src: &str) -> String {
        let mut d = Diagnostics::new();
        let f = parser::parse(src, &mut d);
        assert!(!d.has_errors(), "parse errors: {:?}", d.items);
        format(&f)
    }

    #[test]
    fn normalizes_indentation_and_blank_lines() {
        // The surface AST does not preserve how fields and body lines interleaved,
        // so `fmt` picks one canonical order: `kind`, body, then the rest.
        let messy = "focus a\n    Body text.\n    kind claim\nfocus b\n  kind observation\n  Seen it.\n  confidence 0.4\nlink a supports b";
        let out = fmt(messy);
        assert_eq!(
            out,
            "focus a\n  kind claim\n  Body text.\n\nfocus b\n  kind observation\n  Seen it.\n  confidence 0.4\n\nlink a supports b\n"
        );
    }

    #[test]
    fn keeps_the_gap_under_a_section_comment() {
        // A blank line after the comment marks it as introducing a section; with no
        // blank line the comment belongs to the one record below it.
        let detached = "# The file, in general.\n\nfocus a\n  kind claim\n  Text.\n";
        assert_eq!(fmt(detached), detached);
        let attached = "# Just this record.\nfocus a\n  kind claim\n  Text.\n";
        assert_eq!(fmt(attached), attached);
    }

    #[test]
    fn is_idempotent() {
        let src =
            "scope s\n  observation x\n    Saw x.\n  claim y\n    Believe y.\nlink x supports y\n";
        let once = fmt(src);
        let twice = fmt(&once);
        assert_eq!(once, twice);
    }

    #[test]
    fn preserves_bundles_and_members() {
        let src = "claim c\n  A claim.\nobservation s1\n  One.\nobservation s2\n  Two.\nsupports c\n  s1 weight 0.9 assumed\n  s2\n";
        let out = fmt(src);
        assert!(out.contains("supports c\n  s1 weight 0.9 assumed\n  s2\n"));
    }
}
