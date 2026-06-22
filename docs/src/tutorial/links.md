# 2. Links — how they relate

A **link** connects two records with a typed, directed relation. This is what
turns a list of foci into a *graph* you can reason over.

The syntax is `link <from> <relation> <to>`:

```thml
link load-test-passed supports cache-is-safe
link stale-reads opposes cache-is-safe
```

Read left to right: *load-test-passed supports cache-is-safe*; *stale-reads
opposes cache-is-safe*. The direction matters — `a supports b` is not the same as
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
link cache-hypothesis: cache-eviction causes latency-spike
  The proposed mechanism: evicted hot keys force slow cold reads.

link dashboard-bug undercuts cache-hypothesis
```

The indented sentence under a `link` is its **body** — prose explaining *why* the
relation holds. Here `dashboard-bug undercuts cache-hypothesis` attacks the
inference by name.

## What can a link connect?

A link's endpoints may be **foci, questions, or other links**. Pointing a link at
a stance or a scope is an error. Pointing it at an id that doesn't exist is a
warning (a dangling reference — usually a typo).

## Our document so far

```thml
focus cache-is-safe
  kind claim
  The new cache layer is safe to ship today.

focus load-test-passed
  kind observation
  Load test at 2x peak traffic passed with no errors.

focus stale-reads
  kind observation
  Staging showed stale reads under cache eviction.

link load-test-passed supports cache-is-safe
link stale-reads opposes cache-is-safe
```

No more orphans: every focus is connected. Now — who actually *believes* the
claim? That's a [stance](stances.md).
