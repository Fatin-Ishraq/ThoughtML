//! Derived temporal facts, computed after validation (spec §10.2, Phase 3).
//!
//! Two things are derived here, both pure functions of the canonical model:
//!
//! * **Supersession.** A `revises` *relation* (`new revises old`) marks `old`
//!   superseded by `new`; a `revises` *posture* (`agent revises X`) marks the
//!   agent's previous stance on `X` superseded by the new one. Nothing is
//!   deleted — a revision is a new belief layered over an old one, so the
//!   history stays inspectable and the as-of view can replay it.
//! * **Timeline.** The document's earliest and latest timestamps across every
//!   `asserted-at` / `observed-at` / `valid-during` field.
//!
//! Temporal ordering is sanity-checked (a revision should not predate what it
//! revises; a `valid-during` span should not end before it starts).

use crate::canonical::{
    Audit, Canonical, Conflict, DecisionEV, EvTerm, ExpectedValue, Fields, Link, Object, OptionEV,
    Quantity, Timeline,
};
use crate::diagnostics::Diagnostics;
use crate::lex::Value;
use crate::units::{self, Signature};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

/// A perturbation of the evidence and attack graphs, applied before the derived
/// evaluations run — the hook behind Phase 6 what-if & sensitivity (§10.5). Empty
/// by default, so an authored document derives exactly as before.
#[derive(Debug, Clone, Default)]
pub struct Overrides {
    /// Link ids dropped from the evidence and attack graphs.
    pub disabled_links: HashSet<String>,
    /// Node ids dropped: every evidence/attack link touching one is removed.
    pub disabled_nodes: HashSet<String>,
}

impl Overrides {
    pub fn is_empty(&self) -> bool {
        self.disabled_links.is_empty() && self.disabled_nodes.is_empty()
    }

    /// Whether this override removes the given link from the graphs — directly,
    /// or because one of its endpoints is disabled.
    fn drops(&self, l: &Link) -> bool {
        self.disabled_links.contains(&l.id)
            || self.disabled_nodes.contains(&l.from)
            || self.disabled_nodes.contains(&l.to)
    }
}

/// Run the derive pass: supersession + timeline (always), and — when requested —
/// evidence-propagated `derived_confidence` (§10.3), grounded `argument_status`
/// (§10.4), and per-evidence `leverage` (§10.5). `overrides` perturbs the
/// evidence/attack graphs for what-if recompute; pass `&Overrides::default()` for
/// the authored document.
pub fn derive(
    canon: &mut Canonical,
    derive_confidence: bool,
    argument_status: bool,
    sensitivity: bool,
    formulas: bool,
    decision_ev: bool,
    audit: bool,
    overrides: &Overrides,
    diags: &mut Diagnostics,
) {
    compute_supersession(canon, diags);
    canon.timeline = compute_timeline(canon, diags);
    if derive_confidence {
        compute_confidence(canon, overrides);
    }
    if argument_status {
        compute_status(canon, overrides);
    }
    if sensitivity {
        compute_sensitivity(canon, overrides);
    }
    if formulas {
        compute_formulas(canon, overrides, diags);
    }
    // Decision EV runs last: it reads the computed payoffs (formulas, §4.8) and
    // the derived confidences (§10.3) the passes above may have produced. Both
    // honor `overrides`, so a what-if mute recomputes the whole stack, not just
    // confidence/status/leverage.
    if decision_ev {
        compute_decisions(canon, overrides, diags);
    }
    // The mirror's conflict report (§10.7): a second reading that disagrees with
    // the author. It reads the grounded `argument_status`, so ensure that ran.
    if audit {
        if !argument_status {
            compute_status(canon, overrides);
        }
        canon.audit = Some(compute_conflicts(canon));
    }
}

// --- Supersession ---------------------------------------------------------

fn compute_supersession(canon: &mut Canonical, diags: &mut Diagnostics) {
    let index: HashMap<&str, usize> = canon
        .objects
        .iter()
        .enumerate()
        .map(|(i, o)| (obj_id(o), i))
        .collect();

    // (object index to mark, id of the belief that supersedes it).
    let mut marks: Vec<(usize, String)> = Vec::new();

    // (A) Node supersession via a `revises` relation: `new revises old`.
    for o in &canon.objects {
        let Object::Link(l) = o else { continue };
        if l.relation != "revises" {
            continue;
        }
        let Some(&old_idx) = index.get(l.to.as_str()) else {
            continue;
        };
        marks.push((old_idx, l.from.clone()));

        // A revision must not be asserted before the thing it revises. The
        // revision's time is the link's own, falling back to the new belief's.
        let new_t = assertion_time(o).or_else(|| {
            index
                .get(l.from.as_str())
                .and_then(|&i| assertion_time(&canon.objects[i]))
        });
        let old_t = assertion_time(&canon.objects[old_idx]);
        if let (Some(nk), Some(ok)) = (
            new_t.as_deref().and_then(time_key),
            old_t.as_deref().and_then(time_key),
        ) {
            if nk < ok {
                diags.warning(
                    0,
                    format!(
                        "`{}` revises `{}` but is asserted earlier",
                        l.from, l.to
                    ),
                );
            }
        }
    }

    // (B) Stance supersession: a `revises` posture supersedes the same agent's
    // most recent prior stance on the same target.
    let mut head: HashMap<(&str, &str), usize> = HashMap::new();
    for (i, o) in canon.objects.iter().enumerate() {
        let Object::Stance(s) = o else { continue };
        let key = (s.agent.as_str(), s.target.as_str());
        if s.posture == "revises" {
            if let Some(&prev_idx) = head.get(&key) {
                marks.push((prev_idx, s.id.clone()));
            }
        }
        head.insert(key, i);
    }

    for (idx, by) in marks {
        set_superseded(&mut canon.objects[idx], by);
    }
}

