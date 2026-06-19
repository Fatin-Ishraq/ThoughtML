//! Normalizing the surface AST into canonical objects (spec §8).
//!
//! Field-routing rules (the spec only fully specifies a handful of cases, so
//! the rest follow these documented conventions):
//!
//! * For focus-creating postures, body text annotates the created focus; for
//!   non-creating postures (doubts/accepts/asks/rejects/revises) it annotates
//!   the stance.
//! * A `note` field always rides on the stance, regardless of posture, so even
//!   focus-creating postures (holds/chooses/…) can carry rationale on the
//!   stance node itself (Tier-1).
//! * `confidence` becomes `stance.confidence`.
//! * `until REF [STATUS]` expands to a `REF blocks TARGET` link, with the
//!   optional status preserved as a field on that link (§8.4).
//! * All other fields attach to the stance.
//!
//! Core headers (`focus`/`link`/`stance`/`question`/`scope`) are written
//! directly and are mapped to objects with minimal processing — they are
//! already canonical (§3.2), so no action-style sugar (e.g. until→link) is
//! applied to them.

use crate::canonical::*;
use crate::diagnostics::Diagnostics;
use crate::ids::IdGen;
use crate::lex::{parse_number, Value};
use crate::surface::{ActionForm, Block, Field, Header, Record, SurfaceFile};
use crate::units;
use crate::vocab;
use std::collections::{HashMap, HashSet};

/// Postures (readable actions) that introduce a new focus for their target.
const FOCUS_CREATING: &[&str] = &["noticed", "considers", "holds", "chooses", "remembers"];

/// The focus kind a focus-creating posture implies (v0.2). `infers` is handled
/// separately (its target is a derived `claim`).
fn posture_kind(posture: &str) -> Option<&'static str> {
    match posture {
        "noticed" => Some("observation"),
        "considers" => Some("option"),
        "holds" | "chooses" => Some("decision"),
        "remembers" => Some("memory"),
        _ => None,
    }
}

/// Parse a `quantity` field's args into `(value, unit)` — `200 ms`, `1.5 GB`, a
/// percent `30 %`, or a fused `200ms`. `None` if there is no leading number with
/// a trailing unit (Phase 7).
fn parse_quantity(args: &[String]) -> Option<(f64, String)> {
    match args {
        [a, b] => Some((parse_number(a)?, b.clone())),
        [a] => split_num_unit(a),
        _ => None,
    }
}

