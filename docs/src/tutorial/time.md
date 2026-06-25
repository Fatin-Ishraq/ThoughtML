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

From all the timestamps in a document, ThoughtML derives a **timeline**. It's not
just the earliest and latest instants: it carries an ordered `events` array —
every dated record as `{ at, seq, id, kind }` (plus `agent` for a stance) — sorted
by *valid-time*, with a `seq` tiebreak for events that share an instant. That
ordering is the document's reasoning as a *sequence of moments*, independent of the
order you happened to type it in; it's what the [viewer](../guides/viewer.md)
replays. Dates can be partial (`2026`, `2026-06`) and carry a zone
(`2026-06-14T14:05+05:00`); they're compared correctly regardless.

## A belief's lifecycle

A focus can record where it stands with a first-class `status`:

```thml
focus webgl-renderer
  kind option
  A shader-based renderer for particle juice.
  status abandoned
  Canvas 2D already holds 60fps — this was over-engineering.
```

The four values are `open` (live), `settled` (resolved), `superseded` (replaced by
a later belief — see `revises` below), and `abandoned` (a dead end). The point is
the same as with revision: an `abandoned` or `superseded` branch is **kept with its
reason, not deleted**, so the path *not* taken stays inspectable. The viewer folds
those branches by default and dims them in replay.

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
graph. In the [playground](../guides/playground.md), the **as-of bar** lets you
replay the document moment by moment: drag it back and the later beliefs disappear,
the earlier ones un-dim. You can watch the reasoning evolve.

The same projection is available from the CLI, so you can ask "what did this
document believe *as of* a date?" in a script:

```sh
thoughtml --as-of 2026-06-08 doc.thml      # the model as it stood on that day
thoughtml --as-of-seq 3 doc.thml           # …as of the 3rd recorded event
```

`--as-of` filters on valid-time (the default axis); `--as-of-seq` filters on
transaction order. Either way, links and stances that would dangle once a node
drops out are cascaded away, so the projected model is always coherent.

The bundled [`estimate-revised.thml`](../appendix/examples.md) is built entirely
around this — a launch date that slips twice as evidence arrives.

Our cache document is a single moment in time, so it needs no revision. We now
have every piece. Time to read it back — [the mirror](the-mirror.md).