// --- Timeline -------------------------------------------------------------

fn compute_timeline(canon: &Canonical, diags: &mut Diagnostics) -> Option<Timeline> {
    let mut times: Vec<(i64, String)> = Vec::new();
    for o in &canon.objects {
        let Some(fields) = obj_fields(o) else { continue };
        for (name, value) in &fields.0 {
            let Value::Time(raw) = value else { continue };
            match name.as_str() {
                "asserted-at" | "observed-at" => {
                    if let Some(k) = time_key(raw) {
                        times.push((k, raw.clone()));
                    }
                }
                // `valid-during start..end` is a span; record both ends.
                "valid-during" => match raw.split_once("..") {
                    Some((a, b)) => {
                        if let (Some(ka), Some(kb)) = (time_key(a), time_key(b)) {
                            if ka > kb {
                                diags.warning(
                                    0,
                                    format!("`valid-during {raw}` ends before it starts"),
                                );
                            }
                            times.push((ka, a.to_string()));
                            times.push((kb, b.to_string()));
                        }
                    }
                    None => {
                        if let Some(k) = time_key(raw) {
                            times.push((k, raw.clone()));
                        }
                    }
                },
                _ => {}
            }
        }
    }
    let start = times.iter().min_by_key(|(k, _)| *k)?.1.clone();
    let end = times.iter().max_by_key(|(k, _)| *k)?.1.clone();
    Some(Timeline { start, end })
}

// --- Derived confidence (Phase 4) -----------------------------------------

/// How far one unit of weighted evidence moves the log-odds. Chosen so a single
/// strong support (weight 0.85, full-strength source) yields ≈0.85 confidence.
const EVIDENCE_GAIN: f64 = 2.0;

/// The assumed strength of an evidence link with no explicit weight.
const DEFAULT_WEIGHT: f64 = 0.5;

/// The model's neutral point: a target with zero net evidence sits here, since
/// `logistic(0) = 0.5`. Also the fallback a target falls to when sensitivity
/// ablation strips away its last piece of evidence (§10.5).
const NEUTRAL: f64 = 0.5;

/// A single evidence edge pointing at a claim.
#[derive(Clone)]
struct Evidence {
    /// The id of the source link, so ablation can name the edge it removed.
    id: String,
    from: String,
    to: String,
    weight: f64,
    polarity: f64,
}

/// Gather the evidence edges (`supports` / `opposes` / `undercuts`) from the
/// model, dropping any the overrides remove (Phase 6 what-if).
///
/// The undercut/rebut distinction (Phase 5 review): an `undercuts` edge whose
/// target is a *link* attacks the **inference**, not a claim — so rather than
/// pulling a node down, it reduces the undercut connection's own weight. That is
/// the power `undercuts` has and `opposes` (a node rebuttal) does not; on a node
/// the two still coincide as `−1` evidence. With no inference-undercut present,
/// every weight is untouched and the output is byte-identical to before.
fn build_evidence(canon: &Canonical, overrides: &Overrides) -> Vec<Evidence> {
    let link_ids: HashSet<&str> = canon
        .objects
        .iter()
        .filter_map(|o| match o {
            Object::Link(l) => Some(l.id.as_str()),
            _ => None,
        })
        .collect();

    // Health of each undercut inference: ∏(1 − undercut weight) over surviving
    // `undercuts`-of-a-link edges (a `strongly undercuts`, weight 0.85, leaves
    // 0.15). 1.0 — untouched — when nothing undercuts it. The undercutter is
    // taken as asserted; folding in *its* believedness is a documented v-next.
    let mut health: HashMap<String, f64> = HashMap::new();
    for o in &canon.objects {
        if let Object::Link(l) = o {
            if overrides.drops(l) || l.relation != "undercuts" || !link_ids.contains(l.to.as_str()) {
                continue;
            }
            let w = l.weight.unwrap_or(DEFAULT_WEIGHT);
            let h = health.entry(l.to.clone()).or_insert(1.0);
            *h *= 1.0 - w;
        }
    }

    let mut evs = Vec::new();
    for o in &canon.objects {
        if let Object::Link(l) = o {
            if overrides.drops(l) {
                continue;
            }
            // An undercut of an inference is realized by the `health` weakening
            // above, not as node-evidence against its (link) target.
            if l.relation == "undercuts" && link_ids.contains(l.to.as_str()) {
                continue;
            }
            if let Some(polarity) = evidence_polarity(&l.relation) {
                let weight =
                    l.weight.unwrap_or(DEFAULT_WEIGHT) * health.get(&l.id).copied().unwrap_or(1.0);
                evs.push(Evidence {
                    id: l.id.clone(),
                    from: l.from.clone(),
                    to: l.to.clone(),
                    weight,
                    polarity,
                });
            }
        }
    }
    evs
}

