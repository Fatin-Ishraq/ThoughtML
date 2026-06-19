//! The canonical object model (spec §9). This is the normalized interchange
//! form that every implementation must be able to emit (§3.2).

use crate::lex::Value;
use serde::ser::{SerializeMap, Serializer};
use serde::Serialize;

/// An insertion-ordered field map. Serializes as a JSON object; preserving
/// author order keeps output stable and round-trip-friendly.
#[derive(Debug, Clone, Default)]
pub struct Fields(pub Vec<(String, Value)>);

impl Fields {
    pub fn new() -> Self {
        Fields(Vec::new())
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn push(&mut self, name: impl Into<String>, value: Value) {
        self.0.push((name.into(), value));
    }
}

impl Serialize for Fields {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        let mut map = ser.serialize_map(Some(self.0.len()))?;
        for (k, v) in &self.0 {
            map.serialize_entry(k, v)?;
        }
        map.end()
    }
}

/// A canonical object. The model is emitted as a flat, ordered array of tagged
/// objects so creation order (and thus the §14 canonical shape) is preserved.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Object {
    Focus(Focus),
    Question(Question),
    Link(Link),
    Stance(Stance),
    Scope(Scope),
    Act(Act),
    Profile(Profile),
}

#[derive(Debug, Clone, Serialize)]
pub struct Focus {
    pub id: String,
    /// Semantic category (v0.2): observation, claim, decision, … Inferred from
    /// the introducing posture or set explicitly with a `kind` field.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// A typed numeric measure (v0.2, Phase 7): an authored `quantity` field like
    /// `200 ms` or `1200 USD`, classified into a dimension and normalized to a
    /// base unit where convertible. Authored, never derived.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantity: Option<Quantity>,
    /// An authored formula expression (v0.2, Phase 8): the `= <expr>` source that
    /// computes this focus's value from other foci's quantities. Always present
    /// when authored; its evaluation lands in `computed_quantity`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
    /// The evaluated result of `formula` (v0.2, Phase 8): a [`Quantity`] in base
    /// units with a derived dimension, unit-checked. Opt-in and strictly separate
    /// from the authored `quantity` — the engine computes, it does not restate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub computed_quantity: Option<Quantity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Fields::is_empty")]
    pub fields: Fields,
    /// The id of a later belief that revises this one (v0.2, Phase 3). Computed
    /// by the derive pass from a `revises` relation; both nodes are kept.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
    /// Confidence computed from incoming evidence (v0.2, Phase 4), strictly
    /// separate from any authored confidence. Opt-in; only set for a focus that
    /// is the target of `supports`/`opposes`/`undercuts` evidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derived_confidence: Option<f64>,
    /// Grounded argumentation status (v0.2, Phase 5): `in` / `out` / `undecided`.
    /// Opt-in; only set for a focus that takes part in the attack graph.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub argument_status: Option<String>,
    /// Expected value of an *option* focus (v0.2, Phase 9, §10.6): the
    /// probability-weighted sum of its `leads-to` outcomes' payoffs, with a
    /// per-outcome breakdown, probability mass, and worst-case downside. Opt-in
    /// and derived — strictly separate from authored quantities.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_value: Option<ExpectedValue>,
    /// Expected-value analysis on a *decision* focus (v0.2, §10.6): its options
    /// ordered by expected value, highest first. Opt-in and derived.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<DecisionEV>,
}

/// The expected-value analysis of an option (v0.2, Phase 9, §10.6). `value` is
/// `Σ probability·payoff`; `terms` break it out per outcome; `downside` is the
/// worst-case payoff (decisions are about risk, not just the mean); `probability_mass`
/// is `Σ probability` (≤ 1 when outcomes are exhaustive). Values are in `unit`.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ExpectedValue {
    pub value: f64,
    pub unit: String,
    pub dimension: String,
    pub probability_mass: f64,
    pub downside: f64,
    pub terms: Vec<EvTerm>,
}

/// One outcome's contribution to an option's expected value (v0.2, Phase 9):
/// `contribution = probability · payoff`. Payoff/contribution are in the EV's unit.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct EvTerm {
    pub outcome: String,
    pub probability: f64,
    pub payoff: f64,
    pub contribution: f64,
}

/// One option's expected value, as an entry in a decision's ranking (v0.2,
/// Phase 9). `value`/`unit`/`downside` mirror the option's `expected_value`.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OptionEV {
    pub option: String,
    pub value: f64,
    pub unit: String,
    pub downside: f64,
}

/// The expected-value analysis of a decision (v0.2, §10.6): its options ordered
/// by expected value, highest first. Derived from `leads-to` / `option-of` edges
/// as a *second reading* of the author's numbers — it ranks, it never crowns a
/// winner or quantifies a recommendation. There is no `best` and no `margin`:
/// the mirror reports the EVs and leaves the choice to the reader.
#[derive(Debug, Clone, Serialize)]
pub struct DecisionEV {
    pub ranked: Vec<OptionEV>,
}

