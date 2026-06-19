//! Parsing classified lines into the surface AST (spec §6–7).

use crate::diagnostics::Diagnostics;
use crate::lex;
use crate::lines::{Line, LineKind};
use crate::surface::*;
use crate::vocab;

/// Parse `source` into a [`SurfaceFile`], collecting diagnostics.
pub fn parse(source: &str, diags: &mut Diagnostics) -> SurfaceFile {
    let lines = crate::lines::classify(source, diags);
    parse_lines(&lines, diags)
}

/// One record still open on the indentation stack: the record being built, the
/// column its header sat at, and its still-unjoined body lines.
struct OpenRecord {
    rec: Record,
    indent: usize,
    body: Vec<String>,
}

/// Pop the deepest open record, finalize its joined body, and attach it to its
/// parent's `children` (or to `roots` if it was a top-level header).
fn close_top(stack: &mut Vec<OpenRecord>, roots: &mut Vec<Record>) {
    let Some(OpenRecord { mut rec, body, .. }) = stack.pop() else {
        return;
    };
    if !body.is_empty() {
        rec.block.body = Some(body.join("\n"));
    }
    match stack.last_mut() {
        Some(parent) => parent.rec.children.push(rec),
        None => roots.push(rec),
    }
}

fn parse_lines(lines: &[Line], diags: &mut Diagnostics) -> SurfaceFile {
    let mut roots: Vec<Record> = Vec::new();
    // The chain of currently-open ancestor records, shallowest (column 0) first.
    let mut stack: Vec<OpenRecord> = Vec::new();

    let open = |line: &Line, header: Header, indent: usize| OpenRecord {
        rec: Record {
            line: line.number,
            header,
            block: Block::default(),
            children: Vec::new(),
        },
        indent,
        body: Vec::new(),
    };

    for line in lines {
        match &line.kind {
            LineKind::Blank | LineKind::Comment => {}
            // A column-0 header closes the entire open chain, then starts fresh.
            LineKind::Header => {
                while !stack.is_empty() {
                    close_top(&mut stack, &mut roots);
                }
                if let Some(header) = parse_header(line, diags) {
                    stack.push(open(line, header, 0));
                }
            }
            LineKind::Block { indent } => {
                let indent = *indent;
                if stack.is_empty() {
                    diags.error(line.number, "indented block line before any record header");
                    continue;
                }
                // Dedent: a line at column N closes every open record indented N
                // or deeper, so it lands under the nearest shallower ancestor.
                // The column-0 record can never be closed this way, so the stack
                // always retains at least it.
                while stack.last().is_some_and(|o| o.indent >= indent) {
                    close_top(&mut stack, &mut roots);
                }
                if looks_like_header(&line.content) {
                    // A nested child header (only `scope` gives this meaning; see
                    // desugar). A malformed header reports its own error and is
                    // simply not pushed — the stack stays consistent.
                    if let Some(header) = parse_header(line, diags) {
                        stack.push(open(line, header, indent));
                    }
                } else {
                    let top = stack.last_mut().unwrap();
                    match classify_block_line(line) {
                        BlockLine::Field(field) => top.rec.block.fields.push(field),
                        BlockLine::Body(text) => top.body.push(text),
                        BlockLine::Formula(expr) => {
                            if top.rec.block.formula.is_some() {
                                diags.warning(
                                    line.number,
                                    "multiple `=` formulas in one record; using the last",
                                );
                            }
                            top.rec.block.formula = Some(expr);
                        }
                    }
                }
            }
        }
    }
    while !stack.is_empty() {
        close_top(&mut stack, &mut roots);
    }

    SurfaceFile { records: roots }
}

// --- Header parsing -------------------------------------------------------

fn parse_header(line: &Line, diags: &mut Diagnostics) -> Option<Header> {
    let toks: Vec<&str> = line.content.split_whitespace().collect();
    // Header lines always have non-blank content, but guard defensively so a
    // future caller can never index past the end.
    let Some(&first) = toks.first() else {
        diags.error(line.number, "empty header");
        return None;
    };

    match first {
        "scope" => simple_id_header(line, &toks, diags, |id| Header::Scope { id }),
        "question" => simple_id_header(line, &toks, diags, |id| Header::Question { id }),
        "focus" => simple_id_header(line, &toks, diags, |id| Header::Focus { id }),
        "link" => parse_link_header(line, &toks, diags),
        "stance" => parse_stance_header(line, &toks, diags),
        "profile" => simple_id_header(line, &toks, diags, |id| Header::Profile { name: id }),
        "import" => parse_import_header(line, &toks, diags),
        _ => parse_action_header(line, &toks, diags),
    }
}