/// Propagate belief through an evidence graph to a derived confidence per target,
/// in topological order (so a conclusion sees its premises' *derived* strength,
/// not just their authored confidence). `order` is the document's declaration
/// order, used as a deterministic tie-break and cycle fallback.
///
/// Pure — same inputs always yield the same map. This is the Phase-6 keystone:
/// the what-if recompute and the sensitivity ablation both call it over perturbed
/// evidence sets, never touching the canonical model directly.
fn propagate(
    evs: &[Evidence],
    authored: &HashMap<String, f64>,
    order: &[String],
) -> HashMap<String, f64> {
    // Evidence graph: a directed edge source → target per evidence link.
    let mut indeg: HashMap<String, usize> = HashMap::new();
    let mut out_adj: HashMap<String, Vec<String>> = HashMap::new();
    let mut incoming: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, e) in evs.iter().enumerate() {
        *indeg.entry(e.to.clone()).or_insert(0) += 1;
        indeg.entry(e.from.clone()).or_insert(0);
        out_adj.entry(e.from.clone()).or_default().push(e.to.clone());
        incoming.entry(e.to.clone()).or_default().push(i);
    }

    // Declaration order of the nodes involved (deterministic tie-break).
    let nodes: Vec<String> = order
        .iter()
        .filter(|id| indeg.contains_key(*id))
        .cloned()
        .collect();

    // Kahn's topological sweep; sources resolve before the claims they back.
    let mut derived: HashMap<String, f64> = HashMap::new();
    let mut processed: usize = 0;
    let mut queue: VecDeque<String> =
        nodes.iter().filter(|id| indeg[*id] == 0).cloned().collect();
    let mut done: HashMap<String, bool> = HashMap::new();
    while let Some(n) = queue.pop_front() {
        done.insert(n.clone(), true);
        processed += 1;
        if let Some(idxs) = incoming.get(&n) {
            derived.insert(n.clone(), node_confidence(idxs, evs, &derived, authored));
        }
        if let Some(targets) = out_adj.get(&n) {
            for t in targets {
                let d = indeg.get_mut(t).expect("target has an in-degree");
                *d -= 1;
                if *d == 0 {
                    queue.push_back(t.clone());
                }
            }
        }
    }

    // Any nodes left sit on an evidence cycle; resolve them once in declaration
    // order using whatever strengths are available (a documented best-effort).
    if processed < nodes.len() {
        for id in &nodes {
            if done.contains_key(id) {
                continue;
            }
            if let Some(idxs) = incoming.get(id) {
                derived.insert(id.clone(), node_confidence(idxs, evs, &derived, authored));
            }
        }
    }

    derived
}

/// The declaration order of every object id — the deterministic spine both
/// `propagate` and the sensitivity ablation share.
fn declaration_order(canon: &Canonical) -> Vec<String> {
    canon.objects.iter().map(obj_id).map(str::to_string).collect()
}

/// Compute a `derived_confidence` for every focus/link that is the target of
/// evidence, propagating belief through the (possibly perturbed) evidence graph.
/// Strictly separate from authored confidence.
fn compute_confidence(canon: &mut Canonical, overrides: &Overrides) {
    let authored = authored_belief(canon);
    let evs = build_evidence(canon, overrides);
    if evs.is_empty() {
        return;
    }
    let order = declaration_order(canon);
    let derived = propagate(&evs, &authored, &order);

    for o in &mut canon.objects {
        match o {
            Object::Focus(f) => {
                if let Some(d) = derived.get(&f.id) {
                    f.derived_confidence = Some(round3(*d));
                }
            }
            Object::Link(l) => {
                if let Some(d) = derived.get(&l.id) {
                    l.derived_confidence = Some(round3(*d));
                }
            }
            _ => {}
        }
    }
}

/// Per-evidence **leverage** (§10.5, Phase 6): how load-bearing each surviving
/// evidence link is on its target. For link *e* into target *T*,
/// `leverage(e) = derived(T) − derived_without_e(T)`, where a target left with no
/// evidence falls to the model's [`NEUTRAL`] point. Positive = *e* props *T* up
/// (a support); negative = it drags *T* down (an attack); magnitude = how much
/// the conclusion rests on that single edge.
///
/// This is single-edge what-if, precomputed: it reuses the same [`propagate`]
/// engine, ablating one edge at a time. Pure and deterministic.
fn compute_sensitivity(canon: &mut Canonical, overrides: &Overrides) {
    let authored = authored_belief(canon);
    let evs = build_evidence(canon, overrides);
    if evs.is_empty() {
        return;
    }
    let order = declaration_order(canon);
    let base = propagate(&evs, &authored, &order);

    let mut leverage: HashMap<String, f64> = HashMap::new();
    for (i, e) in evs.iter().enumerate() {
        // Recompute with exactly this one edge removed.
        let ablated: Vec<Evidence> = evs
            .iter()
            .enumerate()
            .filter(|(j, _)| *j != i)
            .map(|(_, x)| x.clone())
            .collect();
        let without = propagate(&ablated, &authored, &order);
        let with_v = base.get(&e.to).copied().unwrap_or(NEUTRAL);
        let without_v = without.get(&e.to).copied().unwrap_or(NEUTRAL);
        leverage.insert(e.id.clone(), round3(with_v - without_v));
    }

    for o in &mut canon.objects {
        if let Object::Link(l) = o {
            if let Some(lev) = leverage.get(&l.id) {
                l.leverage = Some(*lev);
            }
        }
    }
}

// --- Formulas (Phase 8) ---------------------------------------------------

/// A parsed formula awaiting evaluation.
struct PendingFormula {
    idx: usize,
    id: String,
    formula: crate::formula::Formula,
    refs: Vec<String>,
}