/// Split a fused `123unit` token (e.g. `200ms`, `1.5GB`, `30%`) into its number
/// and unit, where the unit begins at the first non-numeric character.
fn split_num_unit(s: &str) -> Option<(f64, String)> {
    let i = s.find(|c: char| c.is_ascii_alphabetic() || c == '%' || c == '/')?;
    if i == 0 {
        return None;
    }
    let num = parse_number(&s[..i])?;
    Some((num, s[i..].to_string()))
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

pub fn desugar(file: &SurfaceFile, emit_acts: bool, diags: &mut Diagnostics) -> Canonical {
    // Fold any `profile` declarations into the allowed vocabulary, then lint the
    // whole surface tree against it at exact source lines (Phase 5) — so a
    // profile-declared kind/relation/field/posture is accepted, before desugaring.
    let allowed = AllowedVocab::from_records(&file.records);
    lint_vocabulary(&file.records, &allowed, diags);

    let mut d = Desugarer::new(diags, emit_acts);
    for rec in &file.records {
        d.record(rec);
    }
    d.infer_decision_kinds();
    // `timeline` and any `superseded_by` links are filled in by the derive pass.
    Canonical {
        objects: d.objects,
        timeline: None,
        audit: None,
    }
}

/// Extract the canonical id of any object (used to record `Act.expands_to`).
fn object_id(o: &Object) -> String {
    match o {
        Object::Focus(x) => x.id.clone(),
        Object::Question(x) => x.id.clone(),
        Object::Link(x) => x.id.clone(),
        Object::Stance(x) => x.id.clone(),
        Object::Scope(x) => x.id.clone(),
        Object::Act(x) => x.id.clone(),
        Object::Profile(x) => x.name.clone(),
    }
}

/// The operand list of a readable action, as canonical values (for `Act.args`).
fn action_args(form: &ActionForm) -> Vec<Value> {
    match form {
        ActionForm::Single { target } => vec![Value::Ref(target.clone())],
        ActionForm::Suspects {
            from, relation, to, ..
        } => vec![
            Value::Ref(from.clone()),
            Value::Symbol(relation.clone()),
            Value::Ref(to.clone()),
        ],
        ActionForm::Infers { target, from } => {
            let mut args = vec![Value::Ref(target.clone()), Value::Symbol("from".to_string())];
            args.extend(from.iter().map(|s| Value::Ref(s.clone())));
            args
        }
    }
}

/// Fields a scope passes down to the objects nested within it (member-wins),
/// limited to provenance/temporal context that genuinely cascades (§4.5).
const INHERITABLE: &[&str] = &["asserted-at", "observed-at", "source", "valid-during"];

/// The author-declared id of a record whose desugaring may merge into an
/// existing object (a focus) instead of pushing a fresh one, so a scope can
/// still record it as a member. `None` for records that always push.
fn declared_id(header: &Header) -> Option<String> {
    match header {
        Header::Scope { id } | Header::Question { id } | Header::Focus { id } => Some(id.clone()),
        _ => None,
    }
}

/// Mutable access to an object's free-form fields, for cascading inherited
/// scope defaults (§4.5).
fn object_fields_mut(o: &mut Object) -> Option<&mut Fields> {
    match o {
        Object::Focus(x) => Some(&mut x.fields),
        Object::Question(x) => Some(&mut x.fields),
        Object::Link(x) => Some(&mut x.fields),
        Object::Stance(x) => Some(&mut x.fields),
        Object::Scope(x) => Some(&mut x.fields),
        Object::Act(x) => Some(&mut x.fields),
        Object::Profile(_) => None,
    }
}

// --- Profiles & the vocabulary lint (Phase 5) -----------------------------

/// The vocabulary a document accepts: the core sets (§12) plus anything its
/// `profile` declarations add. Drives the post-parse vocabulary lint.
struct AllowedVocab {
    kinds: HashSet<String>,
    relations: HashSet<String>,
    fields: HashSet<String>,
    postures: HashSet<String>,
}

impl AllowedVocab {
    fn from_records(records: &[Record]) -> Self {
        let set = |xs: &[&str]| xs.iter().map(|s| s.to_string()).collect::<HashSet<_>>();
        let mut v = AllowedVocab {
            kinds: set(vocab::KINDS),
            relations: set(vocab::RELATIONS),
            fields: set(vocab::FIELDS),
            postures: set(vocab::POSTURES),
        };
        v.extend_from(records);
        v
    }

    /// Fold every `profile` record's declared lists into the allowed sets.
    fn extend_from(&mut self, records: &[Record]) {
        for rec in records {
            if let Header::Profile { .. } = rec.header {
                for f in &rec.block.fields {
                    let target = match f.name.as_str() {
                        "kinds" => &mut self.kinds,
                        "relations" => &mut self.relations,
                        "fields" => &mut self.fields,
                        "postures" => &mut self.postures,
                        _ => continue,
                    };
                    target.extend(value_list(&f.value));
                }
            }
            self.extend_from(&rec.children);
        }
    }
}

/// The members of a list-valued field (`kinds risk, mitigation`), tolerating a
/// single bare value (which lexes as a ref/symbol rather than a list).
fn value_list(v: &Value) -> Vec<String> {
    match v {
        Value::List(items) => items.clone(),
        Value::Ref(s) | Value::Symbol(s) | Value::Text(s) => vec![s.clone()],
        _ => Vec::new(),
    }
}

/// Warn at exact source lines for any kind / relation / field / posture outside
/// the allowed vocabulary. Centralizes what the parser and `split_kind` used to
/// emit inline, so a `profile` declaration (folded in first) can suppress them.
fn lint_vocabulary(records: &[Record], allowed: &AllowedVocab, diags: &mut Diagnostics) {
    for rec in records {
        // A profile's own block holds its declaration lists, not document fields.
        if !matches!(rec.header, Header::Profile { .. }) {
            if let Header::Stance { posture, .. } = &rec.header {
                if !allowed.postures.contains(posture.as_str()) {
                    diags.warning(rec.line, format!("unknown posture `{posture}`"));
                }
            }
            let relation = match &rec.header {
                Header::Link { relation, .. } => Some(relation),
                Header::Action {
                    form: ActionForm::Suspects { relation, .. },
                    ..
                } => Some(relation),
                _ => None,
            };
            if let Some(r) = relation {
                if !allowed.relations.contains(r.as_str()) {
                    diags.warning(rec.line, format!("unknown relation `{r}`"));
                }
            }
            for f in &rec.block.fields {
                if f.name == "kind" {
                    if let Some(k) = f.first_arg() {
                        if !allowed.kinds.contains(k) {
                            diags.warning(f.line, format!("unknown focus kind `{k}`"));
                        }
                    }
                } else if !f.known && !allowed.fields.contains(f.name.as_str()) {
                    diags.warning(f.line, format!("unknown field `{}`", f.name));
                }
            }
        }
        lint_vocabulary(&rec.children, allowed, diags);
    }
}

struct Desugarer<'a> {
    objects: Vec<Object>,
    idgen: IdGen,
    /// Maps a focus id to its index in `objects` for dedup/merge.
    focus_index: HashMap<String, usize>,
    /// Foci whose `kind` was set by an explicit `kind` field (authoritative).
    explicit_kind: HashSet<String>,
    /// Emit `Act` provenance objects for readable actions (§4.6).
    emit_acts: bool,
    diags: &'a mut Diagnostics,
}

