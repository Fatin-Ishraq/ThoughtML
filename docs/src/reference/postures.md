# Stances and postures

A **stance** records an agent's relationship to a target.

```
stance [alias:] <agent> <posture> <target>      # canonical core form
<agent> <posture> <target>                       # readable action form
```

Both produce a `Stance` object with `agent`, `posture`, `target`, an optional
`confidence` (+ `basis`), and any other fields. The action form additionally
*creates* foci and links, depending on the posture.

## The twelve postures

| Posture | Creates a focus? | Inferred kind | Notes |
|---------|------------------|---------------|-------|
| `noticed` | yes | `observation` | registered an observation |
| `considers` | yes | `option` | put an option forward |
| `holds` | yes | `decision` | commits to / believes |
| `chooses` | yes | `decision` | selects an option |
| `remembers` | yes | `memory` | carries a fact forward |
| `infers` | yes | `claim` | concludes from sources (special form) |
| `suspects` | — | — | proposes a link (special form) |
| `asks` | no | — | raises a question |
| `doubts` | no | — | low credence |
| `accepts` | no | — | agrees |
| `rejects` | no | — | rules out |
| `revises` | no | — | supersedes a prior stance |

An unknown posture warns (`unknown posture`) unless a [profile](modules.md)
declares it.

## The three forms

### Single — `<agent> <posture> <target>`

The common case. Creates a stance on `target`; for a focus-creating posture, also
creates the focus (with the inferred kind and the block body).

```thml
team considers postgres-option
  A single Postgres instance with a partitioned events table.
```

→ a focus `postgres-option` (kind `option`) + a stance `team considers
postgres-option`.

### `suspects` — `<agent> suspects <from> <relation> <to> [as <alias>]`

Proposes a relationship *and* takes a stance on it. Creates both endpoint foci, a
link (aliased if you give `as <alias>`), and a stance whose **target is the
link** — so the suspicion is about the inference itself.

```thml
analyst suspects ai-automation causes job-displacement as displacement-hypothesis
  confidence 0.45..0.70
```

### `infers` — `<agent> infers <target> from <id-list>`

Draws a conclusion. Creates `target` (kind `claim`) and one `supports` link from
*each* source; a `weight` field applies to all of them.

```thml
analyst infers adaptation-too-slow from ai-capability-surge, reskilling-lag
  confidence 0.60
```

## Fields on a stance

- `confidence` — a number, a range (`lo..hi`), or `?`. Out-of-form values error.
- `until <ref> [status]` — desugars to a `<ref> blocks <target>` link (see
  [Questions](questions.md)).
- `note` — free-text rationale; **always** attaches to the stance, for every
  posture.
- any other field — attaches to the stance.

## Body routing

- A **focus-creating** posture: the indented prose becomes the **focus's body**.
- A **non-creating** posture: the prose becomes a **`note` on the stance**.

So `team chooses postgres-option\n  Start with Postgres.` puts the sentence on the
focus, while `economist doubts displacement-hypothesis\n  Betting on precedent.`
puts it on the stance as a note.

## Disagreement and contradiction

Multiple agents taking different postures on one target is normal — that's a
recorded disagreement. But a **single agent** taking *mutually incompatible*
postures on the *same* target is flagged. The incompatible pairs are:
`accepts`/`rejects`, `accepts`/`doubts`, `chooses`/`rejects`, `holds`/`rejects`.
See [Diagnostics](diagnostics.md).
