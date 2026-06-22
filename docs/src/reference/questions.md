# Questions

A **question** is an open issue in the reasoning.

```thml
question which-datastore
  Which datastore should back the event log?
  expects option
  status open
```

## Anatomy

| Part | Source | Meaning |
|------|--------|---------|
| `id` | the header (`question <id>`) | |
| `body` | indented prose | the question itself |
| `expects` | `expects <symbol>` | what kind of answer settles it (`option`, `number`, `forecast`, …) |
| `status` | `status <symbol>` | typically `open`, or settled |
| `asks_about` | `about <id-list>` | the foci the question concerns |
| `fields` | other field lines | free-form |

A question should carry at least a body *or* an `expects` field — a bare question
with neither warns. Duplicate `expects` or `status` fields warn (the last wins).

## `about`

```thml
question new-jobs-in-time
  Will new jobs arrive fast enough to offset the losses this decade?
  about job-displacement, technology-creates-jobs
  expects forecast
```

Each id in `about` is resolved; an unresolved one warns.

## Answering

Two ways to record that a question is resolved:

- a `link <source> answers <question>` edge, or
- an `answers <question>` field on the stance that settles it:

```thml
team chooses postgres-option
  answers which-datastore
```

## Blocking — `until`

A stance can declare it's blocked until a question is answered, via the `until`
field:

```thml
team holds datastore-decision
  until throughput-benchmark answered
```

`until <ref> [status]` desugars to a link `<ref> blocks <target>`, preserving the
optional status word as a field on that link. The result: the blocking question
appears in the graph as an edge holding the decision up. This is the idiom for
"we can't decide yet, and here's exactly what we're waiting on."
