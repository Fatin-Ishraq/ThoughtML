# 4. Questions — what's still open

Reasoning isn't only assertions. Often the most important thing in a document is
what you *don't* know yet. A **question** records an open issue.

```thml
question throughput-benchmark
  Can Postgres sustain 50k events per second on target hardware?
  expects number
  status open
```

- The indented sentence is the question's body.
- `expects` says what kind of answer would settle it (`number`, `option`,
  `forecast`, …) — free-form, for the reader.
- `status` is typically `open` or settled.

## What is the question about?

Use `about` to link a question to the foci it concerns:

```thml
question new-jobs-in-time
  Will new jobs arrive fast enough to offset the losses this decade?
  about job-displacement, technology-creates-jobs
  expects forecast
  status open
```

## Answering a question

A link with the `answers` relation, or an `answers` field on a stance, records
that something resolves the question:

```thml
team chooses postgres-option
  answers which-datastore
```

## Blocking on an open question

Here's the useful part. A decision often *can't be made* until a question is
answered. The `until` field on a stance expresses exactly that:

```thml
team holds datastore-decision
  Commit to a datastore for the event log.
  until throughput-benchmark answered
  note Provisionally Postgres, but not signed off until the benchmark lands.
```

`until throughput-benchmark answered` desugars to a link:
`throughput-benchmark blocks datastore-decision` (with the status `answered`
preserved on it). So the graph literally shows the benchmark holding the decision
up — and when you read it back, the blockers are explicit, not buried in prose.

Our cache document doesn't need a question — the team has already shipped. But
this pattern is the backbone of [decision records](../guides/use-cases.md). Next:
the [numbers](numbers.md) that make beliefs precise.
