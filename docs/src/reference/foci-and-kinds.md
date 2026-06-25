# Foci and kinds

A **focus** is a node you reason about. Declared directly:

```thml
focus cache-is-safe
  kind claim
  The new cache layer is safe to ship today.
```

or created implicitly by a focus-creating [posture](postures.md).

## Anatomy

| Part | Source | Notes |
|------|--------|-------|
| `id` | the header (`focus <id>`) | lowercase kebab-case |
| `kind` | a `kind` field, or inferred | see below |
| `body` | the indented prose | first mention wins on merge |
| `quantity` | a `quantity` field | a typed [measure](numbers.md) |
| `formula` | a `= <expr>` line | opt-in [compute](../mirror/compute.md) |
| `status` | a `status` field | belief lifecycle, see below |
| `includes` | nested child records | thought-tree members, see below |
| `fields` | any other field lines | free-form, order-preserved |

## Kinds

The ten kinds:

| Kind | Meaning |
|------|---------|
| `observation` | Something seen or measured |
| `claim` | An assertion put forward as true |
| `hypothesis` | A proposed explanation, not yet settled |
| `option` | A choice on the table |
| `decision` | A choice to be made or recorded |
| `outcome` | A result an option can lead to |
| `goal` | A desired end |
| `assumption` | Something taken as given |
| `memory` | A recollection carried forward |
| `action` | A thing one does — plan, intervention, mitigation |

An unknown kind warns (`unknown focus kind`), unless a [profile](modules.md)
declares it.

## How a kind is set

In priority order:

1. **Explicit `kind` field** — authoritative and *sticky*. Once set explicitly,
   nothing overrides it silently.
2. **Posture inference** — a focus-creating posture implies a kind:
   `noticed`→`observation`, `considers`→`option`, `holds`/`chooses`→`decision`,
   `remembers`→`memory`, `infers`→`claim`. This is *soft*: a later posture can
   refine it.
3. **Decision-graph inference** — the endpoints of `leads-to` / `option-of` edges
   get provisional kinds: the source of either is an `option`; the target of
   `leads-to` is an `outcome`; the target of `option-of` is a `decision`. Only
   applied to foci that still have no kind.

If two *explicit* kinds disagree on the same focus, the first is kept and a
warning is emitted. An explicit kind always beats an inferred one; an inferred
kind can be refined by a later posture (e.g. `considers X` then `chooses X`
moves `X` from `option` to `decision`).

## Status — the belief lifecycle {#status}

A `status` field records where a focus stands:

| Status | Meaning |
|--------|---------|
| `open` | live — still in play (the default if unstated) |
| `settled` | resolved |
| `superseded` | replaced by a later belief (cf. the `revises` [relation](relations.md)) |
| `abandoned` | a dead end |

Status is a **fold marker**: a `settled` / `superseded` / `abandoned` focus (and the
thought-tree it opens) is kept with its reasoning intact but folds by default in the
[viewer](../guides/viewer.md). Nothing is deleted — the path not taken stays
inspectable.

## Thought-trees — nesting {#includes}

A focus (like a [scope](scopes.md), and like a [question](questions.md)) can
**contain** other records by nesting them under it:

```thml
focus ship-decision
  kind decision
  Ship the new cache layer this week.

  focus load-test-passed
    kind observation
    p99 held under 2× peak traffic.

  focus rollback-ready
    kind assumption
    One-command rollback is wired up.
```

The members are recorded on the container's `includes`, in document order, and
**inherit** the container's provenance and temporal context (member-wins: an
explicit value on the child is kept). This turns a flat list of foci into a
*thought-tree* — a claim and the reasoning that hangs off it, as one unit.

## Merging {#merging}

A focus id mentioned more than once refers to **one** focus — the mentions merge:

- `body`, `quantity`, and `formula` are **first-wins** (a later mention doesn't
  overwrite a value already stated).
- `fields` accumulate.
- `kind` follows the priority rules above.

This is what lets you declare a focus once with full detail and then refer to it
freely by id elsewhere, even from another agent's stance.

**Divergence is kept, not dropped.** If a later mention states a *different* body,
quantity, or formula (not just a repeat), the alternative is **not** silently
discarded — it's retained on the focus's `divergent` list and the mirror raises a
[`definition-divergence`](../mirror/conflicts.md) conflict. Concurrent authors (or
agents) can each write their version; reconciliation is surfaced, never forced.
