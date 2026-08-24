# Luna multi-stage handoff test v1

This is an **exploratory existence test**, not a confirmatory benchmark and not
evidence by itself that ThoughtML improves reasoning generally. It is isolated
from the frozen v2.6 Terra pilot: none of these files belongs to that manifest,
and none of its outputs may be pooled with Experiment 0.

## Question

Can a persistent ThoughtML ledger help fresh Luna sessions preserve, revise,
and branch a dependent calculation more reliably than conventional Markdown
notes containing the same task facts?

The task is a five-stage Bayesian decision problem. Stage 3 corrects an earlier
likelihood, forcing downstream conclusions to be superseded. Stage 5 introduces
a counterfactual that must remain separate from the corrected main branch.

## Design

- Model: `gpt-5.6-luna`, reasoning effort `high`.
- Conditions: `thoughtml` and `markdown`.
- Five fresh, ephemeral model sessions per condition; ten calls total.
- Fixed order: complete the ThoughtML pipeline, then the Markdown pipeline.
- Every session sees the task facts revealed so far and only the prior session's
  raw ledger. It does not receive hidden answers or the other condition's output.
- Both arms receive short, format-specific instructions. ThoughtML uses only the
  validated language subset needed here; the full specification is hashed for
  provenance but is not repeated in every prompt.
- A malformed ledger is passed forward unchanged. It is never repaired by the
  harness or a human.
- Tools are forbidden; any tool event makes that stage unusable.
- The first usable response is measured. No outcome-based retry is permitted.

The fixed order is operationally simple but allows time/order effects. This is
acceptable for an exploratory example and must be disclosed; a later replicated
study should counterbalance condition order across tasks.

## Outcomes

The deterministic grader reports:

1. new-checkpoint and cumulative-checkpoint accuracy at each handoff;
2. final main-branch and counterfactual accuracy;
3. ThoughtML parse/strict/lint status or Markdown ledger-header compliance;
4. whether explicit ThoughtML `revises` links preserve the correction history;
5. exclusions, tool events, retries, latency, and token usage.

Prompt bytes are reported because the two representations are not exactly the
same length. Candidate validation requires the ThoughtML prompt to remain below
twice the matched Markdown prompt at every stage.

An illustrative ThoughtML win requires all ThoughtML checkpoints to be correct
and at least one matched Markdown dependency, revision, or branch-separation
failure. If both pipelines succeed, this task shows no accuracy advantage. If
both fail, the workflow is too difficult or unclear. Any result remains a single
example until replicated on disjoint tasks.

## Safety state

The project author explicitly instructed `call it` on 2026-08-21. That approval
is recorded in `protocol.json` before authoritative freezing and before any Luna
handoff response. The runner still requires a clean frozen manifest, a
collectable regenerated schedule, and an explicit `--execute` flag.

## Local commands

```powershell
python study/exploratory/luna_handoff_v1/handoff.py validate
python study/exploratory/luna_handoff_v1/handoff.py freeze --candidate
python study/exploratory/luna_handoff_v1/handoff.py schedule
python study/exploratory/luna_handoff_v1/handoff.py run --dry-run
python -m unittest study/exploratory/luna_handoff_v1/test_handoff.py -v
```

## Preserved output status

All ten authorized calls are preserved in the versioned study-data archive
documented at [`../../data/README.md`](../../data/README.md). The current lexical
grader does not semantically normalize labelled posterior-vector entries such as
`R1=2/9`; therefore its numerical ThoughtML-versus-Markdown comparison is not a
paper result. The raw ledgers remain authoritative while normalization and
reanalysis are pending.
