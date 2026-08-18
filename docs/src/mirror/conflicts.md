# Conflict reports

*Flag: `--audit` (or `--compute`).*

The conflict report is the mirror's flagship: it surfaces where **what you
asserted** disagrees with **what your own structure implies**. It ships the
conflict; it never auto-corrects.

## A separate channel

Conflicts are *not* [diagnostics](../reference/diagnostics.md). Diagnostics judge
a document's **form** (is it well-formed?). Conflicts judge its **coherence** (do
your beliefs hang together?). A document can be perfectly strict-clean and still
carry a conflict — that's the interesting case. So conflicts ride their own
channel, in an `audit` section, and never affect strict parsing.

```json
"audit": {
  "conflicts": [
    { "kind": "confidence-vs-status", "severity": "error",
      "subjects": ["site-engineer-holds-conditions-are-fine", "conditions-are-fine"],
      "message": "`site-engineer` asserts confidence 0.88 in `conditions-are-fine`, but your own structure defeats it (argument status: out)" }
  ]
}
```

Each conflict has a `kind`, a `severity` (`error` or `warning`), the `subjects`
it concerns, and a human-readable `message`. That output is
[`examples/pour-the-slab.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/pour-the-slab.thml)
run with `--audit`, verbatim.

## `confidence-vs-status`

It compares each authored stance's **confidence** against the grounded
[argument status](argument-status.md) of its target. Two cases fire:

| Condition | Severity | Reading |
|-----------|----------|---------|
| target is `out` **and** confidence ≥ 0.66 | **error** | high credence in a claim the structure *defeats* |
| target is `in` **and** confidence ≤ 0.34 | **warning** | low credence in a claim that *survives every attack* |

(A confidence range is taken at its midpoint. Stances on targets that don't take
part in the attack graph are not compared.)

The first case is the flagship — you wrote down the objection and believed the
claim anyway. The second is the inverse tell — you're underweighting something
your own evidence upholds.

## It reports; it does not decide

This is worth stating plainly, because it's the whole design. When the mirror
finds a `confidence-vs-status` conflict, it does **not**:

- lower your confidence,
- flip the argument status,
- or tell you which one is right.

Maybe the structure is incomplete (a missing rebuttal would change the status).
Maybe the confidence is the honest number and the structure overstates the
attack. The mirror can't know — *you* do. It just makes the disagreement
impossible to miss.

## What it cannot see

The mirror checks a document against **itself**, never against the world. A
falsification pass (`crates/thoughtml/tests/falsification.rs`) pins the boundary,
and it is worth knowing precisely, because everything inside it is trustworthy
only if you know where it ends.

These produce an empty conflict report and confident-looking numbers:

| Error | What happens |
|---|---|
| **A false premise** | `earth-is-flat supports maps-are-wrong` is valid reasoning from nonsense. The conclusion derives ≈0.73. |
| **One fact entered twice** | Two ids for one observation both support a claim. Independence is assumed, so it compounds to ≈0.96. |
| **Evidence never written down** | Omit the two failed trials and the graph is coherent at ≈0.86. |

There is a fourth that *is* visible in the graph, and so is caught — but only if
you ask. `a supports b` and `b supports a` derive above 0.5 for both, from no
outside evidence at all. `thoughtml check <file> --lint` reports that as
[`TML502`](../reference/diagnostics.md), off by default like every modelling lint.

The first three are not bugs waiting to be fixed. They are the limit of what any
self-consistency check can reach, and they are exactly why the mirror reports
rather than decides. **The part it cannot do is yours: write down the evidence
that cuts against you.**

The bundled [`pour-the-slab.thml`](../appendix/examples.md) exists precisely to
demonstrate this: clean document, real conflict, no verdict.

## `definition-divergence`

The second conflict type catches a different kind of disagreement: the same focus
**defined more than once with differing content**.

```json
{ "kind": "definition-divergence", "severity": "warning",
  "subjects": ["launch-date"],
  "message": "`launch-date` is defined more than once with differing content; all 2 definitions are kept" }
```

Ordinarily a repeated focus id [merges](../reference/foci-and-kinds.md#merging)
(first-wins on body / quantity / formula). But when a later mention states a
*genuinely different* value, ThoughtML does **not** drop it — every alternative is
retained on the focus's `divergent` list, and this conflict points at the
disagreement. It's the lossless-authoring tell: two agents (or two of your own
passes) wrote down incompatible versions of the same thing, and the mirror asks you
to reconcile them rather than picking one silently.

## More conflict types are coming

`confidence-vs-status` and `definition-divergence` are the first two. The conflict
report is built as an extensible channel; future readings (calibration drift,
numeric inconsistency, stale beliefs) will land here as additional `kind`s — each
one a disagreement surfaced, never a decision made.
