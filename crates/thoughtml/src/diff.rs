//! `diff a b`: a semantic diff of two documents at the *belief* level, not the
//! text level. Reports nodes added and removed, and for nodes present in both, the
//! changes that matter — derived confidence, grounded status (`in`/`out`),
//! lifecycle status, supersession, a stance's confidence, a link's weight — plus
//! the mirror conflicts that appeared or resolved between the two. Both models must
//! be derived with the compute stack on, so the readings exist to compare.

use crate::canonical::{Canonical, Conflict, Object};
use crate::lex::Value;
use std::collections::BTreeMap;

/// The result of comparing two models: a rendered report and whether anything moved.
pub struct DiffReport {
    pub text: String,
    pub changed: bool,
}

pub fn diff(a: &Canonical, b: &Canonical) -> DiffReport {
    let am = index(a);
    let bm = index(b);

    let mut added: Vec<&str> = bm.keys().filter(|k| !am.contains_key(*k)).copied().collect();
    let mut removed: Vec<&str> = am.keys().filter(|k| !bm.contains_key(*k)).copied().collect();
    added.sort_unstable();
    removed.sort_unstable();

    let mut changes: Vec<(String, Vec<String>)> = Vec::new();
    let mut common: Vec<&str> = am.keys().filter(|k| bm.contains_key(*k)).copied().collect();
    common.sort_unstable();
    for id in common {
        let deltas = compare(am[id], bm[id]);
        if !deltas.is_empty() {
            changes.push((id.to_string(), deltas));
        }
    }

    let (gone, appeared) = conflict_delta(a, b);

    let changed =
        !added.is_empty() || !removed.is_empty() || !changes.is_empty() || !gone.is_empty() || !appeared.is_empty();

    let mut out = String::new();
    out.push_str("belief diff: A -> B\n");

    if !added.is_empty() {
        out.push_str(&format!("\nadded ({}):\n", added.len()));
        for id in &added {
            out.push_str(&format!("  + {id}  ({})\n", type_label(bm[id])));
        }
    }
    if !removed.is_empty() {
        out.push_str(&format!("\nremoved ({}):\n", removed.len()));
        for id in &removed {
            out.push_str(&format!("  - {id}  ({})\n", type_label(am[id])));
        }
    }
    if !changes.is_empty() {
        out.push_str(&format!("\nchanged ({}):\n", changes.len()));
        for (id, deltas) in &changes {
            out.push_str(&format!("  ~ {id}\n"));
            for d in deltas {
                out.push_str(&format!("      {d}\n"));
            }
        }
    }
    if !appeared.is_empty() || !gone.is_empty() {
        out.push_str("\nconflicts:\n");
        for c in &appeared {
            out.push_str(&format!("  + [{}] {}\n", c.kind, c.message));
        }
        for c in &gone {
            out.push_str(&format!("  - [{}] {} (resolved)\n", c.kind, c.message));
        }
    }

    if !changed {
        out.push_str("\nno belief-level changes.\n");
    }

    DiffReport { text: out, changed }
}

fn index(c: &Canonical) -> BTreeMap<&str, &Object> {
    let mut m = BTreeMap::new();
    for o in &c.objects {
        if let Some(id) = obj_id(o) {
            m.insert(id, o);
        }
    }
    m
}

/// The belief-level deltas between the same id in A and B.
fn compare(a: &Object, b: &Object) -> Vec<String> {
    let mut d = Vec::new();
    if type_label(a) != type_label(b) {
        d.push(format!("type {} -> {}", type_label(a), type_label(b)));
    }
    match (a, b) {
        (Object::Focus(x), Object::Focus(y)) => {
            diff_opt_f64(&mut d, "confidence", x.derived_confidence, y.derived_confidence);
            diff_opt_str(&mut d, "status", x.argument_status.as_deref(), y.argument_status.as_deref());
            diff_opt_str(&mut d, "lifecycle", x.status.as_deref(), y.status.as_deref());
            diff_opt_str(&mut d, "superseded_by", x.superseded_by.as_deref(), y.superseded_by.as_deref());
            if x.body != y.body {
                d.push("body changed".into());
            }
        }
        (Object::Link(x), Object::Link(y)) => {
            if x.relation != y.relation {
                d.push(format!("relation {} -> {}", x.relation, y.relation));
            }
            diff_opt_f64(&mut d, "weight", x.weight, y.weight);
            diff_opt_f64(&mut d, "confidence", x.derived_confidence, y.derived_confidence);
            diff_opt_str(&mut d, "status", x.argument_status.as_deref(), y.argument_status.as_deref());
        }
        (Object::Stance(x), Object::Stance(y)) => {
            let cx = x.confidence.as_ref().and_then(conf_num);
            let cy = y.confidence.as_ref().and_then(conf_num);
            diff_opt_f64(&mut d, "confidence", cx, cy);
        }
        (Object::Question(x), Object::Question(y)) => {
            diff_opt_str(&mut d, "status", x.status.as_deref(), y.status.as_deref());
        }
        _ => {}
    }
    d
}

fn diff_opt_f64(d: &mut Vec<String>, label: &str, a: Option<f64>, b: Option<f64>) {
    match (a, b) {
        (Some(x), Some(y)) if (x - y).abs() > 0.0005 => {
            d.push(format!("{label} {x:.3} -> {y:.3}"))
        }
        (None, Some(y)) => d.push(format!("{label} — -> {y:.3}")),
        (Some(x), None) => d.push(format!("{label} {x:.3} -> —")),
        _ => {}
    }
}

fn diff_opt_str(d: &mut Vec<String>, label: &str, a: Option<&str>, b: Option<&str>) {
    if a != b {
        d.push(format!(
            "{label} {} -> {}",
            a.unwrap_or("—"),
            b.unwrap_or("—")
        ));
    }
}

/// Conflicts present in `a` but not `b` (resolved), and in `b` but not `a`
/// (appeared), keyed by kind + sorted subjects so order does not matter.
fn conflict_delta<'a>(a: &'a Canonical, b: &'a Canonical) -> (Vec<&'a Conflict>, Vec<&'a Conflict>) {
    let key = |c: &Conflict| {
        let mut subs = c.subjects.clone();
        subs.sort();
        format!("{}|{}", c.kind, subs.join(","))
    };
    let akeys: std::collections::BTreeSet<String> =
        a.audit.iter().flat_map(|au| au.conflicts.iter()).map(&key).collect();
    let bkeys: std::collections::BTreeSet<String> =
        b.audit.iter().flat_map(|au| au.conflicts.iter()).map(&key).collect();

    let gone = a
        .audit
        .iter()
        .flat_map(|au| au.conflicts.iter())
        .filter(|c| !bkeys.contains(&key(c)))
        .collect();
    let appeared = b
        .audit
        .iter()
        .flat_map(|au| au.conflicts.iter())
        .filter(|c| !akeys.contains(&key(c)))
        .collect();
    (gone, appeared)
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
        Object::Link(l) => format!("link:{}", l.relation),
        Object::Stance(s) => format!("stance:{}", s.posture),
        Object::Scope(_) => "scope".into(),
        Object::Act(_) => "act".into(),
        Object::Profile(_) => "profile".into(),
    }
}

fn conf_num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => Some(*n),
        Value::Range(lo, hi) => Some((lo + hi) / 2.0),
        _ => None,
    }
}