/// Evaluate `= expr` foci into `computed_quantity` (§4.8, Phase 8). Formulas are
/// resolved over other foci's quantities with full dimensional analysis, in
/// dependency order so a formula sees its inputs' computed values. Diagnostics
/// (never errors) report parse failures, unresolved/quantity-less references,
/// dimension mismatches, and dependency cycles. Strictly separate from authored
/// quantities — the result lands in `computed_quantity`.
fn compute_formulas(canon: &mut Canonical, overrides: &Overrides, diags: &mut Diagnostics) {
    let disabled = &overrides.disabled_nodes;
    // Parse every formula; a parse error is reported and the focus is skipped.
    let mut pending: Vec<PendingFormula> = Vec::new();
    let mut formula_ids: HashSet<String> = HashSet::new();
    for (idx, o) in canon.objects.iter().enumerate() {
        if let Object::Focus(f) = o {
            if let Some(expr) = &f.formula {
                if disabled.contains(&f.id) {
                    continue; // a muted focus (what-if) does not compute
                }
                match crate::formula::parse(expr) {
                    Ok(formula) => {
                        formula_ids.insert(f.id.clone());
                        pending.push(PendingFormula {
                            idx,
                            id: f.id.clone(),
                            formula,
                            refs: crate::formula::referenced_ids(expr),
                        });
                    }
                    Err(e) => diags.warning(0, format!("formula on `{}`: {e}", f.id)),
                }
            }
        }
    }
    if pending.is_empty() {
        return;
    }

    // Seed base values from every authored quantity; computed values join as they
    // resolve. `known` lets us distinguish an unknown id from a quantity-less one.
    let mut values: HashMap<String, (f64, Signature)> = HashMap::new();
    let mut known: HashSet<String> = HashSet::new();
    for o in &canon.objects {
        if let Object::Focus(f) = o {
            if disabled.contains(&f.id) {
                continue; // muted: absent from the value table, so refs to it fail
            }
            known.insert(f.id.clone());
            if let Some(q) = &f.quantity {
                values.insert(f.id.clone(), units::to_base(q.value, &q.unit));
            }
        }
    }

    // Dependency order over formula foci: A after B when A references formula B.
    let mut indeg: HashMap<String, usize> = pending.iter().map(|p| (p.id.clone(), 0)).collect();
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    for p in &pending {
        for r in &p.refs {
            if r != &p.id && formula_ids.contains(r) {
                adj.entry(r.clone()).or_default().push(p.id.clone());
                *indeg.get_mut(&p.id).expect("formula id has an in-degree") += 1;
            }
        }
    }
    // Declaration order for a deterministic, stable evaluation sequence.
    let decl: Vec<String> = pending.iter().map(|p| p.id.clone()).collect();
    let mut queue: VecDeque<String> = decl.iter().filter(|id| indeg[*id] == 0).cloned().collect();
    let mut eval_order: Vec<String> = Vec::new();
    let mut done: HashSet<String> = HashSet::new();
    while let Some(n) = queue.pop_front() {
        done.insert(n.clone());
        eval_order.push(n.clone());
        if let Some(nexts) = adj.get(&n) {
            for m in nexts.clone() {
                let d = indeg.get_mut(&m).expect("dependent has an in-degree");
                *d -= 1;
                if *d == 0 {
                    queue.push_back(m);
                }
            }
        }
    }
    for p in &pending {
        if !done.contains(&p.id) {
            diags.warning(
                0,
                format!("formula on `{}` is part of a dependency cycle; not computed", p.id),
            );
        }
    }

    let by_id: HashMap<&str, &PendingFormula> =
        pending.iter().map(|p| (p.id.as_str(), p)).collect();
    let mut results: Vec<(usize, Quantity)> = Vec::new();
    for id in &eval_order {
        let p = by_id[id.as_str()];
        // Resolve a reference to its base value + signature, with a precise error.
        let outcome = {
            let resolve = |rid: &str| -> Result<(f64, Signature), String> {
                if disabled.contains(rid) {
                    Err(format!("references muted `{rid}`"))
                } else if let Some(v) = values.get(rid) {
                    Ok(v.clone())
                } else if known.contains(rid) {
                    Err(format!("`{rid}` has no quantity to reference"))
                } else {
                    Err(format!("unknown reference `{rid}`"))
                }
            };
            p.formula.eval(&resolve)
        };
        match outcome {
            Ok((value, sig)) => {
                values.insert(id.clone(), (value, sig.clone())); // dependents see the base value
                // Present in a human-friendly unit (8 GB, not 8e9 B); the stored
                // dimension stays canonical, so a computed value reads like an
                // authored one (§4.7).
                let (factor, unit) = units::pick_display(&sig, value.abs());
                let q = Quantity {
                    value: round3(value / factor),
                    unit,
                    dimension: units::signature_dimension(&sig),
                    normalized: None,
                    base_unit: None,
                };
                results.push((p.idx, q));
            }
            Err(e) => diags.warning(0, format!("formula on `{id}`: {e}")),
        }
    }

    for (idx, q) in results {
        if let Object::Focus(f) = &mut canon.objects[idx] {
            f.computed_quantity = Some(q);
        }
    }
}

// --- Decision EV (Phase 9) ------------------------------------------------

/// A running expected-value accumulator for one option.
struct EvAcc {
    /// Σ probability × payoff so far, in base units.
    sum: f64,
    /// The shared payoff signature; outcomes that disagree mark the option broken.
    sig: Option<Signature>,
    /// Total probability mass placed on outcomes (a coherence check).
    prob_total: f64,
    /// The worst-case outcome payoff seen, in base units (the option's downside).
    downside: Option<f64>,
    /// Per-outcome `(outcome id, probability, payoff)` in base units, for the breakdown.
    terms: Vec<(String, f64, f64)>,
    /// Whether every probability used was authored (vs. a derived-confidence
    /// fallback) — the prob-mass lint only applies to authored probabilities.
    all_authored: bool,
    /// Set when a missing payoff/probability or a dimension clash makes the EV
    /// untrustworthy; a broken option gets no `expected_value`.
    broken: bool,
}

