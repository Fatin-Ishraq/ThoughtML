# Derived confidence

*Flag: `--derived` (or `--compute`).*

Derived confidence answers **"how strongly does the evidence back this claim?"**
— computed by propagating belief through the evidence graph, independent of any
confidence you authored.

## The model

Every evidence edge — `supports`, `opposes`, `undercuts` — pointing at a target
contributes to its strength. For a target with incoming edges:

```
sum     = Σ  polarity · weight · believedness(source)
derived = logistic(2 · sum)
```

where:

- **polarity** is `+1` for `supports`, `−1` for `opposes` / `undercuts`.
- **weight** is the link's `weight`, or `0.5` if none is given.
- **believedness(source)** is how much the source itself is believed: its *own*
  derived confidence if it has one (so belief propagates transitively), else its
  authored confidence, else `1.0` (an unqualified assertion counts as given).
- **logistic(x)** = 1 / (1 + e⁻ˣ), squashing the sum into 0..1.

The gain constant `2` is chosen so that a single strong support (weight 0.85,
fully-believed source) lands the target at ≈0.85. A target with no net evidence
sits at `logistic(0) = 0.5` — the neutral point.

## Propagation order

Belief flows in **topological order** (Kahn's algorithm) over the evidence graph,
so a conclusion is computed *after* its premises — it sees their *derived*
strength, not just their authored confidence. Any nodes left on an evidence
**cycle** are resolved once, in declaration order, as a documented best-effort.

The computation is **pure and deterministic**: same inputs, same output, every
time.

## Authored belief

The "believedness" of an authored node is the mean midpoint of the
**non-superseded** stances that target it and carry a confidence (a range counts
at its midpoint). A belief that's been [revised](../tutorial/time.md) no longer
counts as live evidence.

## Undercutting an inference

`undercuts` has a power `opposes` doesn't. When an `undercuts` edge targets a
**link** (an inference rather than a claim), it doesn't push the node down —
instead it *weakens that connection*. Each undercut leaves the inference at a
fraction of its strength: an undercut with `weight 0.85` leaves `1 − 0.85 = 0.15`
of it. Multiple undercuts multiply. With no inference-undercut present, every
weight is untouched and the output is identical to the simple model above.

## Where it appears

`derived_confidence` is set on every focus and link that is the *target* of
evidence, rounded to three decimals, e.g.:

```json
{ "type": "focus", "id": "displacement-hypothesis",
  "derived_confidence": 0.94 }
```

In the playground, it shows in the detail panel **beside** your authored
confidence — two bars, never merged. On the bundled
[`ai-and-jobs.thml`](../appendix/examples.md), the displacement hypothesis lands
≈0.94 while the optimist's rebuttal comes out ≈0.22, several hops deep.
