# 2. Links — how they relate

A **link** connects two records with a typed, directed relation. This is what
turns a list of foci into a *graph* you can reason over.

The syntax is `link <from> <relation> <to>`:

```thml
link truck-is-booked supports conditions-are-fine
link overnight-freeze opposes conditions-are-fine
```

Read left to right: *truck-is-booked supports conditions-are-fine*; *overnight-freeze
opposes conditions-are-fine*. The direction matters — `a supports b` is not the same as
`b supports a`.

## The relations

There are twelve relations, in three families.

**Evidence** — the defeasible core. These feed the mirror's
[derived confidence](../mirror/derived-confidence.md) and
[argument status](../mirror/argument-status.md):

| Relation | Meaning |
|----------|---------|
| `supports` | The source is evidence *for* the target |
| `opposes` | The source is evidence *against* the target (a rebuttal) |
| `undercuts` | The source attacks an *inference*, not the claim itself |

**Structural / causal** — how things relate in the world or the plan:

| Relation | Meaning |
|----------|---------|
| `causes` | The source brings about the target |
| `enables` | The source makes the target possible |
| `prevents` | The source stops the target |
| `depends-on` | The target is needed for the source |
| `blocks` | The source holds the target up (see `until` in [chapter 4](questions.md)) |
| `answers` | The source resolves a question |
| `revises` | The source replaces the target (see [chapter 6](time.md)) |

**Decision** — for expected-value analysis (see [the compute layer](../mirror/compute.md)):

| Relation | Meaning |
|----------|---------|
| `leads-to` | An option leads to an outcome (carries a `probability`) |
| `option-of` | An option belongs to a decision |

> **`opposes` vs. `undercuts`.** `opposes` rebuts a *node* ("that claim is
> wrong"). `undercuts` attacks an *inference* ("that reasoning doesn't follow") —
> its target is usually a link. The distinction matters to the mirror: an
> undercut weakens a connection rather than the claim. There is deliberately no
> separate `rejects` relation — a hard rejection is just `opposes`, and defending
> X is just attacking X's attacker.

## Aliases and prose

Give a link an **alias** (its own id) by prefixing `name:` — useful when you want
to attack the link itself, or reference it later:

```thml
link delivery-hypothesis: late-delivery causes set-delayed
  The proposed mechanism: evicted hot keys force slow cold reads.

link thermometer-misread undercuts delivery-hypothesis
```

The indented sentence under a `link` is its **body** — prose explaining *why* the
relation holds. Here `thermometer-misread undercuts delivery-hypothesis` attacks the
inference by name.

## What can a link connect?

A link's endpoints may be **foci, questions, or other links**. Pointing a link at
a stance or a scope is an error. Pointing it at an id that doesn't exist is a
warning (a dangling reference — usually a typo).

## Our document so far

```thml
focus conditions-are-fine
  kind claim
  Conditions on site are fine to pour the slab this afternoon.

focus truck-is-booked
  kind observation
  The ready-mix truck is booked for 14:00 and the crew is on site.

focus overnight-freeze
  kind observation
  The thermometer logged minus four degrees overnight.

link truck-is-booked supports conditions-are-fine
link overnight-freeze opposes conditions-are-fine
```

No more orphans: every focus is connected. Now — who actually *believes* the
claim? That's a [stance](stances.md).
