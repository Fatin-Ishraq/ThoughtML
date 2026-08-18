//! Machine-readable diagnostics and opt-in modeling lints.
//!
//! The parser/validator emit plain [`Diagnostic`]s (a message + line). This module
//! adds, *centrally* (so no emit site changes), a **stable code** and an optional
//! **suggested fix** for each — the surface `thoughtml check --json` exposes for an
//! agent or editor to consume and self-correct against. It also carries one opt-in
//! lint (`--lint`): the "`supports` used as a list" detector, the single most common
//! way an author silently inflates a claim's confidence.

use crate::canonical::{Canonical, Object};
use crate::diagnostics::{Diagnostic, Severity};
use crate::vocab;
use serde::Serialize;

/// A diagnostic enriched for machine consumption: a stable code and a suggested
/// fix alongside the human message. Emitted by `check --json`.
#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticJson {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<&'static str>,
    pub severity: Severity,
    #[serde(skip_serializing_if = "is_zero")]
    pub line: usize,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub help: Option<String>,
}

fn is_zero(n: &usize) -> bool {
    *n == 0
}

impl DiagnosticJson {
    pub fn of(d: &Diagnostic) -> Self {
        DiagnosticJson {
            code: code_for(&d.message),
            severity: d.severity,
            line: d.line,
            message: d.message.clone(),
            help: help_for(&d.message),
        }
    }
}

/// The stable code for a diagnostic, matched on its message. Grouped: 1xx
/// vocabulary, 2xx references, 3xx graph coherence, 4xx numbers, 5xx lints.
/// Codes are part of the tool's contract — do not renumber an existing one.
pub fn code_for(msg: &str) -> Option<&'static str> {
    let has = |s: &str| msg.contains(s);
    Some(if has("unknown focus kind") {
        "TML101"
    } else if has("unknown relation") {
        "TML102"
    } else if has("unknown posture") {
        "TML103"
    } else if has("unknown field") {
        "TML104"
    } else if has("has no meaning on") {
        "TML105"
    } else if has("unresolved reference") || has("references unresolved") {
        "TML201"
    } else if has("links may only connect") {
        "TML202"
    } else if has("is not connected to anything") {
        "TML301"
    } else if has("contradictory stances") {
        "TML302"
    } else if has("cyclic dependency") {
        "TML303"
    } else if has("asserted earlier") {
        "TML304"
    } else if has("expected-value ranking") || has("points outcome") {
        "TML305"
    } else if has("declares no basis") {
        "TML401"
    } else if has("should be in 0..1") {
        "TML402"
    } else if has("use `part-of`") {
        "TML501"
    } else {
        return None;
    })
}

/// A suggested fix for a diagnostic, when one can be computed. For the "unknown
/// <thing>" family this is a nearest-spelling suggestion from the relevant closed
/// vocabulary (catches typos like `supprts` -> `supports`); for the list lint it
/// is the standing advice.
pub fn help_for(msg: &str) -> Option<String> {
    match code_for(msg)? {
        "TML101" => suggest(msg, vocab::KINDS, "kind"),
        "TML102" => suggest(msg, vocab::RELATIONS, "relation"),
        "TML103" => suggest(msg, vocab::POSTURES, "posture"),
        "TML104" => suggest(msg, vocab::FIELDS, "field"),
        "TML501" => Some(
            "if these are enumerated items rather than evidence, use `part-of` so they \
             do not inflate the target's confidence"
                .into(),
        ),
        _ => None,
    }
}

fn suggest(msg: &str, candidates: &[&str], what: &str) -> Option<String> {
    let word = first_backticked(msg)?;
    let near = nearest(word, candidates)?;
    Some(format!("did you mean `{near}`? ({what}s are a closed set)"))
}

/// The token inside the first pair of backticks in a message (the offending word).
fn first_backticked(s: &str) -> Option<&str> {
    let start = s.find('`')? + 1;
    let rest = &s[start..];
    let end = rest.find('`')?;
    Some(&rest[..end])
}

/// The closest candidate to `word` by edit distance, if one is close enough to be
/// a plausible typo (not a wild guess).
fn nearest<'a>(word: &str, candidates: &'a [&'a str]) -> Option<&'a str> {
    let mut best: Option<(usize, &str)> = None;
    for &c in candidates {
        let d = levenshtein(word, c);
        if best.is_none_or(|(bd, _)| d < bd) {
            best = Some((d, c));
        }
    }
    let (d, c) = best?;
    let threshold = (word.len().max(c.len()) / 2).max(2);
    (d <= threshold).then_some(c)
}

/// Standard Levenshtein edit distance (insert/delete/substitute cost 1).
fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];
    for (i, &ca) in a.iter().enumerate() {
        cur[0] = i + 1;
        for (j, &cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            cur[j + 1] = (prev[j + 1] + 1).min(cur[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

/// The opt-in "`supports` used as a list" lint. A focus that is the target of many
/// `supports` links and *no* counter-evidence is very likely an enumeration written
/// as evidence — which silently inflates its `derived_confidence`. Flags it and
/// points at `part-of`. Advisory: only run under `check --lint`, never in the
/// default validation, so existing strict-clean documents are unaffected.
pub fn supports_as_list(canon: &Canonical) -> Vec<Diagnostic> {
    use std::collections::{BTreeMap, BTreeSet};

    const THRESHOLD: usize = 4;

    let mut foci: BTreeSet<&str> = BTreeSet::new();
    for o in &canon.objects {
        if let Object::Focus(f) = o {
            foci.insert(f.id.as_str());
        }
    }

    let mut supports: BTreeMap<&str, usize> = BTreeMap::new();
    let mut attacks: BTreeMap<&str, usize> = BTreeMap::new();
    for o in &canon.objects {
        if let Object::Link(l) = o {
            match l.relation.as_str() {
                "supports" => *supports.entry(l.to.as_str()).or_default() += 1,
                "opposes" | "undercuts" => *attacks.entry(l.to.as_str()).or_default() += 1,
                _ => {}
            }
        }
    }

    let mut out = Vec::new();
    for (&target, &n) in &supports {
        let attacked = attacks.get(target).copied().unwrap_or(0) > 0;
        if n >= THRESHOLD && !attacked && foci.contains(target) {
            out.push(Diagnostic::warning(
                0,
                format!(
                    "focus `{target}` gathers {n} `supports` links and no counter-evidence — \
                     if these are enumerated items, use `part-of` so they don't inflate its confidence"
                ),
            ));
        }
    }
    out
}

/// Render a diagnostic as a single human line with its code, e.g.
/// `12: warning[TML102]: unknown relation ...`. The suggested fix, when present,
/// follows on an indented `help:` line (appended by the caller).
pub fn render_line(d: &Diagnostic) -> String {
    let code = code_for(&d.message)
        .map(|c| format!("[{c}]"))
        .unwrap_or_default();
    if d.line > 0 {
        format!("{}: {}{}: {}", d.line, d.severity, code, d.message)
    } else {
        format!("{}{}: {}", d.severity, code, d.message)
    }
}
