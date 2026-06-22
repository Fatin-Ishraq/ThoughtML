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

## Merging {#merging}

A focus id mentioned more than once refers to **one** focus — the mentions merge:

- `body`, `quantity`, and `formula` are **first-wins** (a later mention doesn't
  overwrite a value already stated).
- `fields` accumulate.
- `kind` follows the priority rules above.

This is what lets you declare a focus once with full detail and then refer to it
freely by id elsewhere, even from another agent's stance.