impl<'a> Desugarer<'a> {
    fn new(diags: &'a mut Diagnostics, emit_acts: bool) -> Self {
        Desugarer {
            objects: Vec::new(),
            idgen: IdGen::new(),
            focus_index: HashMap::new(),
            explicit_kind: HashSet::new(),
            emit_acts,
            diags,
        }
    }

    fn record(&mut self, rec: &Record) {
        match &rec.header {
            Header::Scope { id } => self.scope(rec, id),
            Header::Profile { name } => self.profile(rec, name),
            // Imports are resolved by `parse_project`; a no-op in single-doc desugar.
            Header::Import { .. } => {}
            Header::Question { id } => self.question(rec, id),
            Header::Focus { id } => {
                let (kind, mut fields) = self.split_kind(&rec.block);
                let explicit = kind.is_some();
                let quantity = self.build_quantity(&rec.block, rec.line);
                fields.0.retain(|(k, _)| k != "quantity");
                self.ensure_focus(
                    id,
                    kind,
                    explicit,
                    quantity,
                    rec.block.formula.clone(),
                    rec.block.body.clone(),
                    fields,
                );
            }
            Header::Link {
                alias,
                from,
                relation,
                to,
                weight,
            } => self.core_link(rec, alias.as_deref(), from, relation, to, *weight),
            Header::Stance {
                alias,
                agent,
                posture,
                target,
            } => self.core_stance(rec, alias.as_deref(), agent, posture, target),
            Header::Action {
                agent,
                posture,
                form,
            } => {
                let start = self.objects.len();
                self.action(rec, agent, posture, form);
                if self.emit_acts {
                    self.emit_act(agent, posture, form, start);
                }
            }
        }

        // Recurse into nested children. A `scope` consumes its own children (to
        // record membership, Phase 5); for any other record nested headers are
        // unexpected — warn, but still desugar them at the top level so nothing
        // is lost.
        if !matches!(rec.header, Header::Scope { .. }) && !rec.children.is_empty() {
            self.diags.warning(
                rec.line,
                "only a scope may contain nested objects; desugaring them at the top level",
            );
            for child in &rec.children {
                self.record(child);
            }
        }
    }

    /// Record an authored action as an `Act` (§4.6), capturing the canonical
    /// objects it produced in `expands_to`. Opt-in (default off) so the base
    /// canonical output stays stable.
    fn emit_act(&mut self, agent: &str, posture: &str, form: &ActionForm, start: usize) {
        let expands_to: Vec<String> = self.objects[start..].iter().map(object_id).collect();
        let id = self.idgen.generate(&format!("{agent}-{posture}-act"));
        self.objects.push(Object::Act(Act {
            id,
            agent: Some(agent.to_string()),
            verb: posture.to_string(),
            args: action_args(form),
            expands_to,
            fields: Fields::new(),
        }));
    }

    // --- Core headers (already canonical) --------------------------------