/// Compute decision expected values (§10.6, Phase 9) — the computational track's
/// capstone, composing quantities (§4.7), formulas (§4.8), and derived confidence
/// (§10.3). An option focus carries `leads-to` edges to outcome foci; each edge's
/// `probability` (or, failing that, the outcome's derived confidence) weights that
/// outcome's payoff — its `computed_quantity` if a formula produced one, else its
/// authored `quantity`. The option's **expected value** is the probability-weighted
/// sum, with full dimensional checking (you cannot average dollars with
/// milliseconds). A decision focus, named by `option-of` edges, then ranks its
/// options by expected value. Diagnostics — never errors — flag the gaps; derived
/// and strictly separate from authored values.
fn compute_decisions(canon: &mut Canonical, overrides: &Overrides, diags: &mut Diagnostics) {
    // Each focus's payoff and belief, read once. Payoff prefers the computed
    // quantity (a formula result) over the authored one, so formulas feed EV. A
    // muted node (what-if) is absent — its payoff and belief drop out.
    let mut payoff: HashMap<String, (f64, Signature)> = HashMap::new();
    let mut conf: HashMap<String, f64> = HashMap::new();
    for o in &canon.objects {
        match o {
            Object::Focus(f) => {
                if overrides.disabled_nodes.contains(&f.id) {
                    continue;
                }
                if let Some(q) = f.computed_quantity.as_ref().or(f.quantity.as_ref()) {
                    payoff.insert(f.id.clone(), units::to_base(q.value, &q.unit));
                }
                if let Some(c) = f.derived_confidence {
                    conf.insert(f.id.clone(), c);
                }
            }
            Object::Link(l) => {
                if let Some(c) = l.derived_confidence {
                    conf.insert(l.id.clone(), c);
                }
            }
            _ => {}
        }
    }

    // Accumulate each option's expected value over its `leads-to` outcomes, in
    // declaration order so the result is deterministic.
    let mut acc: HashMap<String, EvAcc> = HashMap::new();
    let mut option_order: Vec<String> = Vec::new();
    for o in &canon.objects {
        let Object::Link(l) = o else { continue };
        if l.relation != "leads-to" || overrides.drops(l) {
            continue; // not an EV edge, or muted in this what-if
        }
        let (option, outcome) = (l.from.clone(), l.to.clone());
        let entry = acc.entry(option.clone()).or_insert_with(|| {
            option_order.push(option.clone());
            EvAcc {
                sum: 0.0,
                sig: None,
                prob_total: 0.0,
                downside: None,
                terms: Vec::new(),
                all_authored: true,
                broken: false,
            }
        });

        // Probability: authored on the edge, else the outcome's derived belief.
        let prob = match l.probability {
            Some(p) => Some(p),
            None => {
                entry.all_authored = false;
                conf.get(&outcome).copied()
            }
        };
        let Some(prob) = prob else {
            diags.warning(0, format!(
                "`leads-to` edge `{}` has no `probability` and outcome `{outcome}` has no derived confidence; expected value of `{option}` is incomplete",
                l.id
            ));
            entry.broken = true;
            continue;
        };
        // Payoff: the outcome's computed-or-authored quantity.
        let Some(pay) = payoff.get(&outcome).cloned() else {
            diags.warning(0, format!(
                "outcome `{outcome}` has no quantity to use as a payoff; expected value of `{option}` is incomplete"
            ));
            entry.broken = true;
            continue;
        };
        // All payoffs in one EV must share a dimension.
        match &entry.sig {
            None => entry.sig = Some(pay.1.clone()),
            Some(s) if *s != pay.1 => {
                diags.warning(0, format!(
                    "option `{option}` mixes outcome dimensions ({} and {}); expected value not computed",
                    units::signature_dimension(s),
                    units::signature_dimension(&pay.1)
                ));
                entry.broken = true;
            }
            _ => {}
        }
        entry.sum += prob * pay.0;
        entry.prob_total += prob;
        entry.downside = Some(entry.downside.map_or(pay.0, |d| d.min(pay.0)));
        entry.terms.push((outcome, prob, pay.0)); // payoff in base units
    }

    // Finalize each option's EV; flag an impossible (>1) authored probability mass.
    // `option_ev` keeps base value + signature + downside for the decision ranking;
    // `ev_results` holds the per-option `ExpectedValue`, humanized for display.
    let mut option_ev: HashMap<String, (f64, Signature, f64)> = HashMap::new();
    let mut ev_results: Vec<(String, ExpectedValue)> = Vec::new();
    for opt in &option_order {
        let a = &acc[opt];
        if a.broken {
            continue;
        }
        let Some(sig) = a.sig.clone() else { continue };
        if a.all_authored && a.prob_total > 1.001 {
            diags.warning(0, format!(
                "option `{opt}` outcome probabilities sum to {:.3} (> 1)",
                a.prob_total
            ));
        }
        let downside_base = a.downside.unwrap_or(0.0);
        option_ev.insert(opt.clone(), (a.sum, sig.clone(), downside_base));
        // Render in a unit suited to the option's largest magnitude.
        let mag = a.terms.iter().map(|(_, _, p)| p.abs()).fold(a.sum.abs(), f64::max);
        let (factor, unit) = units::pick_display(&sig, mag);
        let terms = a
            .terms
            .iter()
            .map(|(out, p, pay)| EvTerm {
                outcome: out.clone(),
                probability: round3(*p),
                payoff: round3(pay / factor),
                contribution: round3(p * pay / factor),
            })
            .collect();
        ev_results.push((
            opt.clone(),
            ExpectedValue {
                value: round3(a.sum / factor),
                unit,
                dimension: units::signature_dimension(&sig),
                probability_mass: round3(a.prob_total),
                downside: round3(downside_base / factor),
                terms,
            },
        ));
    }

    // Group options under their decisions via `option-of` edges, in declaration
    // order, then order each decision's options by expected value (highest first).
    let mut options_of: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut decision_order: Vec<String> = Vec::new();
    for o in &canon.objects {
        let Object::Link(l) = o else { continue };
        if l.relation != "option-of" || overrides.drops(l) {
            continue;
        }
        options_of
            .entry(l.to.clone())
            .or_insert_with(|| {
                decision_order.push(l.to.clone());
                Vec::new()
            })
            .push(l.from.clone());
    }

    let mut decisions: HashMap<String, DecisionEV> = HashMap::new();
    for dec in &decision_order {
        // Options of this decision that have a (non-broken) expected value:
        // `(id, ev_value, signature, downside)`, all in base units.
        let mut entries: Vec<(String, f64, Signature, f64)> = options_of[dec]
            .iter()
            .filter_map(|opt| option_ev.get(opt).map(|(v, s, d)| (opt.clone(), *v, s.clone(), *d)))
            .collect();
        if entries.is_empty() {
            continue;
        }
        // Options must be comparable — same dimension — to be ranked together.
        let first = entries[0].2.clone();
        if entries.iter().any(|(_, _, s, _)| *s != first) {
            diags.warning(0, format!(
                "decision `{dec}` compares options of different dimensions; not ranked"
            ));
            continue;
        }
        // Highest EV first; a stable sort keeps `option-of` order on ties.
        entries.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        // One display unit across the ranking, from the largest option magnitude.
        let mag = entries.iter().map(|(_, v, _, _)| v.abs()).fold(0.0_f64, f64::max);
        let (factor, unit) = units::pick_display(&first, mag);
        let ranked: Vec<OptionEV> = entries
            .iter()
            .map(|(opt, v, _, d)| OptionEV {
                option: opt.clone(),
                value: round3(v / factor),
                unit: unit.clone(),
                downside: round3(d / factor),
            })
            .collect();
        // The mirror reports the EVs ordered high-to-low; it does not crown a
        // winner or quantify a margin — the choice stays with the reader.
        decisions.insert(dec.clone(), DecisionEV { ranked });
    }

    // Write the derived facts back: EV on each option, the ranking on each decision.
    let ev_map: HashMap<String, ExpectedValue> = ev_results.into_iter().collect();
    for o in &mut canon.objects {
        if let Object::Focus(f) = o {
            if let Some(ev) = ev_map.get(&f.id) {
                f.expected_value = Some(ev.clone());
            }
            if let Some(d) = decisions.get(&f.id) {
                f.decision = Some(d.clone());
            }
        }
    }
}