fn simple_id_header(
    line: &Line,
    toks: &[&str],
    diags: &mut Diagnostics,
    build: impl FnOnce(String) -> Header,
) -> Option<Header> {
    if toks.len() != 2 {
        diags.error(
            line.number,
            format!("`{}` header expects exactly one identifier", toks[0]),
        );
        return None;
    }
    let id = ident(toks[1], line.number, diags)?;
    Some(build(id))
}

fn parse_link_header(line: &Line, toks: &[&str], diags: &mut Diagnostics) -> Option<Header> {
    // link [alias:] from relation to    (strength is the `weight` field, §12.2)
    let rest = &toks[1..];
    let (alias, rest) = take_alias(rest);
    if rest.len() != 3 {
        diags.error(
            line.number,
            "`link` header expects `[alias:] from relation to`",
        );
        return None;
    }
    let from = ident(rest[0], line.number, diags)?;
    let relation = symbol(rest[1], line.number, diags)?;
    let to = ident(rest[2], line.number, diags)?;
    let alias = alias.and_then(|a| ident(a, line.number, diags));
    Some(Header::Link {
        alias,
        from,
        relation,
        to,
    })
}

fn parse_stance_header(line: &Line, toks: &[&str], diags: &mut Diagnostics) -> Option<Header> {
    // stance [alias:] agent posture target
    let rest = &toks[1..];
    let (alias, rest) = take_alias(rest);
    if rest.len() != 3 {
        diags.error(
            line.number,
            "`stance` header expects `[alias:] agent posture target`",
        );
        return None;
    }
    let agent = ident(rest[0], line.number, diags)?;
    let posture = symbol(rest[1], line.number, diags)?;
    let target = ident(rest[2], line.number, diags)?;
    let alias = alias.and_then(|a| ident(a, line.number, diags));
    // Posture validity is checked by the desugar vocabulary lint (Phase 5), so a
    // profile-declared posture is accepted; the surface parse stays profile-blind.
    Some(Header::Stance {
        alias,
        agent,
        posture,
        target,
    })
}

fn parse_import_header(line: &Line, toks: &[&str], diags: &mut Diagnostics) -> Option<Header> {
    // import <name> as <namespace>
    if toks.len() != 4 || toks[2] != "as" {
        diags.error(
            line.number,
            "`import` header expects `import <name> as <namespace>`",
        );
        return None;
    }
    let name = ident(toks[1], line.number, diags)?;
    let ns = ident(toks[3], line.number, diags)?;
    Some(Header::Import { name, ns })
}

/// If the first token ends with `:`, treat it as an alias and return the rest.
fn take_alias<'a>(toks: &'a [&'a str]) -> (Option<&'a str>, &'a [&'a str]) {
    if let Some(first) = toks.first() {
        if let Some(alias) = first.strip_suffix(':') {
            return (Some(alias), &toks[1..]);
        }
    }
    (None, toks)
}

fn parse_action_header(line: &Line, toks: &[&str], diags: &mut Diagnostics) -> Option<Header> {
    // An action header is `agent posture …`. Distinguish "not an action header
    // at all" (so we report an unknown record kind) from "valid posture, wrong
    // arity" (so we report what the posture expected).
    if toks.len() < 2 || !vocab::is_posture(toks[1]) {
        diags.error(
            line.number,
            format!("unknown record kind or header `{}`", line.content),
        );
        return None;
    }
    let agent = ident(toks[0], line.number, diags)?;
    let posture = toks[1];

    let form = match posture {
        "suspects" => parse_suspects(line, &toks[2..], diags)?,
        "infers" => parse_infers(line, &toks[2..], diags)?,
        _ => {
            if toks.len() != 3 {
                diags.error(
                    line.number,
                    format!("`{posture}` action expects a single target identifier"),
                );
                return None;
            }
            ActionForm::Single {
                target: ident(toks[2], line.number, diags)?,
            }
        }
    };

    Some(Header::Action {
        agent,
        posture: posture.to_string(),
        form,
    })
}

fn parse_suspects(line: &Line, rest: &[&str], diags: &mut Diagnostics) -> Option<ActionForm> {
    // id relation id [as id]
    if rest.len() != 3 && rest.len() != 5 {
        diags.error(
            line.number,
            "`suspects` expects `from relation to [as alias]`",
        );
        return None;
    }
    let from = ident(rest[0], line.number, diags)?;
    let relation = symbol(rest[1], line.number, diags)?;
    let to = ident(rest[2], line.number, diags)?;
    let alias = if rest.len() == 5 {
        if rest[3] != "as" {
            diags.error(line.number, "expected `as` before suspect alias");
            return None;
        }
        Some(ident(rest[4], line.number, diags)?)
    } else {
        None
    };
    Some(ActionForm::Suspects {
        from,
        relation,
        to,
        alias,
    })
}

