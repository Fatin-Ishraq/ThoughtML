# Example gallery

The reference implementation ships a corpus of example documents in
[`examples/`](https://github.com/Fatin-Ishraq/ThoughtML/tree/main/examples).
Every one parses **strict-clean** (zero errors, zero warnings) under default
options — a test enforces it. They double as the playground's example tray.

Open any of them in the [playground](../guides/playground.md) to see the graph, or
run `thoughtml <file>` (add `--compute` for the second reading).

## Start here

| Example | What it teaches |
|---------|-----------------|
| [`incident-742.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/incident-742.thml) | The canonical minimal document: noticed → question → suspects → hold-until. The smallest complete piece of reasoning. |
| [`self-audit.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/self-audit.thml) | A clean document the mirror still flags — the `confidence-vs-status` conflict. The flagship demo. |
| [`canonical-core.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/canonical-core.thml) | The same reasoning in the bare `focus`/`link`/`stance` core as in the readable surface — the two are equivalent. |

## Arguments and decisions

| Example | What it teaches |
|---------|-----------------|
| [`multi-agent-debate.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/multi-agent-debate.thml) | Several agents disagreeing over one hypothesis; supports/undercuts, `because`, per-stance `note`. |
| [`decision-record.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/decision-record.thml) | An ADR as a graph: question, considers/rejects/chooses/holds, a blocking benchmark (`until`). |
| [`ai-and-jobs.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/ai-and-jobs.thml) | A full multi-agent debate with graded evidence, `infers`, a blocking question, divergent stances. |
| [`why-harvard.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/why-harvard.thml) | A personal decision: four nested sub-scopes, options weighed by expected value, the downside kept on the record. |

## Time and memory

| Example | What it teaches |
|---------|-----------------|
| [`estimate-revised.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/estimate-revised.thml) | The temporal layer: a belief revised twice as evidence lands; drag the as-of slider to replay it. |
| [`agent-memory.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/agent-memory.thml) | An assistant's evolving memory: noticed, infers, remembers (with source + confidence), revises, an unknown (`?`). |

## The compute layer

| Example | What it teaches |
|---------|-----------------|
| [`capacity-plan.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/capacity-plan.thml) | Quantities across dimensions (req/s, ms, USD, GB, %) woven into a scale-up decision. |
| [`cost-model.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/cost-model.thml) | Formulas (`= expr`) computing over other foci with full unit-checking. |
| [`decision-ev.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/decision-ev.thml) | Decision expected value: options `leads-to` outcomes with probability and payoff, ranked by EV. |
| [`sensitivity-demo.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/sensitivity-demo.thml) | Leverage / what-if: evidence ranked by how load-bearing it is. |
| [`release-bet.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/release-bet.thml) | The whole compute layer in one decision: formula payoffs, a probability borrowed from derived confidence, EV ordering. |

## Structure and modularity (advanced)

| Example | What it teaches |
|---------|-----------------|
| [`nested-scope.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/nested-scope.thml) | Nested scopes with inherited `source`/`observed-at`, and a sub-scope overriding context. |
| [`shared-defs.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/shared-defs.thml) | A minimal importable library — the building block for the imports demo. |
| [`imports-demo.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/imports-demo.thml) | `import … as` and cross-document references by namespace. Run as a project. |
| [`profile-dialect.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/profile-dialect.thml) | A `profile` declaring a risk-analysis dialect (custom kinds/relations/fields/postures). |
| [`grand-tour.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/grand-tour.thml) | Everything at once: import + profile + nested scopes + quantities + formulas + EV + graded evidence + temporal revision. |

## A walkthrough: `self-audit.thml`

The most instructive example is the smallest interesting one:

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

Read it through the mirror:

- **Argument status.** `stale-reads` has no attackers → `in`. It `opposes`
  `cache-is-safe`, so `cache-is-safe` → `out` (defeated by its own recorded
  counter-evidence).
- **Conflict.** The agent holds the now-`out` claim at `0.9` (≥ 0.66) → a
  `confidence-vs-status` **error**.
- **Provenance.** That `0.9` is `assumed` — the mirror shows not just how sure the
  agent is, but on what footing.

The document is structurally clean. The mirror surfaces the contradiction the
*form* can't — and leaves the call to you. That's ThoughtML in one screen.
