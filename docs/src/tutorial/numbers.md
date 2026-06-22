# 5. Numbers — confidence, weight, provenance

ThoughtML lets you attach numbers to beliefs — but it's careful about them. There
is *one* way to express each thing, and numbers can declare where they came from.

## Confidence — on a stance

`confidence` says how strongly an agent holds a target. It can be:

- a **scalar** in 0..1 — `confidence 0.9`
- a **range** (lo..hi) for honest uncertainty — `confidence 0.45..0.70`
- the **unknown marker** `?` — `confidence ?` (held, but credence not stated)

```thml
ops-agent holds cache-is-safe
  confidence 0.9
```

## Weight — on a link

`weight` (0..1) says how *strongly a relation holds* — how much this piece of
evidence counts:

```thml
link firms-cutting-headcount supports displacement-hypothesis
  weight 0.85

link technology-creates-jobs undercuts displacement-hypothesis
  weight 0.5
```

There is deliberately **no `strongly` / `weakly` adverb**. Earlier versions had
them; each smuggled in a magic number the author never chose. Strength is the
explicit numeric `weight`, or nothing.

## Probability — on a `leads-to` link

For decision analysis, a `leads-to` edge carries the `probability` of that
outcome:

```thml
link harvard leads-to harvard-thrive
  probability 0.7
```

(`weight` and `probability` are distinct: `weight` is evidential strength;
`probability` is outcome likelihood. Putting `weight` on a `leads-to` edge, or
`probability` on anything else, is ignored with a warning.)

## Quantities — on a focus

A focus can carry a typed measure with a unit, classified into a dimension:

```thml
focus aid-offer
  quantity 78000 USD
  Annual grant aid offered — grants, not loans.
```

Units are recognized across dimensions (time, information, currency, count,
rate, ratio). Fused forms work too — `200ms`, `1.5GB`, `30%`. See
[Numbers, units, provenance](../reference/numbers.md) for the full model.

## Provenance — where a number came from

Any authored number can declare its **basis** inline — one of `measured`,
`estimated`, `assumed`:

```thml
ops-agent holds cache-is-safe
  confidence 0.9 assumed
```

```thml
focus disk-budget
  quantity 30 GB measured
```

This is the honest core of the language: a `0.9` that says it's `assumed` tells
you something a bare `0.9` hides. Provenance is **optional** — but you can make
it mandatory:

```sh
thoughtml --strict-provenance doc.thml
```

With `--strict-provenance`, any authored `quantity`, `confidence`, `weight`, or
`probability` that omits a basis gets a warning. It's off by default, so existing
documents stay clean.

## Our document so far

We add the provenance to our stance — the `0.9` is `assumed`, not measured:

```thml
ops-agent holds cache-is-safe
  confidence 0.9 assumed
  note Shipping — the load test passed.
```

That single word is what makes the final mirror reading land. But first, one more
dimension: [time](time.md).
