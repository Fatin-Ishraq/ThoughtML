//! Canonical formatter: render a parsed surface AST back to normalized ThoughtML
//! text — one style, deterministic and idempotent. Blocks are indented two spaces
//! per level, a blank line separates every record, field/body/formula/member order
//! is normalized. The CLI (`thoughtml fmt`) re-parses the output and checks it
//! desugars to an identical canonical model before writing, so formatting can never
//! change meaning.
//!
//! Comments are preserved. A comment belongs to whatever it sits above, so an
//! unindented block is re-emitted immediately above its record and a trailing one
//! stays at the end of the file. The blank line authors often leave between a
//! file-header comment and the first record is normalized away — the comment is
//! attached to what it introduces. Comments *inside* a block are kept but move to
//! the top of that block, because the formatter reorders a block's contents and
//! there is no stable position to return them to.

use crate::surface::{ActionForm, Block, EvidenceEntry, Header, Record, SurfaceFile};

const INDENT: &str = "  ";

/// Render a whole file. Records are separated by a blank line; each ends in `\n`.
pub fn format(file: &SurfaceFile) -> String {
    let mut out = String::new();
    for rec in &file.records {
        render_record(rec, 0, &mut out);
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

fn render_record(rec: &Record, depth: usize, out: &mut String) {
    // A blank line before every record except the very first line of output.
    if !out.is_empty() {
        out.push('\n');
    }
    let pad = INDENT.repeat(depth);
    // The record's own comments sit directly above its header, at the header's
    // indentation, so they travel with it if the record is nested or moved.
    for c in &rec.comments {
        out.push_str(&pad);
        out.push_str(c.trim());
        out.push('\n');
    }
    out.push_str(&pad);
    out.push_str(&header_line(&rec.header));
    out.push('\n');
    render_block(&rec.block, depth + 1, out);
    for child in &rec.children {
        render_record(child, depth + 1, out);
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
    if let Some(body) = &block.body {
        for line in body.split('\n') {
            out.push_str(&pad);
            out.push_str(line);
            out.push('\n');
        }
    }
    for f in &block.fields {
        out.push_str(&pad);
        out.push_str(&f.name);
        if !f.args.is_empty() {
            out.push(' ');
            out.push_str(&f.args.join(" "));
        }
        out.push('\n');
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
        // Body lines are normalized to come first, fields after — the surface AST
        // does not preserve their interleaving, so `fmt` picks one canonical order.
        let messy = "focus a\n    kind claim\n    Body text.\nfocus b\n  kind observation\n  Seen it.\nlink a supports b";
        let out = fmt(messy);
        assert_eq!(
            out,
            "focus a\n  Body text.\n  kind claim\n\nfocus b\n  Seen it.\n  kind observation\n\nlink a supports b\n"
        );
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