fn parse_infers(line: &Line, rest: &[&str], diags: &mut Diagnostics) -> Option<ActionForm> {
    // id from id-list
    if rest.len() < 3 || rest[1] != "from" {
        diags.error(line.number, "`infers` expects `target from id-list`");
        return None;
    }
    let target = ident(rest[0], line.number, diags)?;
    // Sources: join remaining tokens, split on commas, fall back to whitespace.
    let joined = rest[2..].join(" ");
    let sources: Vec<String> = if joined.contains(',') {
        joined
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        joined.split_whitespace().map(str::to_string).collect()
    };
    let mut out = Vec::new();
    for s in sources {
        if let Some(id) = ident(&s, line.number, diags) {
            out.push(id);
        }
    }
    if out.is_empty() {
        diags.error(line.number, "`infers` requires at least one source id");
        return None;
    }
    Some(ActionForm::Infers {
        target,
        from: out,
    })
}

// --- Block line parsing ---------------------------------------------------

enum BlockLine {
    Field(Field),
    Body(String),
    /// A `= <expr>` formula line (v0.2, Phase 8); carries the expression source.
    Formula(String),
}

/// Does an indented line introduce a nested child record, rather than a field
/// or body line? True when it starts with a record keyword, or is an action
/// header (`agent posture …`) whose first token is not a known field name — the
/// latter guard keeps a field like `status holds` (a posture word as its value)
/// from being misread as a stance. Nesting is therefore strictly opt-in: an
/// ordinary field or prose line never matches.
fn looks_like_header(content: &str) -> bool {
    let toks: Vec<&str> = content.split_whitespace().collect();
    let Some(&first) = toks.first() else {
        return false;
    };
    if vocab::is_record_keyword(first) {
        return true;
    }
    !vocab::is_known_field(first) && toks.len() >= 2 && vocab::is_posture(toks[1])
}

fn classify_block_line(line: &Line) -> BlockLine {
    let content = &line.content;

    // A leading `=` marks a formula line (Phase 8): `= hosting + bandwidth`.
    if let Some(expr) = content.trim_start().strip_prefix('=') {
        return BlockLine::Formula(expr.trim().to_string());
    }
    let toks: Vec<&str> = content.split_whitespace().collect();
    // Block lines always have non-blank content; guard defensively anyway.
    let Some(&first) = toks.first() else {
        return BlockLine::Body(content.clone());
    };

    // Known field phrase.
    if vocab::is_known_field(first) {
        return BlockLine::Field(make_field(line, &toks, true));
    }

    // Unknown but "field-like": a lowercase identifier followed only by
    // value-shaped tokens (§7: preserved as fields, warned under strict).
    if lex::is_identifier(first)
        && toks.len() >= 2
        && toks[1..].iter().all(|t| lex::is_value_shaped(t))
    {
        // The unknown-field *warning* is emitted by the desugar vocabulary lint
        // (Phase 5) so a profile-declared field is accepted; we still record the
        // field as `known: false` here for that lint (and strict mode) to act on.
        return BlockLine::Field(make_field(line, &toks, false));
    }

    BlockLine::Body(content.clone())
}

fn make_field(line: &Line, toks: &[&str], known: bool) -> Field {
    let name = toks[0].to_string();
    let args: Vec<String> = toks[1..].iter().map(|s| s.to_string()).collect();
    let value = lex::classify_value(&args.join(" "));
    Field {
        line: line.number,
        name,
        args,
        value,
        known,
    }
}

// --- Token validation -----------------------------------------------------

/// Validate an identifier token, warning (not failing) on violations so that
/// parsing can continue with a best-effort value.
fn ident(tok: &str, line: usize, diags: &mut Diagnostics) -> Option<String> {
    check_lexeme(tok, "identifier", line, diags)
}

fn symbol(tok: &str, line: usize, diags: &mut Diagnostics) -> Option<String> {
    check_lexeme(tok, "symbol", line, diags)
}

