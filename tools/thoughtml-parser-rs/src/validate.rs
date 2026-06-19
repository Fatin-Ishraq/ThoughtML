//! Post-desugaring validation (spec §10).
//!
//! Structural/lexical rules (grammar shape, tabs, confidence forms, unknown
//! records/fields) are enforced earlier, in `lines`, `parser`, and `desugar`.
//! This pass handles cross-record reference resolution and link-endpoint kind
//! constraints, which need the full object set.

use crate::canonical::{Canonical, Fields, Object};
use crate::diagnostics::Diagnostics;
use crate::lex::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// Known fields whose value is a reference to another record (worth resolving).
const REF_FIELDS: &[&str] = &["because", "answers", "blocked-by", "undercut-by"];

/// The kind of a canonical object, for endpoint-kind checks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Focus,
    Question,
    Link,
    Stance,
    Scope,
    Act,
}

impl Kind {
    fn name(self) -> &'static str {
        match self {
            Kind::Focus => "focus",
            Kind::Question => "question",
            Kind::Link => "link",
            Kind::Stance => "stance",
            Kind::Scope => "scope",
            Kind::Act => "act",
        }
    }
}

pub fn validate(canon: &Canonical, diags: &mut Diagnostics) {
    let index = build_index(canon);

    for obj in &canon.objects {
        match obj {
            Object::Link(link) => {
                // link.from / link.to may target foci, questions, or links (§10).
                check_endpoint(&index, &link.from, &link.id, "link.from", diags);
                check_endpoint(&index, &link.to, &link.id, "link.to", diags);
            }
            Object::Stance(stance) => {
                // stance.target may target any kind; only resolution matters.
                if !index.contains_key(&stance.target) {
                    diags.warning(
                        0,
                        format!(
                            "stance `{}` targets unresolved reference `{}`",
                            stance.id, stance.target
                        ),
                    );
                }
                resolve_ref_fields(&index, &stance.fields, &stance.id, diags);
            }
            Object::Focus(f) => {
                resolve_ref_fields(&index, &f.fields, &f.id, diags);
                // A formula's references must resolve (Phase 8); the formula eval
                // pass reports richer errors, but resolution is an always-on check.
                if let Some(expr) = &f.formula {
                    for r in crate::formula::referenced_ids(expr) {
                        if !index.contains_key(&r) {
                            diags.warning(
                                0,
                                format!("formula on `{}` references unresolved `{}`", f.id, r),
                            );
                        }
                    }
                }
            }
            Object::Question(q) => {
                for r in &q.asks_about {
                    if !index.contains_key(r) {
                        diags.warning(
                            0,
                            format!("question `{}` is about unresolved reference `{}`", q.id, r),
                        );
                    }
                }
                resolve_ref_fields(&index, &q.fields, &q.id, diags);
            }
            _ => {}
        }
    }

    // Tier-1 semantic lints: consistency checks that need the whole graph.
    check_contradictions(canon, diags);
    check_cycles(canon, diags);
    check_orphans(canon, diags);
    check_decision_graph(canon, diags);
}

/// Catch malformed decision subgraphs (Phase 5 review) — the class of error the
/// language should surface, not silently drop. Two checks:
///
/// * A `leads-to` edge that points an outcome at itself (`x leads-to x`) — almost
///   always a typo, and it pollutes the option's expected value.
/// * A **mixed** decision: when some of a decision's options carry `leads-to`
///   outcomes and a sibling option does not, that bare option is silently skipped
///   from the EV ranking. (A decision where *no* option has outcomes is a fine
///   pure-choice decision and is not flagged.)
fn check_decision_graph(canon: &Canonical, diags: &mut Diagnostics) {
    // Options that carry at least one `leads-to` outcome, and self-loop edges.
    let mut has_outcomes: BTreeSet<&str> = BTreeSet::new();
    for obj in &canon.objects {
        if let Object::Link(l) = obj {
            if l.relation == "leads-to" {
                if l.from == l.to {
                    diags.warning(
                        0,
                        format!("`leads-to` edge `{}` points outcome `{}` at itself", l.id, l.to),
                    );
                }
                has_outcomes.insert(l.from.as_str());
            }
        }
    }

    // Group options under their decisions via `option-of`, preserving order.
    let mut options_of: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for obj in &canon.objects {
        if let Object::Link(l) = obj {
            if l.relation == "option-of" {
                options_of.entry(l.to.as_str()).or_default().push(l.from.as_str());
            }
        }
    }
    for (decision, options) in &options_of {
        let wired = options.iter().filter(|o| has_outcomes.contains(*o)).count();
        if wired == 0 || wired == options.len() {
            continue; // pure-choice (none wired) or fully-EV (all wired): both fine
        }
        for opt in options {
            if !has_outcomes.contains(opt) {
                diags.warning(
                    0,
                    format!(
                        "option `{opt}` of decision `{decision}` has no `leads-to` outcomes, but its sibling options do; it will be missing from the expected-value ranking"
                    ),
                );
            }
        }
    }
}