    fn scope(&mut self, rec: &Record, id: &str) {
        self.reserve_explicit(id, rec.line);
        let fields = self.collect_fields(&rec.block);
        // The provenance/temporal subset this scope cascades onto its members.
        let defaults: Vec<(String, Value)> = fields
            .0
            .iter()
            .filter(|(k, _)| INHERITABLE.contains(&k.as_str()))
            .cloned()
            .collect();

        let scope_idx = self.objects.len();
        self.objects.push(Object::Scope(Scope {
            id: id.to_string(),
            includes: Vec::new(),
            fields,
        }));

        // Desugar each nested member, capturing its primary canonical id: the
        // first object the child produces (a focus / question / link / stance /
        // sub-scope, or the focus a readable action creates). A merge that pushes
        // nothing falls back to the child's declared id.
        let subtree_start = self.objects.len();
        let mut includes = Vec::new();
        for child in &rec.children {
            let start = self.objects.len();
            self.record(child);
            let member = if self.objects.len() > start {
                Some(object_id(&self.objects[start]))
            } else {
                declared_id(&child.header)
            };
            if let Some(m) = member {
                includes.push(m);
            }
        }

        // Cascade inheritable defaults onto everything in the subtree, member-wins
        // (add only if absent). Innermost scopes ran first in this depth-first
        // walk, so an inner default already fills the slot and wins over an outer.
        if !defaults.is_empty() {
            for obj in &mut self.objects[subtree_start..] {
                if let Some(f) = object_fields_mut(obj) {
                    for (k, v) in &defaults {
                        if !f.0.iter().any(|(ek, _)| ek == k) {
                            f.0.push((k.clone(), v.clone()));
                        }
                    }
                }
            }
        }

        if let Object::Scope(s) = &mut self.objects[scope_idx] {
            s.includes = includes;
        }
    }

    /// A `profile` declaration: collect its custom-vocabulary lists into an
    /// authored `Object::Profile`. The same lists are folded into `AllowedVocab`
    /// before desugaring, so the rest of the document validates against them.
    fn profile(&mut self, rec: &Record, name: &str) {
        let mut p = Profile {
            name: name.to_string(),
            kinds: Vec::new(),
            relations: Vec::new(),
            fields: Vec::new(),
            postures: Vec::new(),
        };
        for f in &rec.block.fields {
            let target = match f.name.as_str() {
                "kinds" => &mut p.kinds,
                "relations" => &mut p.relations,
                "fields" => &mut p.fields,
                "postures" => &mut p.postures,
                _ => continue,
            };
            target.extend(value_list(&f.value));
        }
        self.objects.push(Object::Profile(p));
    }

    fn question(&mut self, rec: &Record, id: &str) {
        self.reserve_explicit(id, rec.line);
        let mut expects = None;
        let mut status = None;
        let mut asks_about: Vec<String> = Vec::new();
        let mut fields = Fields::new();
        for f in &rec.block.fields {
            match f.name.as_str() {
                "expects" => {
                    if expects.is_some() {
                        self.diags
                            .warning(f.line, "duplicate `expects` field; using the last");
                    }
                    expects = f.first_arg().map(str::to_string);
                }
                "status" => {
                    if status.is_some() {
                        self.diags
                            .warning(f.line, "duplicate `status` field; using the last");
                    }
                    status = f.first_arg().map(str::to_string);
                }
                // `about a, b` records what the question is about (§13 ASKS_ABOUT).
                "about" => match &f.value {
                    Value::List(items) => asks_about.extend(items.iter().cloned()),
                    Value::Ref(r) => asks_about.push(r.clone()),
                    _ => self
                        .diags
                        .warning(f.line, "`about` expects one or more ids"),
                },
                _ => fields.push(f.name.clone(), f.value.clone()),
            }
        }
        if rec.block.body.is_none() && expects.is_none() {
            self.diags.warning(
                rec.line,
                "question should include body text or an `expects` field",
            );
        }
        self.objects.push(Object::Question(Question {
            id: id.to_string(),
            body: rec.block.body.clone(),
            asks_about,
            expects,
            status,
            fields,
            superseded_by: None,
        }));
    }

