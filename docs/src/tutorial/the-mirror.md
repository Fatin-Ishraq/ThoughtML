# 7. The mirror — reading the conflict

Here is our finished document. This is
[`pour-the-slab.thml`](../appendix/examples.md) exactly as it ships — the bodies
are fuller than the ones we typed along the way, and nothing else has changed:

```thml
focus conditions-are-fine
  kind claim
  Conditions on site are fine to pour the foundation slab this afternoon.

focus truck-is-booked
  kind observation
  The ready-mix truck is booked for 14:00 and the full crew is on site.
  source site-diary
  observed-at 2026-03-11

focus overnight-freeze
  kind observation
  The site thermometer logged minus four degrees from 02:00 to 06:00, and tonight's
  forecast repeats it. Fresh concrete that freezes before it sets never recovers.
  source site-diary
  observed-at 2026-03-11

link truck-is-booked supports conditions-are-fine
link overnight-freeze opposes conditions-are-fine

site-engineer holds conditions-are-fine
  confidence 0.88 assumed
  note Pouring today. The truck is booked and the crew moves to another job Thursday.
```

## It is clean

Run it normally:

```sh
thoughtml pour-the-slab.thml
```

No errors. No warnings. Every reference resolves, nothing contradicts at the
*form* level, nothing is orphaned. By every structural check, this document is
fine.

## But the structure disagrees with the author

Now turn on the **mirror** — the opt-in second reading:

```sh
thoughtml --audit pour-the-slab.thml
```

The canonical JSON now carries an `audit` section:

```json
"audit": {
  "conflicts": [
    {
      "kind": "confidence-vs-status",
      "severity": "error",
      "subjects": ["site-engineer-holds-conditions-are-fine", "conditions-are-fine"],
      "message": "`site-engineer` asserts confidence 0.88 in `conditions-are-fine`, but your own structure defeats it (argument status: out)"
    }
  ]
}
```

Read what happened. The engineer holds `conditions-are-fine` at **0.88**. But the document
*also* records `overnight-freeze opposes conditions-are-fine`. When the mirror computes the
[argument status](../mirror/argument-status.md), `conditions-are-fine` comes out
**`out`** — defeated by its own recorded counter-evidence. The agent wrote down
the objection, then shipped anyway.

That's the conflict: **high confidence in a claim the structure defeats.** And
the `0.88` declared itself `assumed` — so the mirror shows not just *how sure* the
agent is, but *on what footing*.

## The mirror reports; it does not decide

Notice what ThoughtML did **not** do. It didn't lower the confidence. It didn't
veto the ship. It didn't tell the team they were wrong — maybe the stale reads
are acceptable, maybe the opposition is weak. It surfaced the disagreement
between what was *said* (0.88) and what the *structure implies* (defeated), and
left the call to a human.

This is the whole philosophy in one example: **a mirror, not an oracle.**

## The rest of the second reading

`--audit` is one of several opt-in readings. The catch-all flag turns them all
on:

```sh
thoughtml --compute conditions-are-fine.thml
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