/// Confidence of one claim from its incoming evidence: a logistic of the
/// gain-scaled sum of `polarity × weight × believedness(source)`.
fn node_confidence(
    idxs: &[usize],
    evs: &[Evidence],
    derived: &HashMap<String, f64>,
    authored: &HashMap<String, f64>,
) -> f64 {
    let mut sum = 0.0;
    for &i in idxs {
        let e = &evs[i];
        let belief = believedness(&e.from, derived, authored);
        sum += e.polarity * e.weight * belief;
    }
    logistic(EVIDENCE_GAIN * sum)
}

/// How much a source is believed: its own derived confidence if it has one
/// (transitive propagation), else the authored confidence on it, else 1.0 —
/// an unqualified assertion counts as given.
fn believedness(
    id: &str,
    derived: &HashMap<String, f64>,
    authored: &HashMap<String, f64>,
) -> f64 {
    derived
        .get(id)
        .or_else(|| authored.get(id))
        .copied()
        .unwrap_or(1.0)
}

/// The authored believedness of each node: the mean midpoint of the
/// **non-superseded** stances that carry a confidence and target it. A
/// superseded belief (Phase 3) no longer counts as evidence.
fn authored_belief(canon: &Canonical) -> HashMap<String, f64> {
    let mut sums: HashMap<String, (f64, u32)> = HashMap::new();
    for o in &canon.objects {
        if let Object::Stance(s) = o {
            if s.superseded_by.is_some() {
                continue;
            }
            if let Some(c) = s.confidence.as_ref().and_then(conf_midpoint) {
                let entry = sums.entry(s.target.clone()).or_insert((0.0, 0));
                entry.0 += c;
                entry.1 += 1;
            }
        }
    }
    sums.into_iter()
        .map(|(k, (sum, n))| (k, sum / n as f64))
        .collect()
}

/// The evidential polarity of a relation, or `None` if it is not evidence.
fn evidence_polarity(relation: &str) -> Option<f64> {
    match relation {
        "supports" => Some(1.0),
        "opposes" | "undercuts" => Some(-1.0),
        _ => None,
    }
}

/// A confidence value as a single number: a scalar as-is, a range at its
/// midpoint, `?`/other as no number.
fn conf_midpoint(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => Some(*n),
        Value::Range(lo, hi) => Some((lo + hi) / 2.0),
        _ => None,
    }
}

