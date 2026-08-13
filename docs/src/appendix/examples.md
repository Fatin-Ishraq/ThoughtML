# Example gallery

The reference implementation ships a corpus of twenty example documents in
[`examples/`](https://github.com/Fatin-Ishraq/ThoughtML/tree/main/examples).
Every one parses **strict-clean** (zero errors, zero warnings) under default
options—a test enforces it. A curated spine appears in the playground's example
tray; every file can also be opened directly in the project workspace.

Open any of them in the [playground](../guides/playground.md) to see the graph, or
run `thoughtml <file>` (add `--compute` for the second reading, `--audit` for the
mirror). The set is designed to span the language: many kinds and relations, both
mirror conflicts, the temporal layer, the compute layer, profiles, and imports —
across engineering, ops, medicine, science, business, product, security, and
AI-agent scenarios.

The repository also includes a six-file project under `examples/snake-project/`.
Its `project.thml` entry imports product, architecture, gameplay, quality, and
release modules into one graph. Use it to try the multi-file playground,
file/line provenance, live streaming, and inline expansion of imported
conclusions:

```sh
thoughtml stream examples/snake-project/project.thml
```

## Start here

| Example | What it teaches |
|---------|-----------------|
| [`ship-the-hotfix.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/ship-the-hotfix.thml) | A clean document the mirror still flags — the `confidence-vs-status` conflict. The flagship demo. |
| [`triage-742.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/triage-742.thml) | The canonical minimal document: noticed → question → suspects → hold-until. The smallest complete piece of reasoning. |
| [`weekend-plan.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/weekend-plan.thml) | The plainest shape: a goal, two options, and the pick — proof it reads naturally for low-stakes reasoning. |

## Arguments and decisions

| Example | What it teaches |
|---------|-----------------|
| [`pr-feedback.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/pr-feedback.thml) | `undercuts` (attack an inference) versus `opposes` (attack a claim) — the two distinct ways to push back. |
| [`hiring-panel.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/hiring-panel.thml) | Several interviewers on one call: shared evidence, different confidence, `because`, per-stance notes. |
| [`choose-datastore.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/choose-datastore.thml) | An ADR as a graph: options weighed, one rejected and kept `abandoned`, a blocking benchmark (`until`), the question `settled`. |
| [`differential-dx.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/differential-dx.thml) | A clinician's differential: competing hypotheses, `candidate-for` proposals versus the `answers` that resolves. |
| [`moderation-decision.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/moderation-decision.thml) | An AI moderation call emitted for a human to audit — the confidence and evidence made inspectable. |

## Time and memory

| Example | What it teaches |
|---------|-----------------|
| [`launch-readiness.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/launch-readiness.thml) | A belief revised twice as evidence lands; earlier versions `superseded`, not erased. Replay with `--as-of`. |
| [`assistant-memory.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/assistant-memory.thml) | An assistant's evolving memory: noticed, infers-from sources, remembers, revises, an unknown (`?`). |
| [`merge-conflict-beliefs.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/merge-conflict-beliefs.thml) | The second mirror conflict: two agents define one focus two ways — `definition-divergence`, kept losslessly. |

## Causes, collections, and everyday reasoning

| Example | What it teaches |
|---------|-----------------|
| [`prod-outage.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/prod-outage.thml) | A postmortem as an acyclic `causes`/`enables`/`prevents` graph, with nested scopes and `-by` attribution. |
| [`roadmap-priorities.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/roadmap-priorities.thml) | `part-of` for grouping (not evidence), and a question that contains its candidate options as a thought-tree. |
| [`bad-oyster.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/bad-oyster.thml) | Everyday causal reasoning: `suspects` a cause and `asks` the question that would settle it. |
| [`replication-study.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/replication-study.thml) | Weighing a scientific claim: a critique that `undercuts` a failed replication, with `measured`/`estimated` bases. |

## The compute layer

| Example | What it teaches |
|---------|-----------------|
| [`cloud-bill.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/cloud-bill.thml) | A cost model that computes itself: `= formulas` over line items with full unit-checking (USD/hour × hour = USD). |
| [`ship-or-hold.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/ship-or-hold.thml) | The whole compute layer in one decision: formula payoffs, a probability borrowed from derived confidence, EV ranking, and a what-if that flips it. |

## Dialects and modularity (advanced)

| Example | What it teaches |
|---------|-----------------|
| [`threat-model.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/threat-model.thml) | A `profile` declaring a security dialect — custom `threat`/`control` kinds, `mitigates`/`aggravates` relations, `likelihood`/`severity` fields, a `flags` posture. |
| [`control-library.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/control-library.thml) | A minimal importable library — the building block the rollout imports. |
| [`compliance-rollout.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/compliance-rollout.thml) | `import … as` and namespaced cross-document references. Run as a project with its library. |

## A walkthrough: `ship-the-hotfix.thml`

The most instructive example is the smallest interesting one:

```thml
focus hotfix-is-safe
  kind claim
  The payments hotfix is safe to ship to production now.

focus suite-is-green
  kind observation
  The full unit and integration suite passed on the release branch.

focus canary-errored
  kind observation
  The 5% canary threw a spike of HTTP 500s on checkout within ten minutes.

link suite-is-green supports hotfix-is-safe
link canary-errored opposes hotfix-is-safe

oncall holds hotfix-is-safe
  confidence 0.9 assumed
  note Shipping — the suite is green and the release window closes at 17:00.
```

Read it through the mirror:

- **Argument status.** `canary-errored` has no attackers → `in`. It `opposes`
  `hotfix-is-safe`, so `hotfix-is-safe` → `out` (defeated by its own recorded
  counter-evidence, even though a passing suite supports it).
- **Conflict.** The on-call holds the now-`out` claim at `0.9` (≥ 0.66) → a
  `confidence-vs-status` **error**.
- **Provenance.** That `0.9` is `assumed` — the mirror shows not just how sure the
  engineer is, but on what footing.

The document is structurally clean. The mirror surfaces the contradiction the
*form* can't — and leaves the call to you. That's ThoughtML in one screen.