    fn core_link(
        &mut self,
        rec: &Record,
        alias: Option<&str>,
        from: &str,
        relation: &str,
        to: &str,
        header_weight: Option<f64>,
    ) {
        let id = match alias {
            Some(a) => {
                self.reserve_explicit(a, rec.line);
                a.to_string()
            }
            None => self.idgen.link_id(from, relation, to),
        };
        // An explicit `weight` field overrides a `strongly`/`weakly` adverb; a
        // `probability` (Phase 9) is the outcome likelihood on a `leads-to` edge.
        let (field_weight, probability, fields) = self.split_link_scalars(&rec.block, rec.line);
        let mut weight = field_weight.or(header_weight);
        if probability.is_some() && relation != "leads-to" {
            self.diags.warning(
                rec.line,
                format!("`probability` on a `{relation}` link is ignored; it only weights `leads-to` edges (§10.6)"),
            );
        }
        // On a `leads-to` edge, likelihood is carried by `probability`, not weight.
        if weight.is_some() && relation == "leads-to" {
            self.diags.warning(
                rec.line,
                "a `weight` / strength adverb on a `leads-to` link is ignored; use `probability` (§10.6)",
            );
            weight = None;
        }
        self.objects.push(Object::Link(Link {
            id,
            from: from.to_string(),
            relation: relation.to_string(),
            to: to.to_string(),
            weight,
            probability,
            body: rec.block.body.clone(),
            fields,
            superseded_by: None,
            derived_confidence: None,
            leverage: None,
            argument_status: None,
        }));
    }

    fn core_stance(
        &mut self,
        rec: &Record,
        alias: Option<&str>,
        agent: &str,
        posture: &str,
        target: &str,
    ) {
        let id = match alias {
            Some(a) => {
                self.reserve_explicit(a, rec.line);
                a.to_string()
            }
            None => self.idgen.stance_id(agent, posture, target),
        };
        let (confidence, fields) = self.split_confidence(&rec.block, rec.line);
        self.objects.push(Object::Stance(Stance {
            id,
            agent: agent.to_string(),
            posture: posture.to_string(),
            target: target.to_string(),
            confidence,
            fields,
            superseded_by: None,
        }));
    }

    // --- Readable action headers (§8) ------------------------------------

    fn action(&mut self, rec: &Record, agent: &str, posture: &str, form: &ActionForm) {
        match form {
            ActionForm::Single { target } => self.action_single(rec, agent, posture, target),
            ActionForm::Suspects {
                from,
                relation,
                to,
                alias,
            } => self.action_suspects(rec, agent, from, relation, to, alias.as_deref()),
            ActionForm::Infers { target, from } => {
                self.action_infers(rec, agent, target, from)
            }
        }
    }

    fn action_single(&mut self, rec: &Record, agent: &str, posture: &str, target: &str) {
        let creates_focus = FOCUS_CREATING.contains(&posture);
        if creates_focus {
            let kind = posture_kind(posture).map(str::to_string);
            self.ensure_focus(target, kind, false, None, None, rec.block.body.clone(), Fields::new());
        }

        let stance_id = self.idgen.stance_id(agent, posture, target);
        let mut confidence = None;
        let mut stance_fields = Fields::new();

        for f in &rec.block.fields {
            match f.name.as_str() {
                "confidence" => {
                    if confidence.is_some() {
                        self.diags
                            .warning(f.line, "duplicate `confidence` field; using the last");
                    }
                    confidence = self.confidence_value(f, rec.line);
                }
                "until" => self.expand_until(f, target),
                _ => stance_fields.push(f.name.clone(), f.value.clone()),
            }
        }

        // For non-focus-creating postures, body annotates the stance.
        let body_field = if !creates_focus {
            rec.block.body.clone()
        } else {
            None
        };
        if let Some(body) = body_field {
            stance_fields.0.insert(0, ("note".to_string(), Value::Text(body)));
        }

        self.objects.push(Object::Stance(Stance {
            id: stance_id,
            agent: agent.to_string(),
            posture: posture.to_string(),
            target: target.to_string(),
            confidence,
            fields: stance_fields,
            superseded_by: None,
        }));
    }

    fn action_suspects(
        &mut self,
        rec: &Record,
        agent: &str,
        from: &str,
        relation: &str,
        to: &str,
        alias: Option<&str>,
    ) {
        self.ensure_focus(from, None, false, None, None, None, Fields::new());
        self.ensure_focus(to, None, false, None, None, None, Fields::new());

        let link_id = match alias {
            Some(a) => {
                self.reserve_explicit(a, rec.line);
                a.to_string()
            }
            None => self.idgen.link_id(from, relation, to),
        };
        let link_weight = self.read_weight(&rec.block, rec.line);
        self.objects.push(Object::Link(Link {
            id: link_id.clone(),
            from: from.to_string(),
            relation: relation.to_string(),
            to: to.to_string(),
            weight: link_weight,
            probability: None,
            body: None,
            fields: Fields::new(),
            superseded_by: None,
            derived_confidence: None,
            leverage: None,
            argument_status: None,
        }));

        let stance_id = self.idgen.stance_id(agent, "suspects", &link_id);
        let mut confidence = None;
        let mut stance_fields = Fields::new();
        for f in &rec.block.fields {
            match f.name.as_str() {
                "confidence" => {
                    if confidence.is_some() {
                        self.diags
                            .warning(f.line, "duplicate `confidence` field; using the last");
                    }
                    confidence = self.confidence_value(f, rec.line);
                }
                "until" => self.expand_until(f, &link_id),
                "weight" => {} // already applied to the link above
                _ => stance_fields.push(f.name.clone(), f.value.clone()),
            }
        }
        if let Some(body) = rec.block.body.clone() {
            stance_fields.0.insert(0, ("note".to_string(), Value::Text(body)));
        }

        self.objects.push(Object::Stance(Stance {
            id: stance_id,
            agent: agent.to_string(),
            posture: "suspects".to_string(),
            target: link_id,
            confidence,
            fields: stance_fields,
            superseded_by: None,
        }));
    }

