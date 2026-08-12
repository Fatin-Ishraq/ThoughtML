//! `explain <id>`: trace *why* a node reads the way it does — its derived
//! confidence and grounded argument status, the evidence for and against it (with
//! each edge's weight and leverage), the stances agents hold on it, and any mirror
//! conflict it is caught in. A pure read over an already-derived model, so the
//! caller must run the compute stack (`derive_confidence` / `argument_status` /
//! `sensitivity` / `audit`) first.

use crate::canonical::{Canonical, Object};
use crate::lex::Value;

/// Build the plain-text explanation for `id`, or `None` if no object has that id.
pub fn explain(canon: &Canonical, id: &str) -> Option<String> {
    let obj = canon.objects.iter().find(|o| obj_id(o) == Some(id))?;

    let mut out = String::new();
    let kind = type_label(obj);
    out.push_str(&format!("{id}  ({kind})\n"));
    if let Some(body) = obj_body(obj) {
        for line in body.split('\n') {
            out.push_str(&format!("  {line}\n"));
        }
    }
    out.push('\n');

    if let Some(dc) = derived_confidence(obj) {
        out.push_str(&format!("  derived confidence : {dc:.3}\n"));
    }
    if let Some(st) = argument_status(obj) {
        out.push_str(&format!(
            "  argument status    : {st}  ({})\n",
            status_gloss(st)
        ));
    }
    if let Object::Focus(f) = obj {
        if let Some(s) = &f.status {
            out.push_str(&format!("  lifecycle status   : {s}\n"));
        }
        if let Some(by) = &f.superseded_by {
            out.push_str(&format!("  superseded by      : {by}\n"));
        }
    }

    // Incoming evidence: every supports/opposes/undercuts link pointing at `id`.
    let mut evidence: Vec<&crate::canonical::Link> = canon
        .objects
        .iter()
        .filter_map(|o| match o {
            Object::Link(l) if l.to == id && is_evidence(&l.relation) => Some(l),
            _ => None,
        })
        .collect();
    evidence.sort_by(|a, b| a.from.cmp(&b.from));
    if !evidence.is_empty() {
        out.push_str("\n  evidence in:\n");
        for l in &evidence {
            let w = l
                .weight
                .map(|w| format!("weight {w}"))
                .unwrap_or_else(|| "weight -".into());
            let lev = l
                .leverage
                .map(|v| format!("leverage {v:+.3}"))
                .unwrap_or_else(|| "leverage -".into());
            let src_status = obj_status_by_id(canon, &l.from)
                .map(|s| format!("source: {s}"))
                .unwrap_or_else(|| "source: -".into());
            out.push_str(&format!(
                "    {:<10} {:<28} {:<12} {:<14} ({src_status})\n",
                l.relation, l.from, w, lev
            ));
        }
    }

    // Stances agents hold on this node.
    let stances: Vec<&crate::canonical::Stance> = canon
        .objects
        .iter()
        .filter_map(|o| match o {
            Object::Stance(s) if s.target == id => Some(s),
            _ => None,
        })
        .collect();
    if !stances.is_empty() {
        out.push_str("\n  stances:\n");
        for s in &stances {
            let c = s
                .confidence
                .as_ref()
                .map(conf_str)
                .unwrap_or_else(|| "-".into());
            out.push_str(&format!("    {} {}  confidence {c}\n", s.agent, s.posture));
        }
    }

    // Any mirror conflict this node is a subject of.
    if let Some(audit) = &canon.audit {
        let mine: Vec<&crate::canonical::Conflict> = audit
            .conflicts
            .iter()
            .filter(|c| c.subjects.iter().any(|s| s == id))
            .collect();
        if !mine.is_empty() {
            out.push_str("\n  conflicts:\n");
            for c in &mine {
                out.push_str(&format!("    [{}] {}\n", c.kind, c.message));
            }
        }
    }

    // A one-line "why", grounded in the argument status.
    if let Some(st) = argument_status(obj) {
        out.push('\n');
        match st {
            "out" => {
                let live: Vec<&str> = evidence
                    .iter()
                    .filter(|l| is_attack(&l.relation))
                    .filter(|l| obj_status_by_id(canon, &l.from) == Some("in"))
                    .map(|l| l.from.as_str())
                    .collect();
                if live.is_empty() {
                    out.push_str("  why: defeated within the attack graph.\n");
                } else {
                    out.push_str(&format!(
                        "  why: defeated by attacker(s) that stand: {}.\n",
                        live.join(", ")
                    ));
                }
            }
            "in" => out.push_str("  why: survives every attack on it.\n"),
            _ => out.push_str("  why: undecided (e.g. a mutual or unresolved attack).\n"),
        }
    }

    Some(out)
}

fn is_evidence(rel: &str) -> bool {
    matches!(rel, "supports" | "opposes" | "undercuts")
}

fn is_attack(rel: &str) -> bool {
    matches!(rel, "opposes" | "undercuts")
}

fn status_gloss(st: &str) -> &'static str {
    match st {
        "in" => "accepted",
        "out" => "defeated",
        _ => "undecided",
    }
}

fn obj_id(o: &Object) -> Option<&str> {
    Some(match o {
        Object::Focus(x) => &x.id,
        Object::Question(x) => &x.id,
        Object::Link(x) => &x.id,
        Object::Stance(x) => &x.id,
        Object::Scope(x) => &x.id,
        Object::Act(x) => &x.id,
        Object::Profile(_) => return None,
    })
}

fn type_label(o: &Object) -> String {
    match o {
        Object::Focus(f) => f.kind.clone().unwrap_or_else(|| "focus".into()),
        Object::Question(_) => "question".into(),
        Object::Link(l) => format!("link: {}", l.relation),
        Object::Stance(s) => format!("stance: {}", s.posture),
        Object::Scope(_) => "scope".into(),
        Object::Act(_) => "act".into(),
        Object::Profile(_) => "profile".into(),
    }
}

fn obj_body(o: &Object) -> Option<&str> {
    match o {
        Object::Focus(f) => f.body.as_deref(),
        Object::Question(q) => q.body.as_deref(),
        Object::Link(l) => l.body.as_deref(),
        _ => None,
    }
}

fn derived_confidence(o: &Object) -> Option<f64> {
    match o {
        Object::Focus(f) => f.derived_confidence,
        Object::Link(l) => l.derived_confidence,
        _ => None,
    }
}

fn argument_status(o: &Object) -> Option<&str> {
    match o {
        Object::Focus(f) => f.argument_status.as_deref(),
        Object::Link(l) => l.argument_status.as_deref(),
        _ => None,
    }
}

fn obj_status_by_id<'a>(canon: &'a Canonical, id: &str) -> Option<&'a str> {
    canon
        .objects
        .iter()
        .find(|o| obj_id(o) == Some(id))
        .and_then(argument_status)
}

fn conf_str(v: &Value) -> String {
    match v {
        Value::Number(n) => format!("{n}"),
        Value::Range(lo, hi) => format!("{lo}..{hi}"),
        Value::Unknown => "?".into(),
        other => format!("{other:?}"),
    }
}
