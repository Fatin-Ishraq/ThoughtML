# 7. The mirror — reading the conflict

Here is our finished document. It's the bundled example
[`self-audit.thml`](../appendix/examples.md):

```thml
focus cache-is-safe
  kind claim
  The new cache layer is safe to ship today.

focus load-test-passed
  kind observation
  Load test at 2x peak traffic passed with no errors.

focus stale-reads
  kind observation
  Staging showed stale reads under cache eviction.

link load-test-passed supports cache-is-safe
link stale-reads opposes cache-is-safe

ops-agent holds cache-is-safe
  confidence 0.9 assumed
  note Shipping — the load test passed.
```

## It is clean

Run it normally:

```sh
thoughtml self-audit.thml
```

No errors. No warnings. Every reference resolves, nothing contradicts at the
*form* level, nothing is orphaned. By every structural check, this document is
fine.

## But the structure disagrees with the author

Now turn on the **mirror** — the opt-in second reading:

```sh
thoughtml --audit self-audit.thml
```

The canonical JSON now carries an `audit` section:

```json
"audit": {
  "conflicts": [
    {
      "kind": "confidence-vs-status",
      "severity": "error",
      "subjects": ["ops-agent-holds-cache-is-safe", "cache-is-safe"],
      "message": "`ops-agent` asserts confidence 0.90 in `cache-is-safe`, but your own structure defeats it (argument status: out)"
    }
  ]
}
```

Read what happened. The agent holds `cache-is-safe` at **0.9**. But the document
*also* records `stale-reads opposes cache-is-safe`. When the mirror computes the
[argument status](../mirror/argument-status.md), `cache-is-safe` comes out
**`out`** — defeated by its own recorded counter-evidence. The agent wrote down
the objection, then shipped anyway.

That's the conflict: **high confidence in a claim the structure defeats.** And
the `0.9` declared itself `assumed` — so the mirror shows not just *how sure* the
agent is, but *on what footing*.

## The mirror reports; it does not decide

Notice what ThoughtML did **not** do. It didn't lower the confidence. It didn't
veto the ship. It didn't tell the team they were wrong — maybe the stale reads
are acceptable, maybe the opposition is weak. It surfaced the disagreement
between what was *said* (0.9) and what the *structure implies* (defeated), and
left the call to a human.

This is the whole philosophy in one example: **a mirror, not an oracle.**

## The rest of the second reading

`--audit` is one of several opt-in readings. The catch-all flag turns them all
on:

```sh
thoughtml --compute self-audit.thml
```

That adds [derived confidence](../mirror/derived-confidence.md) (how strong each
claim is, propagated through the evidence), argument status on every node,
per-edge [leverage](../mirror/compute.md#sensitivity), and — for documents with
decisions — [expected value](../mirror/compute.md#decision-expected-value). The
[playground](../guides/playground.md) turns these on by default, so you see them
live.

## Where to go next

- The **[Language Reference](../reference/index.md)** documents every record,
  relation, posture, field, and diagnostic precisely.
- **[The Mirror](../mirror/index.md)** explains how each reading is computed.
- The **[Use cases](../guides/use-cases.md)** guide shows where this pays off:
  decision records, design reviews, agent reasoning a human can audit.
