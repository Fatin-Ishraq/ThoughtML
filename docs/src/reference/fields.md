# Fields

A **field** is an indented `name value` line inside a record's block. Known
fields have defined meanings; unknown but well-formed fields are preserved (and
warned about under [strict mode](diagnostics.md)).

## A field line

```
<name> <value...>
```

The name is the first token; the rest is the value, [classified](syntax.md#values)
into a number, range, ref, list, time, text, etc. A line whose first token is a
known field name is always a field; an unknown lowercase identifier followed only
by value-shaped tokens is treated as a field too.

## Known fields

| Field | Attaches to | Value | Purpose |
|-------|-------------|-------|---------|
| `kind` | focus | symbol | the focus's [kind](foci-and-kinds.md) |
| `quantity` | focus | `<number> <unit>` | a typed [measure](numbers.md) |
| `confidence` | stance | number / range / `?` | credence in the target |
| `weight` | link | 0..1 | evidential strength |
| `probability` | link (`leads-to`) | 0..1 | outcome likelihood |
| `note` | stance | text | rationale (always on the stance) |
| `because` | stance | ref | the supporting reason |
| `answers` | stance | ref | the question this settles |
| `until` | stance | `<ref> [status]` | desugars to a `blocks` link |
| `about` | question | id-list | what the question concerns |
| `expects` | question | symbol | the kind of answer wanted |
| `status` | question / link | symbol | `open`, `answered`, … |
| `source` | any | text / `uri:` | provenance of the record |
| `observed-at` | any | time | when observed |
| `asserted-at` | any | time | when asserted |
| `valid-during` | any | `start..end` | the span it holds over |

A few more are recognized so they parse cleanly as fields: `noted-by`,
`noticed-by`, `suspected-by`, `chosen-by`, `blocked-by`, `undercut-by`.

## Reference fields

Four fields hold a reference to another record and are **resolved**: `because`,
`answers`, `blocked-by`, `undercut-by`. If the referenced id doesn't exist, you
get a warning. (References in these fields also count for the
[orphan check](diagnostics.md) — a focus reached only via a `because` is not an
orphan.)

## Provenance basis

`quantity`, `confidence`, `weight`, and `probability` may carry a trailing
**basis** keyword — `measured`, `estimated`, or `assumed`:

```thml
  confidence 0.9 assumed
  quantity 30 GB measured
```

See [Numbers, units, provenance](numbers.md#provenance).

## Profile-only fields

Inside a `profile` record, four list-valued fields declare custom vocabulary:
`kinds`, `relations`, `fields`, `postures`. They're only meaningful there — see
[Profiles](modules.md).

## Inherited fields

Inside a [scope](scopes.md), four fields cascade to members that don't set their
own: `asserted-at`, `observed-at`, `source`, `valid-during`. This lets a scope
stamp a whole investigation with one date and source.
