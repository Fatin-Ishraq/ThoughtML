//! Standard vocabulary and reserved words (spec §7, §12).

/// Record keywords that begin a core/scope/question header (§6). A header whose
/// first token is one of these is parsed as that record kind; anything else is
/// an action header (`agent action-form`).
pub const RECORD_KEYWORDS: &[&str] =
    &["scope", "question", "focus", "link", "stance", "profile", "import"];

/// Core postures (§12.1) usable as readable action verbs.
pub const POSTURES: &[&str] = &[
    "noticed",
    "considers",
    "suspects",
    "infers",
    "asks",
    "holds",
    "chooses",
    "rejects",
    "revises",
    "remembers",
    "doubts",
    "accepts",
];

/// Focus kinds (v0.2): the semantic category of a focus. Either inferred from
/// the introducing posture or declared explicitly with a `kind` field.
pub const KINDS: &[&str] = &[
    "observation",
    "claim",
    "hypothesis",
    "option",
    "decision",
    // `outcome` (Phase 9): the result an option `leads-to`. Edge inference can
    // set it, and §12.3 lists it, so it must also be writable explicitly.
    "outcome",
    "goal",
    "memory",
    "assumption",
    // `action` (Phase 5 review): a thing one *does* — a plan, intervention, or
    // mitigation — as distinct from a belief (claim/hypothesis) or a result
    // (outcome). Explicit-only; no posture infers it.
    "action",
];

/// Core relations (§12.2). Attacks are expressed by `opposes` (rebut a node) and
/// `undercuts` (defeat an inference); there is no separate `rejects` or
/// `mitigates` — a hard rejection is just `opposes`, and defending X is just
/// attacking X's attacker (`guard opposes risk`), handled uniformly by the
/// grounded labelling (§10.4). Domain dialects can add their own via a `profile`.
pub const RELATIONS: &[&str] = &[
    "supports",
    "opposes",
    "undercuts",
    "answers",
    "causes",
    "enables",
    "prevents",
    "depends-on",
    "blocks",
    "revises",
    // v0.2 (Phase 9, decision EV): an option leads-to an outcome (carrying a
    // `probability`), and is an option-of a decision.
    "leads-to",
    "option-of",
];

/// Known block field phrases (§7). `note` is a Tier-1 addition: a free-text
/// annotation that always rides along on the record it appears under (and, for
/// readable action headers, on the stance — independent of posture), giving
/// focus-creating postures like `holds`/`chooses` a place to record rationale.
pub const FIELDS: &[&str] = &[
    "note",
    "kind",
    "quantity",
    "about",
    "weight",
    "probability",
    "confidence",
    "because",
    "answers",
    "expects",
    "status",
    "until",
    "source",
    "observed-at",
    "asserted-at",
    "valid-during",
    "noted-by",
    "noticed-by",
    "suspected-by",
    "chosen-by",
    "blocked-by",
    "undercut-by",
    // Phase 5: the list-valued declaration lines inside a `profile` record. Known
    // so their comma-list values parse as fields (not body) and never trip the
    // unknown-field lint; only meaningful under a `profile` header.
    "kinds",
    "relations",
    "fields",
    "postures",
];

pub fn is_posture(s: &str) -> bool {
    POSTURES.contains(&s)
}

pub fn is_kind(s: &str) -> bool {
    KINDS.contains(&s)
}

pub fn is_relation(s: &str) -> bool {
    RELATIONS.contains(&s)
}

pub fn is_known_field(s: &str) -> bool {
    FIELDS.contains(&s)
}

pub fn is_record_keyword(s: &str) -> bool {
    RECORD_KEYWORDS.contains(&s)
}
