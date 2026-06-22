# The Mirror

Everything so far describes what you *author* — foci, links, stances, numbers.
The **mirror** is what ThoughtML computes *back*: a second, mechanical reading of
your structure. Where that reading disagrees with what you said, you have
something worth looking at.

This is the heart of the language's philosophy:

> **A mirror, not an oracle.** The engine produces a second reading that can
> disagree with the author — but it reports the disagreement; it never overrides
> the author or hands down a verdict.

## It's all opt-in

None of the mirror runs by default. The base pipeline (parse → desugar →
validate) emits stable canonical JSON with nothing computed. You turn readings on
with flags:

| Flag | Reading |
|------|---------|
| `--derived` | [Derived confidence](derived-confidence.md) — propagate evidence into a per-claim strength |
| `--status` | [Argument status](argument-status.md) — grounded `in`/`out`/`undecided` |
| `--audit` | [Conflict report](conflicts.md) — where confidence disagrees with status |
| `--sensitivity` | per-edge [leverage](compute.md#sensitivity) |
| `--formulas` | evaluate `= expr` foci into `computed_quantity` |
| `--decisions` | [decision expected value](compute.md#decision-expected-value) |
| `--acts` | emit `Act` provenance objects for readable actions |
| `--compute` | **all of the above** |

```sh
thoughtml --compute doc.thml      # the full second reading
```

The [playground](../guides/playground.md) turns the display-relevant readings on
by default — so what you see in the browser is the mirror, live.

## Why opt-in

Two reasons:

1. **Stable output.** A document without derivations serializes byte-for-byte
   identically every time, which is what keeps the example corpus
   [strict-clean](../reference/diagnostics.md) and makes the CLI safe to diff in
   CI.
2. **Computed ≠ authored.** Every derived value lives in its *own* field, beside
   (never replacing) what you wrote. `derived_confidence` sits next to your
   authored `confidence`; `computed_quantity` next to your `quantity`. The mirror
   adds a reading; it never edits yours.

## The four readings, in one line each

- **Derived confidence** — *how strong* is this claim, given its evidence?
- **Argument status** — *does it survive* every attack?
- **Conflict report** — where do *your stated beliefs* and *your structure*
  disagree?
- **The compute layer** — quantities, formulas, and expected value as a *second
  reading of your numbers*.

The following pages explain how each is computed.
