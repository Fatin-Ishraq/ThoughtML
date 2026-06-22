# Glossary

**Agent** — the actor a [stance](../reference/postures.md) attributes a belief to
(`ops-agent`, `analyst`, `team`, `me`). Just an identifier; not a defined entity.

**Argument status** — the grounded [Dung](../mirror/argument-status.md) label of a
node: `in` (survives every attack), `out` (defeated), or `undecided`. Opt-in
(`--status`).

**Attack** — an `opposes` or `undercuts` link. The only relations that affect
[argument status](../mirror/argument-status.md).

**Basis** — the [provenance](../reference/numbers.md#provenance) of an authored
number: `measured`, `estimated`, or `assumed`.

**Body** — the free-text prose under a record's header.

**Canonical model** — the normalized, ordered array of typed objects the parser
emits as JSON. The interchange form of the language.

**Conflict** — a [mirror](../mirror/conflicts.md) finding: a place the computed
reading disagrees with what the author asserted. Distinct from a *diagnostic*.

**Derived confidence** — a per-claim strength the mirror computes by propagating
evidence, separate from authored confidence. Opt-in (`--derived`).

**Desugar** — the step that turns the readable action surface
(`agent posture target`) into canonical core objects.

**Diagnostic** — an error or warning about a document's *form* (vs. a *conflict*,
about its coherence).

**Focus** — a node you reason about; the basic unit. Has a [kind](../reference/foci-and-kinds.md).

**Kind** — a focus's semantic category (`observation`, `claim`, `decision`, …).

**Leverage** — how load-bearing one evidence edge is: the change in its target's
derived confidence when the edge is removed. Opt-in (`--sensitivity`).

**Link** — a typed, directed edge with a [relation](../reference/relations.md).

**Mirror** — ThoughtML's opt-in second reading of a document. "A mirror, not an
oracle": it reports disagreements, it never decides.

**Orphan** — a focus nothing connects to. Flagged as a warning.

**Posture** — the verb in a [stance](../reference/postures.md) (`holds`,
`doubts`, `chooses`, …).

**Profile** — a declaration of custom [vocabulary](../reference/modules.md)
(kinds/relations/fields/postures) a document's dialect adds.

**Quantity** — an authored numeric [measure](../reference/numbers.md) with a unit
and a dimension. A computed result is a separate `computed_quantity`.

**Relation** — the type of a link (`supports`, `causes`, `leads-to`, …). Twelve
in v0.1.0.

**Scope** — a grouping of records that can [cascade context](../reference/scopes.md)
onto its members.

**Stance** — an [agent's relationship](../reference/postures.md) to a target,
optionally with confidence.

**Strict-clean** — parsing with zero errors *and* zero warnings under default
options. Every bundled example must be strict-clean.

**Supersession** — marking a belief replaced by a later one (via `revises`),
without deleting it. The basis of the [as-of view](../tutorial/time.md).

**Weight** — a link's evidential strength, 0..1. (Distinct from `probability`,
the outcome likelihood on a `leads-to` edge.)