// --- Tier-1 semantic lints ------------------------------------------------

/// Posture pairs that cannot coherently coexist for one agent on one target.
/// Compared on the sorted pair so order of declaration does not matter.
fn postures_conflict(a: &str, b: &str) -> bool {
    let mut pair = [a, b];
    pair.sort_unstable();
    matches!(
        pair,
        ["accepts", "rejects"]
            | ["accepts", "doubts"]
            | ["chooses", "rejects"]
            | ["holds", "rejects"]
    )
}

/// Warn when one agent takes contradictory postures on the same target, e.g.
/// `alice accepts plan-a` together with `alice rejects plan-a`.
fn check_contradictions(canon: &Canonical, diags: &mut Diagnostics) {
    let mut groups: BTreeMap<(&str, &str), Vec<&str>> = BTreeMap::new();
    for obj in &canon.objects {
        if let Object::Stance(s) = obj {
            groups
                .entry((s.agent.as_str(), s.target.as_str()))
                .or_default()
                .push(s.posture.as_str());
        }
    }
    for ((agent, target), postures) in &groups {
        let mut distinct: Vec<&str> = Vec::new();
        for p in postures {
            if !distinct.contains(p) {
                distinct.push(p);
            }
        }
        for i in 0..distinct.len() {
            for j in (i + 1)..distinct.len() {
                if postures_conflict(distinct[i], distinct[j]) {
                    diags.warning(
                        0,
                        format!(
                            "agent `{agent}` takes contradictory stances on `{target}`: `{}` and `{}`",
                            distinct[i], distinct[j]
                        ),
                    );
                }
            }
        }
    }
}

/// Relations that describe a directed dependency and are expected to be acyclic.
fn is_acyclic_relation(rel: &str) -> bool {
    matches!(rel, "causes" | "depends-on")
}

#[derive(Clone, Copy, PartialEq)]
enum Color {
    White,
    Gray,
    Black,
}

/// Warn on cycles among `causes` / `depends-on` links (e.g. `a causes b`,
/// `b causes a`), which describe an impossible circular dependency.
fn check_cycles(canon: &Canonical, diags: &mut Diagnostics) {
    let mut adj: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    let mut nodes: BTreeSet<&str> = BTreeSet::new();
    for obj in &canon.objects {
        if let Object::Link(l) = obj {
            if is_acyclic_relation(&l.relation) {
                adj.entry(l.from.as_str()).or_default().push(l.to.as_str());
                nodes.insert(l.from.as_str());
                nodes.insert(l.to.as_str());
            }
        }
    }

    let mut color: BTreeMap<&str, Color> = nodes.iter().map(|&n| (n, Color::White)).collect();
    let mut reported: BTreeSet<Vec<&str>> = BTreeSet::new();
    let mut stack: Vec<&str> = Vec::new();
    for &node in &nodes {
        if color[node] == Color::White {
            dfs_cycle(node, &adj, &mut color, &mut stack, &mut reported, diags);
        }
    }
}

fn dfs_cycle<'a>(
    node: &'a str,
    adj: &BTreeMap<&'a str, Vec<&'a str>>,
    color: &mut BTreeMap<&'a str, Color>,
    stack: &mut Vec<&'a str>,
    reported: &mut BTreeSet<Vec<&'a str>>,
    diags: &mut Diagnostics,
) {
    color.insert(node, Color::Gray);
    stack.push(node);
    if let Some(neighbors) = adj.get(node) {
        for &next in neighbors {
            match color.get(next).copied().unwrap_or(Color::White) {
                Color::White => dfs_cycle(next, adj, color, stack, reported, diags),
                Color::Gray => {
                    let start = stack.iter().position(|&n| n == next).unwrap_or(0);
                    let cycle = stack[start..].to_vec();
                    let mut key = cycle.clone();
                    key.sort_unstable();
                    if reported.insert(key) {
                        let mut path = cycle;
                        path.push(next);
                        diags.warning(
                            0,
                            format!("cyclic dependency: {}", path.join(" → ")),
                        );
                    }
                }
                Color::Black => {}
            }
        }
    }
    stack.pop();
    color.insert(node, Color::Black);
}