fn logistic(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

// --- Argument status (Phase 5) --------------------------------------------

/// The grounded label of an argument (Dung 1995).
#[derive(Clone, Copy, PartialEq)]
enum Label {
    Undecided,
    In,
    Out,
}

/// Relations that constitute an attack on their target. `mitigates` is a defense
/// (Phase 5 review): `action mitigates risk` attacks the risk, so mitigating a
/// risk that attacks an option restores that option — handled uniformly by the
/// grounded labelling, since "defend X" is just "attack X's attacker".
fn is_attack(relation: &str) -> bool {
    matches!(relation, "undercuts" | "opposes" | "rejects" | "mitigates")
}

/// Label every claim that takes part in the attack graph with its grounded
/// argumentation status (Dung 1995): a node is `in` (accepted) iff *every*
/// attacker is `out`, `out` (defeated) iff *some* attacker is `in`, else
/// `undecided` (e.g. a mutual attack). Computed to the least fixpoint, so the
/// labelling is unique and deterministic. Where `derived_confidence` asks "how
/// strong?", this asks "does it survive?".
fn compute_status(canon: &mut Canonical, overrides: &Overrides) {
    let mut attackers: HashMap<String, Vec<String>> = HashMap::new();
    let mut participates: HashSet<String> = HashSet::new();
    for o in &canon.objects {
        if let Object::Link(l) = o {
            if overrides.drops(l) {
                continue;
            }
            if is_attack(&l.relation) {
                attackers.entry(l.to.clone()).or_default().push(l.from.clone());
                participates.insert(l.from.clone());
                participates.insert(l.to.clone());
            }
        }
    }
    if participates.is_empty() {
        return;
    }

    // Declaration order over the contested nodes (deterministic).
    let order: Vec<String> = canon
        .objects
        .iter()
        .map(obj_id)
        .filter(|id| participates.contains(*id))
        .map(str::to_string)
        .collect();

    let mut label: HashMap<String, Label> =
        order.iter().map(|n| (n.clone(), Label::Undecided)).collect();
    let no_attackers: Vec<String> = Vec::new();
    loop {
        let mut changed = false;
        // Accept any node all of whose attackers are already defeated.
        for n in &order {
            if label[n] != Label::Undecided {
                continue;
            }
            let atk = attackers.get(n).unwrap_or(&no_attackers);
            if atk.iter().all(|a| label.get(a) == Some(&Label::Out)) {
                label.insert(n.clone(), Label::In);
                changed = true;
            }
        }
        // Defeat any node with an accepted attacker.
        for n in &order {
            if label[n] != Label::Undecided {
                continue;
            }
            let atk = attackers.get(n).unwrap_or(&no_attackers);
            if atk.iter().any(|a| label.get(a) == Some(&Label::In)) {
                label.insert(n.clone(), Label::Out);
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    let name = |l: Label| match l {
        Label::In => "in",
        Label::Out => "out",
        Label::Undecided => "undecided",
    };
    for o in &mut canon.objects {
        match o {
            Object::Focus(f) => {
                if let Some(l) = label.get(&f.id) {
                    f.argument_status = Some(name(*l).to_string());
                }
            }
            Object::Link(l2) => {
                if let Some(l) = label.get(&l2.id) {
                    l2.argument_status = Some(name(*l).to_string());
                }
            }
            _ => {}
        }
    }
}

// --- Mirror conflict report (§10.7) ---------------------------------------

/// The mirror's second reading: surface where the engine's computed view of the
/// graph disagrees with what the author asserted. v1 ships one conflict type —
/// `confidence-vs-status` — comparing an authored stance's confidence against the
/// grounded `argument_status` of its target. It ships the conflict, never a
/// verdict: a high credence in a *defeated* node (or a low one in an *accepted*
/// node) is flagged for the author to resolve, not auto-corrected.
fn compute_conflicts(canon: &Canonical) -> Audit {
    // The grounded status of every focus/link that takes part in the attack graph.
    let mut status: HashMap<&str, &str> = HashMap::new();
    for o in &canon.objects {
        match o {
            Object::Focus(f) => {
                if let Some(s) = &f.argument_status {
                    status.insert(f.id.as_str(), s.as_str());
                }
            }
            Object::Link(l) => {
                if let Some(s) = &l.argument_status {
                    status.insert(l.id.as_str(), s.as_str());
                }
            }
            _ => {}
        }
    }

    let mut conflicts = Vec::new();
    for o in &canon.objects {
        let Object::Stance(st) = o else { continue };
        let Some(conf) = st.confidence.as_ref().and_then(conf_midpoint) else {
            continue;
        };
        let Some(&target_status) = status.get(st.target.as_str()) else {
            continue;
        };
        // High confidence in a claim the structure defeats — the flagship mirror.
        if target_status == "out" && conf >= 0.66 {
            conflicts.push(Conflict {
                kind: "confidence-vs-status".to_string(),
                severity: "error".to_string(),
                subjects: vec![st.id.clone(), st.target.clone()],
                message: format!(
                    "`{}` asserts confidence {:.2} in `{}`, but your own structure defeats it (argument status: out)",
                    st.agent, conf, st.target
                ),
            });
        // Low confidence in a claim that survives every attack — the inverse tell.
        } else if target_status == "in" && conf <= 0.34 {
            conflicts.push(Conflict {
                kind: "confidence-vs-status".to_string(),
                severity: "warning".to_string(),
                subjects: vec![st.id.clone(), st.target.clone()],
                message: format!(
                    "`{}` asserts confidence {:.2} in `{}`, but it survives every attack (argument status: in)",
                    st.agent, conf, st.target
                ),
            });
        }
    }
    Audit { conflicts }
}

// --- Time parsing ---------------------------------------------------------

/// A timezone-normalized sort key for a loose ISO-8601 date/time string —
/// whole seconds from the Unix epoch (signed; years before 1970 are negative).
///
/// Components are read left to right (`YYYY`, then optional `-MM`, `-DD`, `Thh`,
/// `:mm`, `:ss`); a missing tail resolves to the start of its range (month/day
/// → 1, time → 0), so a less precise stamp sorts at the first instant it could
/// denote. A trailing zone designator — `Z`/`z`, `±hh`, `±hhmm`, or `±hh:mm` —
/// is normalized to UTC, so `…T00:00+05:00` correctly sorts *before* `…T00:00Z`;
/// a stamp with no zone is read as written. `None` if there is no 4-digit year.
fn time_key(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    let digit = |i: usize| -> Option<i64> {
        b.get(i)
            .filter(|c| c.is_ascii_digit())
            .map(|c| (c - b'0') as i64)
    };
    let two = |i: usize| -> i64 { digit(i).unwrap_or(0) * 10 + digit(i + 1).unwrap_or(0) };
    let year = digit(0)? * 1000 + digit(1)? * 100 + digit(2)? * 10 + digit(3)?;
    // A missing month/day means "the whole month/year"; resolve to its first day
    // so the key lands at the start of the interval the stamp denotes.
    let month = if b.get(4) == Some(&b'-') { two(5).clamp(1, 12) } else { 1 };
    let day = if b.get(7) == Some(&b'-') { two(8).clamp(1, 31) } else { 1 };
    let hour = if b.get(10) == Some(&b'T') { two(11) } else { 0 };
    let min = if b.get(13) == Some(&b':') { two(14) } else { 0 };
    let sec = if b.get(16) == Some(&b':') { two(17) } else { 0 };
    // Seconds since 1970-01-01T00:00:00, then shift the written instant back to
    // UTC: a clock reading stamped `+05:00` happened five hours earlier in UTC.
    let secs = days_from_civil(year, month, day) * 86_400 + hour * 3_600 + min * 60 + sec;
    Some(secs - zone_offset_secs(s).unwrap_or(0))
}

/// Days from 1970-01-01 to `y-m-d` (negative before the epoch). Howard
/// Hinnant's branch-free civil algorithm, exact across the proleptic Gregorian
/// calendar — this is what lets a zone offset cross a day, month, or year
/// boundary correctly (packed-decimal arithmetic could not borrow across them).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400; // year of era, [0, 399]
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // day of era, [0, 146096]
    era * 146_097 + doe - 719_468
}

/// Parse a trailing ISO-8601 zone designator into seconds east of UTC, or
/// `None` when the stamp carries no zone (a naive local time, left as written).
/// Accepts `Z`/`z` (→ 0), `±hh`, `±hhmm`, and `±hh:mm`.
fn zone_offset_secs(s: &str) -> Option<i64> {
    if matches!(s.as_bytes().last(), Some(b'Z' | b'z')) {
        return Some(0);
    }
    // A zone sign only appears in the time part, so anchor the search after the
    // `T` — otherwise the date's own `-` separators would be mistaken for it.
    let t = s.find('T')?;
    let rel = s[t..].rfind(['+', '-'])?;
    let sign = if s.as_bytes()[t + rel] == b'-' { -1 } else { 1 };
    let digits: Vec<i64> = s[t + rel + 1..]
        .bytes()
        .filter(|c| c.is_ascii_digit())
        .map(|c| (c - b'0') as i64)
        .collect();
    if digits.len() < 2 {
        return None;
    }
    let hh = digits[0] * 10 + digits[1];
    let mm = if digits.len() >= 4 { digits[2] * 10 + digits[3] } else { 0 };
    Some(sign * (hh * 3_600 + mm * 60))
}

// --- Object helpers -------------------------------------------------------

fn obj_id(o: &Object) -> &str {
    match o {
        Object::Focus(x) => &x.id,
        Object::Question(x) => &x.id,
        Object::Link(x) => &x.id,
        Object::Stance(x) => &x.id,
        Object::Scope(x) => &x.id,
        Object::Act(x) => &x.id,
        Object::Profile(x) => &x.name,
    }
}

fn obj_fields(o: &Object) -> Option<&Fields> {
    match o {
        Object::Focus(x) => Some(&x.fields),
        Object::Question(x) => Some(&x.fields),
        Object::Link(x) => Some(&x.fields),
        Object::Stance(x) => Some(&x.fields),
        Object::Scope(x) => Some(&x.fields),
        Object::Act(x) => Some(&x.fields),
        Object::Profile(_) => None,
    }
}

fn set_superseded(o: &mut Object, by: String) {
    match o {
        Object::Focus(x) => x.superseded_by = Some(by),
        Object::Question(x) => x.superseded_by = Some(by),
        Object::Link(x) => x.superseded_by = Some(by),
        Object::Stance(x) => x.superseded_by = Some(by),
        Object::Scope(_) | Object::Act(_) | Object::Profile(_) => {}
    }
}

/// The instant a belief was asserted: its `asserted-at`, else `observed-at`.
fn assertion_time(o: &Object) -> Option<String> {
    let fields = obj_fields(o)?;
    field_time(fields, "asserted-at").or_else(|| field_time(fields, "observed-at"))
}

fn field_time(fields: &Fields, name: &str) -> Option<String> {
    fields.0.iter().find(|(k, _)| k == name).and_then(|(_, v)| match v {
        Value::Time(t) => Some(t.clone()),
        _ => None,
    })
}

#[cfg(test)]
mod tests {
    use super::time_key;

    #[test]
    fn time_keys_order_correctly() {
        // Progressive precision plus an explicit UTC stamp; each entry is a
        // strictly later instant than the one before it.
        let cases = [
            "2026",
            "2026-06",
            "2026-06-09",
            "2026-06-09T09:20",
            "2026-06-09T09:20:01",
            "2026-06-14T14:05+00:00",
            "2027-01-01",
        ];
        let keys: Vec<i64> = cases.iter().map(|s| time_key(s).unwrap()).collect();
        for w in keys.windows(2) {
            assert!(w[0] < w[1], "expected strictly increasing keys: {keys:?}");
        }
    }

    #[test]
    fn time_key_normalizes_zone_offsets() {
        // Same wall clock, three zones. `+05:00` is the earliest instant in UTC,
        // `-05:00` the latest — the opposite of a naive wall-clock comparison.
        let east = time_key("2026-01-01T00:00+05:00").unwrap();
        let utc = time_key("2026-01-01T00:00Z").unwrap();
        let west = time_key("2026-01-01T00:00-05:00").unwrap();
        assert!(east < utc && utc < west, "east {east} utc {utc} west {west}");

        // The offset must carry across a day boundary: 02:00+05:00 is 21:00 the
        // previous day in UTC, so it precedes 23:00Z on that earlier day.
        let crosses = time_key("2026-06-14T02:00+05:00").unwrap();
        let prev_eve = time_key("2026-06-13T23:00Z").unwrap();
        assert!(crosses < prev_eve, "crosses {crosses} prev_eve {prev_eve}");

        // `Z`, `+00:00`, and the compact `+0000` all denote UTC.
        assert_eq!(
            time_key("2026-01-01T00:00Z"),
            time_key("2026-01-01T00:00+00:00")
        );
        assert_eq!(
            time_key("2026-01-01T00:00Z"),
            time_key("2026-01-01T00:00+0000")
        );
    }

    #[test]
    fn non_dates_have_no_key() {
        assert!(time_key("open").is_none());
        assert!(time_key("").is_none());
    }
}