    fn action_infers(&mut self, rec: &Record, agent: &str, target: &str, sources: &[String]) {
        self.ensure_focus(
            target,
            Some("claim".to_string()),
            false,
            None,
            None,
            rec.block.body.clone(),
            Fields::new(),
        );

        // One `supports` link per source (§8.3); a `weight` applies to all.
        let link_weight = self.read_weight(&rec.block, rec.line);
        for src in sources {
            let id = self.idgen.link_id(src, "supports", target);
            self.objects.push(Object::Link(Link {
                id,
                from: src.clone(),
                relation: "supports".to_string(),
                to: target.to_string(),
                weight: link_weight,
                probability: None,
                body: None,
                fields: Fields::new(),
                superseded_by: None,
                derived_confidence: None,
                leverage: None,
                argument_status: None,
            }));
        }

        let stance_id = self.idgen.stance_id(agent, "infers", target);
        let mut confidence = None;
        let mut stance_fields = Fields::new();
        for f in &rec.block.fields {
            match f.name.as_str() {
                "confidence" => {
                    if confidence.is_some() {
                        self.diags
                            .warning(f.line, "duplicate `confidence` field; using the last");
                    }
                    confidence = self.confidence_value(f, rec.line);
                }
                "until" => self.expand_until(f, target),
                "weight" => {} // already applied to the supports link(s) above
                _ => stance_fields.push(f.name.clone(), f.value.clone()),
            }
        }

        self.objects.push(Object::Stance(Stance {
            id: stance_id,
            agent: agent.to_string(),
            posture: "infers".to_string(),
            target: target.to_string(),
            confidence,
            fields: stance_fields,
            superseded_by: None,
        }));
    }

    // --- Helpers ----------------------------------------------------------

    /// `until REF [STATUS]` -> `REF blocks <blocked>` link, status preserved.
    fn expand_until(&mut self, f: &Field, blocked: &str) {
        let Some(blocker) = f.first_arg() else {
            self.diags
                .warning(f.line, "`until` requires a reference");
            return;
        };
        let id = self.idgen.link_id(blocker, "blocks", blocked);
        let mut fields = Fields::new();
        if let Some(status) = f.args.get(1) {
            fields.push("status", Value::Symbol(status.clone()));
        }
        self.objects.push(Object::Link(Link {
            id,
            from: blocker.to_string(),
            relation: "blocks".to_string(),
            to: blocked.to_string(),
            weight: None,
            probability: None,
            body: None,
            fields,
            superseded_by: None,
            derived_confidence: None,
            leverage: None,
            argument_status: None,
        }));
    }

    /// Validate a `weight` field as a number in 0..1 (clamp + warn if outside).
    fn weight_value(&mut self, f: &Field, line: usize) -> Option<f64> {
        self.unit_interval(f, line, "weight")
    }

    /// Validate a 0..1 field (`weight`, `probability`): a number, clamped with a
    /// warning if outside the interval, or an error if not a number at all.
    fn unit_interval(&mut self, f: &Field, line: usize, name: &str) -> Option<f64> {
        match &f.value {
            Value::Number(n) => {
                let n = *n;
                if !(0.0..=1.0).contains(&n) {
                    self.diags
                        .warning(f.line.max(line), format!("{name} should be in 0..1; clamping"));
                    Some(n.clamp(0.0, 1.0))
                } else {
                    Some(n)
                }
            }
            other => {
                self.diags.error(
                    f.line.max(line),
                    format!("{name} must be a number in 0..1 (got {other:?})"),
                );
                None
            }
        }
    }

