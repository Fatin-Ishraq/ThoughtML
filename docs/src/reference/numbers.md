# Numbers, units, provenance

ThoughtML is careful with numbers: one encoding per concept, typed units, and
optional provenance.

## The four authored numbers

| Number | Where | Range / form |
|--------|-------|--------------|
| `confidence` | stance | a scalar, a range `lo..hi`, or `?` |
| `weight` | link | 0..1 (clamped, with a warning, if outside) |
| `probability` | link (`leads-to`) | 0..1 (clamped, with a warning, if outside) |
| `quantity` | focus | `<number> <unit>` |

`confidence` is the only one that accepts a range or `?`. A confidence range must
be ordered (`0.45..0.70`, not `0.70..0.45`).

## Quantities and units

A `quantity` is a number plus a unit, classified into a **dimension**:

```thml
focus aid-offer
  quantity 78000 USD

focus p99-latency
  quantity 200 ms

focus disk-budget
  quantity 1.5 GB
```

- Both spaced (`200 ms`) and fused (`200ms`, `1.5GB`, `30%`) forms parse.
- Recognized dimensions include **time**, **information**, **currency**,
  **count**, **rate**, and **ratio**.
- Where a unit is convertible, the quantity is also **normalized** to its
  dimension's base unit (so `1.5 GB` and `500 MB` can be compared, and
  [formulas](../mirror/compute.md) can compute over them). The canonical JSON
  keeps both the authored `value`/`unit` and the `normalized`/`base_unit`.
- A malformed quantity (no leading number + unit) warns and is dropped — the rest
  of the focus is unaffected.

Quantities are **authored, never derived**. A value computed by a
[formula](../mirror/compute.md) lands in a separate `computed_quantity`, so the
two never get confused.

## Provenance {#provenance}

Any authored number may declare its **basis** — how it was arrived at — as a
trailing keyword:

| Basis | Meaning |
|-------|---------|
| `measured` | observed / counted directly |
| `estimated` | reasoned approximation |
| `assumed` | taken as given, not checked |

```thml
ops-agent holds cache-is-safe
  confidence 0.9 assumed

focus disk-budget
  quantity 30 GB measured

link firms-cutting-headcount supports displacement-hypothesis
  weight 0.85 measured
```

The basis is stored on the record (`stance.basis`, `quantity.basis`,
`link.basis`). A **computed** value has no basis — provenance is for authored
numbers only.

### Making provenance mandatory

By default a number with no basis is simply silent about it (documents stay
clean). Opt into enforcement:

```sh
thoughtml --strict-provenance doc.thml
```

This warns on any `quantity`, `confidence`, `weight`, or `probability` that omits
a basis. It's the honest-numbers discipline turned up to a hard check — useful in
CI for documents where every number should say where it stands.

> This closes the gap the old `strongly` / `weakly` adverbs left: a number no
> longer passes as fact without saying on what footing it stands.