/// A typed numeric measure on a focus (v0.2, Phase 7, §4.7). `value` + `unit` are
/// authored; `dimension` classifies the unit (time, information, currency:USD,
/// count:users, rate, ratio …); `normalized`/`base_unit` are present only when the
/// unit is convertible, giving the value in the dimension's base unit so
/// quantities can be compared and (Phase 8) computed over. Authored, never
/// derived — the engine reads measures, it does not invent them.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Quantity {
    pub value: f64,
    pub unit: String,
    pub dimension: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normalized: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_unit: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Question {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub asks_about: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expects: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Fields::is_empty")]
    pub fields: Fields,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Link {
    pub id: String,
    pub from: String,
    pub relation: String,
    pub to: String,
    /// Optional relation strength in 0..1 (v0.2): how strongly the relation
    /// holds. Set by a `weight` field or a `strongly`/`weakly` adverb.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
    /// Probability in 0..1 of this edge's outcome given its option (v0.2,
    /// Phase 9): authored on a `leads-to` link, it is the weight that outcome's
    /// payoff carries in the option's expected-value sum (§10.6).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub probability: Option<f64>,
    /// Optional prose explaining why the relation holds (Tier-1). Only explicit
    /// `link` records carry a body; desugared links (suspects/infers/until) do
    /// not, since their rationale lives on the stance they accompany.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Fields::is_empty")]
    pub fields: Fields,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
    /// Confidence computed from incoming evidence (v0.2, Phase 4). For a link
    /// (e.g. a reified hypothesis) this is how strongly the evidence backs it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derived_confidence: Option<f64>,
    /// How load-bearing this evidence link is on its target (v0.2, Phase 6): the
    /// change in the target's `derived_confidence` when this one link is removed.
    /// Positive = it props the target up (a support); negative = it drags it down
    /// (an attack). Opt-in; only set for evidence links.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leverage: Option<f64>,
    /// Grounded argumentation status (v0.2, Phase 5): `in` / `out` / `undecided`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub argument_status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Stance {
    pub id: String,
    pub agent: String,
    pub posture: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Value>,
    #[serde(skip_serializing_if = "Fields::is_empty")]
    pub fields: Fields,
    /// The id of a later stance that revises this one (v0.2, Phase 3). Computed
    /// by the derive pass when an agent re-states a posture on the same target.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Scope {
    pub id: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub includes: Vec<String>,
    #[serde(skip_serializing_if = "Fields::is_empty")]
    pub fields: Fields,
}

/// A profile declaration (Phase 5): the custom vocabulary a document's dialect
/// adds on top of the core, so strict validation accepts it. Authored only.
#[derive(Debug, Clone, Serialize)]
pub struct Profile {
    pub name: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub kinds: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub relations: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub postures: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Act {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    pub verb: String,
    pub args: Vec<Value>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub expands_to: Vec<String>,
    #[serde(skip_serializing_if = "Fields::is_empty")]
    pub fields: Fields,
}

/// The document's overall time span (v0.2, Phase 3): the earliest and latest
/// timestamps found across all `asserted-at` / `observed-at` / `valid-during`
/// fields. `start` and `end` are the raw source strings (the as-of view reads
/// them back with a full ISO-8601 parser).
#[derive(Debug, Clone, Serialize)]
pub struct Timeline {
    pub start: String,
    pub end: String,
}

/// A single mirror conflict (§10.7): a place the engine's mechanical second
/// reading of the graph disagrees with what the author asserted. The mirror
/// ships the conflict, never a verdict — it names the subjects and states
/// author-said-X / structure-computes-Y, leaving the resolution to the author.
#[derive(Debug, Clone, Serialize)]
pub struct Conflict {
    /// The conflict category, e.g. `confidence-vs-status`.
    pub kind: String,
    /// `error` | `warning` | `info` — how sharp the disagreement is.
    pub severity: String,
    /// The ids the conflict concerns (typically a stance and its target).
    pub subjects: Vec<String>,
    /// A human-readable statement of what the author claimed vs. what the
    /// structure computes.
    pub message: String,
}

/// The mirror's conflict report (opt-in, §10.7): disagreements between the
/// author's stated beliefs and the engine's reading of their own structure.
/// Distinct from `diagnostics` (which judge the document's *form*) — these judge
/// its *coherence*, and ride a separate channel so they never fail strict parsing.
#[derive(Debug, Clone, Serialize)]
pub struct Audit {
    pub conflicts: Vec<Conflict>,
}

/// A fully normalized model: the ordered object list (spec §9), plus the
/// derived document timeline when any timestamps are present.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Canonical {
    pub objects: Vec<Object>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeline: Option<Timeline>,
    /// The mirror's conflict report (§10.7), present only when the audit pass ran.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audit: Option<Audit>,
}

impl Canonical {
    pub fn new() -> Self {
        Self::default()
    }
}
