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
      "subjects": ["ops-agent-holds-cache-is-safe", "cache-is-safe"],
      "message": "`ops-agent` asserts confidence 0.90 in `cache-is-safe`, but your own structure defeats it (argument status: out)" }
  ]
}
```

Each conflict has a `kind`, a `severity` (`error` / `warning` / `info`), the
`subjects` it concerns, and a human-readable `message`.

## The one conflict type in v0.1.0: `confidence-vs-status`

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

The bundled [`self-audit.thml`](../appendix/examples.md) exists precisely to
demonstrate this: clean document, real conflict, no verdict.

## More conflict types are coming

`confidence-vs-status` is the first. The conflict report is built as an extensible
channel; future readings (calibration drift, numeric inconsistency, stale beliefs)
will land here as additional `kind`s — each one a disagreement surfaced, never a
decision made.
