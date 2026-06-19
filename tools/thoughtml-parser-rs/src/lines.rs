//! Line classification (spec §5.2–5.4).
//!
//! A ThoughtML file is a sequence of lines, each of which is blank, a comment,
//! a top-level header (column 0), or an indented block line (≥2 spaces).

use crate::diagnostics::Diagnostics;

/// The lexical kind of a single source line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LineKind {
    Blank,
    Comment,
    /// A top-level header: zero indentation, not blank/comment.
    Header,
    /// An indented block line, carrying its indentation width in spaces.
    Block { indent: usize },
}

/// A classified source line.
#[derive(Debug, Clone)]
pub struct Line {
    /// 1-based line number.
    pub number: usize,
    pub kind: LineKind,
    /// The line with leading indentation stripped and trailing whitespace
    /// trimmed. Empty for blank/comment lines.
    pub content: String,
    /// The original, untrimmed line text (for round-tripping).
    pub raw: String,
}

/// Classify every line of `source`. Tab indentation is an error (§5.4) but we
/// still emit a best-effort classification so later phases can continue.
///
/// A leading UTF-8 BOM is stripped so that files authored by editors that emit
/// one still parse. `str::lines` already tolerates both `\n` and `\r\n`.
pub fn classify(source: &str, diags: &mut Diagnostics) -> Vec<Line> {
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);
    let mut out = Vec::new();
    for (idx, raw) in source.lines().enumerate() {
        let number = idx + 1;
        let raw = raw.to_string();

        // Leading whitespace run.
        let indent_str: String = raw.chars().take_while(|c| *c == ' ' || *c == '\t').collect();
        let rest = &raw[indent_str.len()..];
        let trimmed = rest.trim_end();

        if trimmed.is_empty() {
            out.push(Line {
                number,
                kind: LineKind::Blank,
                content: String::new(),
                raw,
            });
            continue;
        }

        if trimmed.starts_with('#') {
            out.push(Line {
                number,
                kind: LineKind::Comment,
                content: String::new(),
                raw,
            });
            continue;
        }

        if indent_str.contains('\t') {
            diags.error(number, "tab indentation is invalid; v0 requires spaces");
        }

        let indent = indent_str.chars().count();
        let kind = if indent == 0 {
            LineKind::Header
        } else {
            if indent < 2 {
                diags.warning(
                    number,
                    "block lines should be indented by two or more spaces",
                );
            }
            LineKind::Block { indent }
        };

        out.push(Line {
            number,
            kind,
            content: trimmed.to_string(),
            raw,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_kinds() {
        let mut d = Diagnostics::new();
        let lines = classify("scope x\n  body text\n# comment\n\nfocus y", &mut d);
        assert_eq!(lines[0].kind, LineKind::Header);
        assert_eq!(lines[1].kind, LineKind::Block { indent: 2 });
        assert_eq!(lines[2].kind, LineKind::Comment);
        assert_eq!(lines[3].kind, LineKind::Blank);
        assert_eq!(lines[4].kind, LineKind::Header);
        assert!(!d.has_errors());
    }

    #[test]
    fn tabs_are_errors() {
        let mut d = Diagnostics::new();
        classify("focus x\n\tbody", &mut d);
        assert!(d.has_errors());
    }
}
