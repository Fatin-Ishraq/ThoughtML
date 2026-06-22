# Records and the canonical model

A document's source is written as **records** (headers + indented blocks). The
parser desugars them into **canonical objects** — a flat, insertion-ordered array
of typed objects, serialized as JSON.

## Record headers

| Header | Form | Becomes |
|--------|------|---------|
| `focus` | `focus <id>` | a [Focus](foci-and-kinds.md) |
| `link` | `link [alias:] <from> <relation> <to>` | a [Link](relations.md) |
| `stance` | `stance [alias:] <agent> <posture> <target>` | a [Stance](postures.md) |
| `question` | `question <id>` | a [Question](questions.md) |
| `scope` | `scope <id>` | a [Scope](scopes.md) |
| `profile` | `profile <name>` | a [Profile](modules.md) |
| `import` | `import <name> as <ns>` | (resolved as a project; no object) |
| *action* | `<agent> <posture> …` | desugars to foci / links / stances |

Anything whose first token isn't a reserved keyword is parsed as an **action
header** — `<agent> <posture> <target>` — which is how the readable surface
works. If the second token isn't a known [posture](postures.md), you get
`unknown record kind or header`.

## The canonical objects

The JSON model is `{ "objects": [ … ], "timeline"?, "audit"? }`. Each object has a
`type` tag. There are seven:

### Focus

```json
{ "type": "focus", "id": "cache-is-safe", "kind": "claim",
  "body": "The new cache layer is safe to ship today." }
```

Optional fields: `kind`, `quantity`, `formula`, `body`, free-form `fields`, and
the opt-in derived ones (`computed_quantity`, `superseded_by`,
`derived_confidence`, `argument_status`, `expected_value`, `decision`).

### Link

```json
{ "type": "link", "id": "stale-reads-opposes-cache-is-safe",
  "from": "stale-reads", "relation": "opposes", "to": "cache-is-safe" }
```

Optional: `weight`, `probability`, `basis`, `body`, `fields`, plus derived
`superseded_by`, `derived_confidence`, `leverage`, `argument_status`.

### Stance

```json
{ "type": "stance", "id": "ops-agent-holds-cache-is-safe",
  "agent": "ops-agent", "posture": "holds", "target": "cache-is-safe",
  "confidence": { "kind": "number", "value": 0.9 }, "basis": "assumed" }
```

### Question

```json
{ "type": "question", "id": "throughput-benchmark",
  "body": "Can Postgres sustain 50k events/s?", "expects": "number", "status": "open" }
```

Plus `asks_about` (a list of ids).

### Scope

```json
{ "type": "scope", "id": "incident-742", "includes": ["metric-shift", "…"] }
```

### Profile

```json
{ "type": "profile", "name": "risk-analysis",
  "kinds": ["risk"], "relations": ["aggravates"], "postures": ["flags"] }
```

### Act

Provenance objects for readable actions, emitted only under `--acts`. Each records
the `verb`, `args`, and the canonical ids it `expands_to`.

## Ids

Every object has an id, used for cross-references.

- For `focus`, `question`, `scope`, `profile` — you write the id in the header.
- For `link` and `stance` — you can supply an **alias** (`link foo: a causes b`),
  or let the parser **generate** one:
  - a link → `<from>-<relation>-<to>` (e.g. `deploy-change-causes-metric-shift`)
  - a stance → `<agent>-<posture>-<target>`
  - on collision, a `-2` suffix is appended.

Reusing an id across records is flagged (`duplicate id` / `id is reused across
records`). A `focus` mentioned twice is **merged**, not duplicated — see
[Foci](foci-and-kinds.md#merging).

## Order is preserved

The `objects` array is in **declaration order**, and field maps keep author
order. A document without any opt-in derivations serializes byte-for-byte
stably — which is what lets the test suite assert that every bundled example is
[strict-clean](diagnostics.md).
