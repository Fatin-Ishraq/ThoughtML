//! Lexical helpers and the v0 value model (spec §5).
//!
//! These functions implement the lexical rules from the specification:
//! identifiers/symbols are lowercase kebab-case, and field values come in a
//! small fixed set of forms (§5.7).

use serde::Serialize;

/// A parsed value, per spec §5.7.
///
/// `Symbol` and `Ref` share the same lexical form (§5.6); we keep both variants
/// so that semantics-aware callers (e.g. desugaring) can record intent, but a
/// bare identifier token classifies as `Ref` by default.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum Value {
    /// Unkeyed body line or quoted string.
    Text(String),
    /// A symbol such as `open`, `cause`, `high`.
    Symbol(String),
    /// A scalar number such as `0`, `1`, `0.72`.
    Number(f64),
    /// An inclusive range such as `0.25..0.70` (low, high).
    Range(f64, f64),
    /// The unknown marker `?`.
    Unknown,
    /// A reference to another record by identifier.
    Ref(String),
    /// A `uri:`-prefixed value.
    Uri(String),
    /// An ISO-8601 date or timestamp.
    Time(String),
    /// A comma-separated list of identifiers or symbols.
    List(Vec<String>),
}

/// Is `s` a valid identifier / symbol? (`[a-z][a-z0-9-]*`, spec §5.5/§5.6),
/// optionally namespace-qualified with `.`-separated segments for imports
/// (Phase 5), e.g. `base.capacity-budget`. Each segment is a valid kebab id.
pub fn is_identifier(s: &str) -> bool {
    !s.is_empty()
        && s.split('.').all(|seg| {
            let mut chars = seg.chars();
            matches!(chars.next(), Some(c) if c.is_ascii_lowercase())
                && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        })
}

/// Is `s` a base-10 number? (`0`, `1`, `0.72`, optionally signed).
pub fn is_number(s: &str) -> bool {
    parse_number(s).is_some()
}

/// Parse a number token, returning its value.
pub fn parse_number(s: &str) -> Option<f64> {
    if s.is_empty() {
        return None;
    }
    // Reject things `f64::from_str` accepts but the spec does not: inf, nan,
    // exponents, and embedded whitespace.
    let body = s.strip_prefix(['+', '-']).unwrap_or(s);
    if body.is_empty() {
        return None;
    }
    if !body
        .chars()
        .all(|c| c.is_ascii_digit() || c == '.')
    {
        return None;
    }
    if body.matches('.').count() > 1 {
        return None;
    }
    s.parse::<f64>().ok()
}

/// Parse a range token `low..high`, returning `(low, high)`.
pub fn parse_range(s: &str) -> Option<(f64, f64)> {
    let (lo, hi) = s.split_once("..")?;
    Some((parse_number(lo)?, parse_number(hi)?))
}

/// A loose ISO-8601 check: starts with `YYYY` or `YYYY-MM` / `YYYY-MM-DD`,
/// optionally followed by `T<time>` and a zone offset. We deliberately keep
/// this permissive — the spec only says "ISO-8601 date or timestamp".
pub fn is_time(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() < 4 {
        return false;
    }
    // Year.
    if !bytes[..4].iter().all(u8::is_ascii_digit) {
        return false;
    }
    if s.len() == 4 {
        return true;
    }
    // Must continue with `-MM` style segments and/or a `T` time component.
    let rest = &s[4..];
    rest.starts_with('-') || rest.starts_with('T')
}

/// Classify a single value token into a [`Value`].
///
/// `List` is handled by the caller (it spans multiple comma-joined tokens);
/// this routine handles one whitespace-delimited token.
pub fn classify_token(tok: &str) -> Value {
    if tok == "?" {
        return Value::Unknown;
    }
    if let Some(uri) = tok.strip_prefix("uri:") {
        return Value::Uri(uri.to_string());
    }
    if let Some((lo, hi)) = parse_range(tok) {
        return Value::Range(lo, hi);
    }
    if let Some(n) = parse_number(tok) {
        return Value::Number(n);
    }
    if is_time(tok) {
        return Value::Time(tok.to_string());
    }
    if is_identifier(tok) {
        return Value::Ref(tok.to_string());
    }
    Value::Text(tok.to_string())
}

/// Classify the value portion of a field line (everything after the field
/// keyword). Handles quoted strings, comma lists, and single tokens.
pub fn classify_value(raw: &str) -> Value {
    let raw = raw.trim();
    if raw.is_empty() {
        return Value::Text(String::new());
    }
    // Quoted string -> text.
    if raw.len() >= 2 && raw.starts_with('"') && raw.ends_with('"') {
        return Value::Text(raw[1..raw.len() - 1].to_string());
    }
    // Comma list of identifiers/symbols.
    if raw.contains(',') {
        let items: Vec<String> = raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if items.iter().all(|i| is_identifier(i)) {
            return Value::List(items);
        }
        return Value::Text(raw.to_string());
    }
    // Single token vs free text.
    if raw.split_whitespace().count() == 1 {
        classify_token(raw)
    } else {
        Value::Text(raw.to_string())
    }
}

/// Does a token look like a value (used to detect "field-like" lines)?
pub fn is_value_shaped(tok: &str) -> bool {
    !matches!(classify_token(tok), Value::Text(_))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers() {
        assert!(is_identifier("metric-shift"));
        assert!(is_identifier("conversation-2026-06-09"));
        assert!(!is_identifier("Metric"));
        assert!(!is_identifier("-x"));
        assert!(!is_identifier("9x"));
        assert!(!is_identifier(""));
    }

    #[test]
    fn numbers_and_ranges() {
        assert_eq!(parse_number("0.72"), Some(0.72));
        assert_eq!(parse_number("1"), Some(1.0));
        assert!(parse_number("1e3").is_none());
        assert!(parse_number("nan").is_none());
        assert_eq!(parse_range("0.25..0.70"), Some((0.25, 0.70)));
    }

    #[test]
    fn classify() {
        assert_eq!(classify_token("?"), Value::Unknown);
        assert_eq!(classify_token("open"), Value::Ref("open".into()));
        assert_eq!(classify_token("0.5"), Value::Number(0.5));
        assert_eq!(
            classify_token("uri:https://x.invalid"),
            Value::Uri("https://x.invalid".into())
        );
        assert!(matches!(classify_token("2026-06-09"), Value::Time(_)));
        assert_eq!(
            classify_value("a, b, c"),
            Value::List(vec!["a".into(), "b".into(), "c".into()])
        );
    }
}