/// Warn on foci that nothing in the graph connects to — no link touches them,
/// no stance targets them, and no field references them. A dangling focus is
/// usually a typo or an unfinished thought.
fn check_orphans(canon: &Canonical, diags: &mut Diagnostics) {
    let mut referenced: BTreeSet<String> = BTreeSet::new();
    for obj in &canon.objects {
        match obj {
            Object::Link(l) => {
                referenced.insert(l.from.clone());
                referenced.insert(l.to.clone());
                collect_ref_values(&l.fields, &mut referenced);
            }
            Object::Stance(s) => {
                referenced.insert(s.target.clone());
                collect_ref_values(&s.fields, &mut referenced);
            }
            Object::Question(q) => {
                for r in &q.asks_about {
                    referenced.insert(r.clone());
                }
                collect_ref_values(&q.fields, &mut referenced);
            }
            Object::Scope(sc) => {
                for r in &sc.includes {
                    referenced.insert(r.clone());
                }
                collect_ref_values(&sc.fields, &mut referenced);
            }
            Object::Focus(f) => {
                collect_ref_values(&f.fields, &mut referenced);
                // A formula connects this focus to its inputs (and a computed
                // focus is itself a meaningful node, so it is never an orphan).
                if let Some(expr) = &f.formula {
                    referenced.insert(f.id.clone());
                    for r in crate::formula::referenced_ids(expr) {
                        referenced.insert(r);
                    }
                }
            }
            Object::Act(_) => {}
            Object::Profile(_) => {}
        }
    }
    for obj in &canon.objects {
        if let Object::Focus(f) = obj {
            if !referenced.contains(&f.id) {
                diags.warning(
                    0,
                    format!("focus `{}` is not connected to anything", f.id),
                );
            }
        }
    }
}

/// Add every `Ref`-valued field target to `set` (used by the orphan check).
fn collect_ref_values(fields: &Fields, set: &mut BTreeSet<String>) {
    for (_, v) in &fields.0 {
        if let Value::Ref(r) = v {
            set.insert(r.clone());
        }
    }
}

fn build_index(canon: &Canonical) -> HashMap<String, Kind> {
    let mut index = HashMap::new();
    for obj in &canon.objects {
        let (id, kind) = match obj {
            Object::Focus(o) => (&o.id, Kind::Focus),
            Object::Question(o) => (&o.id, Kind::Question),
            Object::Link(o) => (&o.id, Kind::Link),
            Object::Stance(o) => (&o.id, Kind::Stance),
            Object::Scope(o) => (&o.id, Kind::Scope),
            Object::Act(o) => (&o.id, Kind::Act),
            // A profile is document metadata, not a referenceable node.
            Object::Profile(_) => continue,
        };
        index.insert(id.clone(), kind);
    }
    index
}

fn check_endpoint(
    index: &HashMap<String, Kind>,
    target: &str,
    owner: &str,
    role: &str,
    diags: &mut Diagnostics,
) {
    match index.get(target) {
        None => diags.warning(
            0,
            format!("{role} of `{owner}` is an unresolved reference `{target}`"),
        ),
        Some(kind) => {
            if !matches!(kind, Kind::Focus | Kind::Question | Kind::Link) {
                diags.error(
                    0,
                    format!(
                        "{role} of `{owner}` targets a {} `{target}`; links may only connect foci, questions, or links",
                        kind.name()
                    ),
                );
            }
        }
    }
}

fn resolve_ref_fields(
    index: &HashMap<String, Kind>,
    fields: &crate::canonical::Fields,
    owner: &str,
    diags: &mut Diagnostics,
) {
    for (name, value) in &fields.0 {
        if !REF_FIELDS.contains(&name.as_str()) {
            continue;
        }
        if let Value::Ref(target) = value {
            if !index.contains_key(target) {
                diags.warning(
                    0,
                    format!("`{owner}` field `{name}` references unresolved `{target}`"),
                );
            }
        }
    }
}