    /// Read the first `weight` field from a block, if present (for the links
    /// created by `suspects` / `infers`).
    fn read_weight(&mut self, block: &Block, line: usize) -> Option<f64> {
        let f = block.fields.iter().find(|f| f.name == "weight")?;
        self.weight_value(f, line)
    }

    /// Split the 0..1 link scalars — `weight` and `probability` (Phase 9) — out
    /// of a core `link` block, returning `(weight, probability, rest)`.
    fn split_link_scalars(&mut self, block: &Block, line: usize) -> (Option<f64>, Option<f64>, Fields) {
        let mut weight = None;
        let mut probability = None;
        let mut fields = Fields::new();
        for f in &block.fields {
            match f.name.as_str() {
                "weight" => {
                    if weight.is_some() {
                        self.diags
                            .warning(f.line, "duplicate `weight` field; using the last");
                    }
                    weight = self.weight_value(f, line);
                }
                "probability" => {
                    if probability.is_some() {
                        self.diags
                            .warning(f.line, "duplicate `probability` field; using the last");
                    }
                    probability = self.unit_interval(f, line, "probability");
                }
                _ => fields.push(f.name.clone(), f.value.clone()),
            }
        }
        (weight, probability, fields)
    }

    /// Create or merge a focus by id (dedup per §8.2/§14). `body` is first-wins.
    /// For `kind` (v0.2): an explicit `kind:` field is authoritative and sticky;
    /// a posture-*inferred* kind is soft and a later posture may refine it
    /// silently (e.g. `considers X` → option, then `chooses X` → decision). Only
    /// two *explicit* kinds that disagree warn.
    fn ensure_focus(
        &mut self,
        id: &str,
        kind: Option<String>,
        explicit: bool,
        quantity: Option<Quantity>,
        formula: Option<String>,
        body: Option<String>,
        fields: Fields,
    ) {
        if let Some(&idx) = self.focus_index.get(id) {
            let was_explicit = self.explicit_kind.contains(id);
            let mut conflict: Option<(String, String)> = None;
            let mut now_explicit = false;
            if let Object::Focus(focus) = &mut self.objects[idx] {
                if focus.body.is_none() {
                    focus.body = body;
                }
                // First authored quantity / formula wins (like body) — a later
                // mention of the same focus doesn't overwrite one already stated.
                if focus.quantity.is_none() {
                    focus.quantity = quantity;
                }
                if focus.formula.is_none() {
                    focus.formula = formula;
                }
                match (focus.kind.clone(), kind) {
                    (None, new @ Some(_)) => {
                        focus.kind = new;
                        now_explicit = explicit;
                    }
                    (Some(existing), Some(new)) if existing != new => match (was_explicit, explicit) {
                        (true, true) => conflict = Some((existing, new)),
                        (true, false) => {} // explicit stays authoritative
                        (false, _) => {
                            focus.kind = Some(new); // inferred refines / explicit overrides
                            now_explicit = explicit;
                        }
                    },
                    _ => {}
                }
                for (k, v) in fields.0 {
                    focus.fields.push(k, v);
                }
            }
            if now_explicit {
                self.explicit_kind.insert(id.to_string());
            }
            if let Some((existing, new)) = conflict {
                self.diags.warning(
                    0,
                    format!("focus `{id}` was declared as kind `{existing}` but redeclared as `{new}`; keeping `{existing}`"),
                );
            }
            return;
        }
        if self.idgen.contains(id) {
            // Id already used by a non-focus record.
            self.diags
                .warning(0, format!("id `{id}` is reused across records"));
        } else {
            self.idgen.reserve(id);
        }
        if explicit && kind.is_some() {
            self.explicit_kind.insert(id.to_string());
        }
        self.focus_index.insert(id.to_string(), self.objects.len());
        self.objects.push(Object::Focus(Focus {
            id: id.to_string(),
            kind,
            quantity,
            formula,
            computed_quantity: None,
            body,
            fields,
            superseded_by: None,
            derived_confidence: None,
            argument_status: None,
            expected_value: None,
            decision: None,
        }));
    }