fn check_lexeme(tok: &str, kind: &str, line: usize, diags: &mut Diagnostics) -> Option<String> {
    if tok.is_empty() {
        diags.error(line, format!("expected an {kind}, found nothing"));
        return None;
    }
    if !lex::is_identifier(tok) {
        diags.error(
            line,
            format!("invalid {kind} `{tok}` (expected lowercase kebab-case)"),
        );
        return None;
    }
    Some(tok.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_ok(src: &str) -> SurfaceFile {
        let mut d = Diagnostics::new();
        let f = parse(src, &mut d);
        assert!(!d.has_errors(), "unexpected errors: {:?}", d.items);
        f
    }

    #[test]
    fn parses_core_headers() {
        let f = parse_ok("scope incident-742\nfocus metric-shift\n  Activation increased.");
        assert_eq!(f.records.len(), 2);
        assert!(matches!(f.records[0].header, Header::Scope { .. }));
        assert_eq!(
            f.records[1].block.body.as_deref(),
            Some("Activation increased.")
        );
    }

    #[test]
    fn parses_suspects_with_alias() {
        let f = parse_ok(
            "team suspects deploy-change causes metric-shift as deploy-cause\n  confidence 0.25..0.70",
        );
        let rec = &f.records[0];
        match &rec.header {
            Header::Action { posture, form, .. } => {
                assert_eq!(posture, "suspects");
                match form {
                    ActionForm::Suspects { alias, .. } => {
                        assert_eq!(alias.as_deref(), Some("deploy-cause"))
                    }
                    _ => panic!("wrong form"),
                }
            }
            _ => panic!("wrong header"),
        }
        assert_eq!(rec.block.fields[0].name, "confidence");
    }

    #[test]
    fn parses_link_header_with_and_without_alias() {
        let f = parse_ok("link deploy-cause: deploy-change causes metric-shift\nlink dashboard-bug undercuts deploy-cause");
        match &f.records[0].header {
            Header::Link { alias, from, relation, to } => {
                assert_eq!(alias.as_deref(), Some("deploy-cause"));
                assert_eq!((from.as_str(), relation.as_str(), to.as_str()), ("deploy-change", "causes", "metric-shift"));
            }
            _ => panic!(),
        }
        match &f.records[1].header {
            Header::Link { alias, .. } => assert!(alias.is_none()),
            _ => panic!(),
        }
    }

    #[test]
    fn body_then_field() {
        let f = parse_ok("team chooses investigate-sampling\n  Investigate sampling change first.\n  because cause-of-metric-shift");
        let b = &f.records[0].block;
        assert_eq!(b.body.as_deref(), Some("Investigate sampling change first."));
        assert_eq!(b.fields[0].name, "because");
    }

    // --- Indentation nesting (Phase 5, Stage 1) ---------------------------

    #[test]
    fn flat_documents_have_no_children() {
        let f = parse_ok("scope s\n\nfocus a\n  Body.\nfocus b");
        assert_eq!(f.records.len(), 3);
        assert!(f.records.iter().all(|r| r.children.is_empty()));
    }

    #[test]
    fn nested_header_becomes_a_child() {
        let f = parse_ok("scope incident\n  focus metric-shift\n    Metric increased.");
        assert_eq!(f.records.len(), 1);
        let scope = &f.records[0];
        assert!(matches!(scope.header, Header::Scope { .. }));
        assert_eq!(scope.children.len(), 1);
        let child = &scope.children[0];
        assert!(matches!(child.header, Header::Focus { .. }));
        assert_eq!(child.block.body.as_deref(), Some("Metric increased."));
    }

    #[test]
    fn field_at_child_indent_belongs_to_the_parent() {
        // `note` sits at the same column as `focus a`, so it is the scope's
        // field; `quantity`, indented under the focus, is the focus's.
        let f = parse_ok("scope s\n  focus a\n    quantity 5 ms\n  note scope-level");
        let scope = &f.records[0];
        assert_eq!(scope.children.len(), 1);
        assert_eq!(scope.children[0].block.fields[0].name, "quantity");
        assert_eq!(scope.block.fields[0].name, "note");
    }

    #[test]
    fn scopes_nest_to_multiple_levels() {
        let f = parse_ok("scope outer\n  scope inner\n    focus deep");
        let outer = &f.records[0];
        assert_eq!(outer.children.len(), 1);
        let inner = &outer.children[0];
        assert!(matches!(inner.header, Header::Scope { .. }));
        assert_eq!(inner.children.len(), 1);
        assert!(matches!(inner.children[0].header, Header::Focus { .. }));
    }

    #[test]
    fn nested_action_header_becomes_a_child() {
        let f = parse_ok("scope debate\n  team holds plan-a");
        let scope = &f.records[0];
        assert_eq!(scope.children.len(), 1);
        assert!(matches!(scope.children[0].header, Header::Action { .. }));
    }

    #[test]
    fn malformed_child_header_errs_without_corrupting_siblings() {
        let mut d = Diagnostics::new();
        // A bare `focus` (no id) is malformed; the valid sibling must still parse.
        let f = parse("scope s\n  focus\n  focus ok", &mut d);
        assert!(d.has_errors());
        let scope = &f.records[0];
        assert_eq!(scope.children.len(), 1);
        assert!(matches!(scope.children[0].header, Header::Focus { .. }));
    }

    #[test]
    fn body_line_starting_with_a_bare_keyword_is_read_as_a_header() {
        // Documented corner: an indented prose line whose first word is a bare
        // record keyword is taken as a (here malformed) nested header. Authors
        // should rephrase or quote such prose. Asserted so it can't drift silently.
        let mut d = Diagnostics::new();
        let _ = parse("focus a\n  scope is unclear here", &mut d);
        assert!(d.has_errors());
    }
}
