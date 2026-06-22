# 6. Time and revision

Beliefs change. ThoughtML treats time as first-class: records can be dated, and a
later belief can *revise* an earlier one without erasing it — the history stays
inspectable.

## Dating records

Three timestamp fields, all ISO-8601:

- `observed-at` — when something was seen.
- `asserted-at` — when a belief was put on the record.
- `valid-during start..end` — a span over which something holds.

```thml
analyst noticed early-burndown
  The first sprint cleared 40% of the backlog — ahead of plan.
  observed-at 2026-06-01
```

From all the timestamps in a document, ThoughtML derives a **timeline** (its
earliest and latest instants). Dates can be partial (`2026`, `2026-06`) and carry
a zone (`2026-06-14T14:05+05:00`); they're compared correctly regardless.

## Revising a belief

There are two ways to mark that something has been superseded — and *nothing is
deleted* either way.

**The `revises` relation** supersedes a *node*:

```thml
focus june-30-target
  Original commitment: ship on June 30.

focus july-14-target
  Revised commitment: ship on July 14, absorbing the new scope.
  asserted-at 2026-06-08

link july-14-target revises june-30-target
  The added scope pushed the committed date out by two weeks.
```

After this, `june-30-target` carries `superseded_by: july-14-target`.

**The `revises` posture** supersedes the same agent's *previous stance* on a
target:

```thml
analyst suspects early-burndown causes on-track as on-track-claim
  confidence 0.70
  asserted-at 2026-06-01

analyst revises on-track-claim
  confidence 0.40
  asserted-at 2026-06-08
  note The new scope cancels out the fast start.
```

The earlier stance is marked superseded by the later one. ThoughtML also
**sanity-checks the order**: if a revision is asserted *earlier* than the thing it
revises, you get a warning.

## Why keep the old belief?

Because the history is the point. A superseded belief no longer counts as live
evidence (the mirror ignores it when deriving confidence), but it's still in the
graph. In the [playground](../guides/playground.md), an **as-of slider** lets you
replay the document day by day: drag it back and the later beliefs disappear, the
earlier ones un-dim. You can watch the reasoning evolve.

The bundled [`estimate-revised.thml`](../appendix/examples.md) is built entirely
around this — a launch date that slips twice as evidence arrives.

Our cache document is a single moment in time, so it needs no revision. We now
have every piece. Time to read it back — [the mirror](the-mirror.md).
