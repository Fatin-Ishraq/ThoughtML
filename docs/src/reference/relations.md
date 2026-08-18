# Links and relations

A **link** is a typed, directed edge.

```
link [alias:] <from> <relation> <to>
```

```thml
link truck-is-booked supports conditions-are-fine
link delivery-hypothesis: late-delivery causes set-delayed
  The proposed mechanism: evicted hot keys force slow cold reads.
  weight 0.85
```

## Anatomy

| Part | Source |
|------|--------|
| `id` | the `alias:`, or generated `<from>-<relation>-<to>` |
| `from`, `relation`, `to` | the header |
| `weight` | a `weight` field (0..1 evidential strength) |
| `probability` | a `probability` field (0..1, `leads-to` only) |
| `basis` | a [provenance](numbers.md#provenance) keyword on the number |
| `body` | the indented prose (why the relation holds) |

## Evidence bundles (authoring shortcut)

When many sources share one relation and target — the common "several observations
→ one claim" shape — a **bundle** collapses the repetition. A bare
`<relation> <target>` header lists its sources, one per line:

```thml
supports customer-pain-points
  late-fees-problem      weight 0.90 assumed
  limited-availability   weight 0.85
  long-travel-time
```

Each line desugars to an ordinary `link <source> <relation> <target>` carrying its
optional `weight` and provenance — identical to writing the links out longhand. A
bare source (no weight) is a normal, full-strength link.

## The relations

### Evidence (defeasible)

| Relation | Polarity | Meaning |
|----------|----------|---------|
| `supports` | + | source is evidence for target |
| `opposes` | − | source rebuts target (a node attack) |
| `undercuts` | − | source attacks an *inference* (usually a link target) |

These three drive the mirror's [derived confidence](../mirror/derived-confidence.md)
and [argument status](../mirror/argument-status.md). `opposes` and `undercuts`
are the two **attacks**.

### Structural and causal

| Relation | Meaning |
|----------|---------|
| `causes` | source brings about target |
| `enables` | source makes target possible |
| `prevents` | source stops target |
| `depends-on` | target is required for source |
| `blocks` | source holds target up (the desugaring of `until`) |
| `answers` | source resolves a question |
| `revises` | source supersedes target (see [Time](../reference/scopes.md) / tutorial ch. 6) |

`causes` and `depends-on` are expected to be **acyclic** — a cycle among them is
flagged (an impossible circular dependency).

### Decision

| Relation | Meaning |
|----------|---------|
| `leads-to` | an option leads to an outcome; carries `probability` |
| `option-of` | an option belongs to a decision |

These power [decision expected value](../mirror/compute.md#decision-expected-value).

### Membership and candidacy (non-evidential)

| Relation | Meaning |
|----------|---------|
| `part-of` | source is one item **in** the target (a collection member) |
| `candidate-for` | source is a proposed answer to a question — not a resolved one |

These exist to keep **enumerations out of the evidence graph**. Using `supports`
for the items of a list — SWOT strengths, competitors, success factors — silently
inflates the target's [derived confidence](../mirror/derived-confidence.md): the
mirror counts each list item as evidence, so *"Netflix has strengths"* reads as
100%-certain just for naming them. `part-of` says *"this is one of the things,"* not
*"this is evidence it's true"* — it has **no evidence polarity**, so it never touches
confidence, argument status, or leverage. `candidate-for` does the same for a
question's options: a candidate is a proposal, not the resolved `answers`.

Both compose with the bundle shortcut:

```thml
part-of netflix-strengths
  strong-global-brand
  large-subscriber-base
  advanced-algorithms
```

## What can be linked

A link's `from` and `to` may resolve to a **focus, question, or link**. Targeting
a stance or a scope is an **error**. Targeting a non-existent id is a **warning**
(unresolved reference).

## `opposes` vs. `undercuts`, and what's *not* here

- `opposes` rebuts a node: "that claim is false."
- `undercuts` attacks an inference: "that step doesn't follow." When its target
  is a *link*, the mirror weakens that connection rather than the claim.

There is no `rejects` relation and no `mitigates` relation — both were removed in
v0.1.0 because they only duplicated `opposes`. A hard rejection is `opposes`;
defending X is attacking X's attacker (`guard opposes risk`), which the grounded
[argument status](../mirror/argument-status.md) reinstates uniformly. (Note
`rejects` still exists as a *posture* — an agent ruling something out — just not
as a relation.)

## Weight and probability are not interchangeable

- `weight` is evidential strength (any evidence/structural link).
- `probability` is outcome likelihood (`leads-to` only).

Putting `probability` on a non-`leads-to` link, or `weight` on a `leads-to` link,
is ignored with a warning.
