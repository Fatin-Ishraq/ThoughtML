# The compute layer

*Flags: `--formulas`, `--decisions`, `--sensitivity` (or `--compute`).*

ThoughtML can compute over the numbers in a document — formulas, expected value,
sensitivity. This is the most powerful part of the mirror, and the one to be
most careful about framing:

> The compute layer is **a second reading of the author's numbers, not a program
> the document runs.** Every result is opt-in, lands in its own field, and never
> overwrites what you wrote.

## Quantities recap

A focus can carry an authored [`quantity`](../reference/numbers.md) — a number
with a unit, classified into a dimension and normalized to a base unit where
convertible. Quantities are the inputs the rest of this layer reads.

## Formulas

*`--formulas`.* A focus whose value is *computed* from other foci, written as a
`= <expr>` line:

```thml
focus hosting
  quantity 1200 USD
focus bandwidth
  quantity 300 USD
focus monthly-cost
  = hosting + bandwidth
```

- The expression supports references to other foci, numbers, quantities, the
  arithmetic operators `+ - * / ( )`, and functions like `min`/`max`/`sum`.
- Evaluation runs in **dependency order**, so a formula sees its inputs' computed
  values. A **dependency cycle** is detected and reported (never computed).
- **Full dimensional analysis**: you can multiply `USD/instance` by `instance`,
  but not add dollars to milliseconds — a dimension clash is a warning.
- The result lands in **`computed_quantity`**, presented in a human-friendly unit
  (`8 GB`, not `8e9 B`) and strictly separate from any authored `quantity`. A
  computed value has no [provenance basis](../reference/numbers.md#provenance) —
  it wasn't authored.

The bundled [`cost-model.thml`](../appendix/examples.md) is a full worked example.

## Decision expected value {#decision-expected-value}

*`--decisions`.* The capstone, composing quantities, formulas, and derived
confidence. The model:

- An **option** focus has `leads-to` edges to **outcome** foci.
- Each `leads-to` edge carries a `probability`; if it doesn't, the outcome's
  [derived confidence](derived-confidence.md) is used as a fallback.
- Each outcome carries a payoff — its `computed_quantity` if a formula produced
  one, else its authored `quantity`.

Then:

```
expected_value(option) = Σ  probability · payoff
```

with full dimensional checking (you can't average dollars with milliseconds). A
**decision** focus, named by `option-of` edges, gets its options **ranked by
expected value, highest first**. Each option also reports its `downside` (the
worst-case payoff) and `probability_mass` (Σ probability).

```thml
link harvard option-of where-to-go
link harvard leads-to harvard-thrive
  probability 0.7
link harvard leads-to harvard-coast
  probability 0.3
```

> **It ranks; it does not crown.** There is deliberately **no `best` option and
> no `margin`.** The mirror reports the expected values, ordered, with each
> option's downside — and leaves the choice to you. Decisions are about risk, not
> just the mean, and the call is yours. See
> [`decision-ev.thml`](../appendix/examples.md) and
> [`why-harvard.thml`](../appendix/examples.md).

Diagnostics (never errors) flag the gaps: an outcome with no payoff, a `leads-to`
with no probability and no derived confidence, mixed dimensions, or an authored
probability mass over 1.

## Sensitivity (leverage) {#sensitivity}

*`--sensitivity`.* How **load-bearing** is each piece of evidence? For each
evidence edge `e` into target `T`:

```
leverage(e) = derived(T) − derived_without_e(T)
```

It recomputes the target's [derived confidence](derived-confidence.md) with that
one edge removed (a target left with no evidence falls to the neutral 0.5), and
records the difference. **Positive** leverage means `e` props the target up (a
support); **negative** means it drags it down (an attack); the **magnitude** is
how much the conclusion rests on that single edge.

`leverage` is set on each evidence link. The bundled
[`sensitivity-demo.thml`](../appendix/examples.md) ranks evidence by it.

## What-if (playground only)

The same propagation engine powers an interactive what-if: in the playground you
can **mute** a node or link and watch the whole stack — derived confidence,
status, leverage, expected value — recompute live. The CLI never perturbs; it
reports the document as authored. (Leverage is essentially single-edge what-if,
precomputed for every edge at once.)