    /// Infer the decision-EV kinds (v0.2, Phase 9): the `to` of a `leads-to` edge
    /// is an `outcome` and its `from` an `option`; the `to` of an `option-of` edge
    /// is a `decision` and its `from` an `option`. Provisional — only foci with no
    /// kind yet are touched, so an explicit or posture-inferred kind always wins.
    fn infer_decision_kinds(&mut self) {
        let mut marks: Vec<(String, &'static str)> = Vec::new();
        for o in &self.objects {
            if let Object::Link(l) = o {
                match l.relation.as_str() {
                    "leads-to" => {
                        marks.push((l.from.clone(), "option"));
                        marks.push((l.to.clone(), "outcome"));
                    }
                    "option-of" => {
                        marks.push((l.from.clone(), "option"));
                        marks.push((l.to.clone(), "decision"));
                    }
                    _ => {}
                }
            }
        }
        for (id, kind) in marks {
            if self.explicit_kind.contains(&id) {
                continue;
            }
            if let Some(&idx) = self.focus_index.get(&id) {
                if let Object::Focus(f) = &mut self.objects[idx] {
                    if f.kind.is_none() {
                        f.kind = Some(kind.to_string());
                    }
                }
            }
        }
    }

    /// Split an explicit `kind` field out of a focus block, validating it
    /// against the known kinds (v0.2).
    fn split_kind(&mut self, block: &Block) -> (Option<String>, Fields) {
        let mut kind = None;
        let mut fields = Fields::new();
        for f in &block.fields {
            if f.name == "kind" {
                if kind.is_some() {
                    self.diags
                        .warning(f.line, "duplicate `kind` field; using the last");
                }
                match f.first_arg() {
                    Some(k) => {
                        // Unknown-kind validity is checked by the vocabulary lint
                        // (Phase 5), so a profile-declared kind is accepted.
                        kind = Some(k.to_string());
                    }
                    None => self.diags.warning(f.line, "`kind` requires a value"),
                }
            } else {
                fields.push(f.name.clone(), f.value.clone());
            }
        }
        (kind, fields)
    }

    /// Build a typed [`Quantity`] from a focus block's `quantity` field (v0.2,
    /// Phase 7). Classifies the unit into a dimension and normalizes to the base
    /// unit where convertible. Warns (never errors) on a malformed value.
    fn build_quantity(&mut self, block: &Block, line: usize) -> Option<Quantity> {
        let f = block.fields.iter().find(|f| f.name == "quantity")?;
        match parse_quantity(&f.args) {
            Some((value, unit)) => {
                let (dimension, factor, base) = units::classify_unit(&unit);
                let normalized = factor.map(|fac| round3(value * fac));
                let base_unit = factor.map(|_| base);
                Some(Quantity {
                    value,
                    unit,
                    dimension,
                    normalized,
                    base_unit,
                })
            }
            None => {
                self.diags.warning(
                    f.line.max(line),
                    "`quantity` should be `<number> <unit>`, e.g. `200 ms` or `1200 USD`",
                );
                None
            }
        }
    }

    fn reserve_explicit(&mut self, id: &str, line: usize) {
        if !self.idgen.reserve(id) {
            self.diags
                .warning(line, format!("duplicate id `{id}`"));
        }
    }

    /// Collect all block fields into a canonical field map (no special-casing).
    fn collect_fields(&self, block: &Block) -> Fields {
        let mut fields = Fields::new();
        for f in &block.fields {
            fields.push(f.name.clone(), f.value.clone());
        }
        fields
    }

    /// Split out `confidence` from a block's fields, validating it.
    fn split_confidence(&mut self, block: &Block, line: usize) -> (Option<Value>, Fields) {
        let mut confidence = None;
        let mut fields = Fields::new();
        for f in &block.fields {
            if f.name == "confidence" {
                if confidence.is_some() {
                    self.diags
                        .warning(f.line, "duplicate `confidence` field; using the last");
                }
                confidence = self.confidence_value(f, line);
            } else {
                fields.push(f.name.clone(), f.value.clone());
            }
        }
        (confidence, fields)
    }

    /// Validate and extract a confidence value (§10): scalar number, ordered
    /// range, or `?`.
    fn confidence_value(&mut self, f: &Field, line: usize) -> Option<Value> {
        match &f.value {
            Value::Number(_) | Value::Unknown => Some(f.value.clone()),
            Value::Range(lo, hi) => {
                if lo > hi {
                    self.diags.error(
                        f.line.max(line),
                        "confidence range must be ordered low..high",
                    );
                }
                Some(f.value.clone())
            }
            other => {
                self.diags.error(
                    f.line.max(line),
                    format!("confidence must be a number, range, or `?` (got {other:?})"),
                );
                None
            }
        }
    }
}
