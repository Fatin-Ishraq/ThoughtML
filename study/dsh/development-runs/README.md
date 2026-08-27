# Development runs

**These are not study results.** Every session here was run during development, on
substitute models, before the frozen protocol was ever executed. The protocol
excludes them from every outcome, and nothing in this directory may be pooled with
registered data.

They are published because the claims in [`../../README.md`](../../README.md) §4
are derived from them, and a claim whose evidence is not in the repository is a
claim a reader has to take on trust.

## Re-derive the numbers yourself

```bash
python3 verify_claims.py
```

That script reads only the files in this directory and recomputes every figure
quoted in the study README. It does not contact a model or a network.

## What is here

| per-run file | what it is |
|---|---|
| `metrics-summary.json` | the session's own counters: model calls, steps, tool calls, token classes, state counters |
| `ledger/` | what the model actually wrote — `final.thml`/`final.md` plus each committed revision |
| `state-commits.jsonl` | one line per attempt to save a reasoning record: whether it was accepted, the checker's verdict, and the diagnostics it returned |
| `model.patch` | the code the agent produced, where the session got that far |

[`index.json`](index.json) lists every run with its condition, model route, and
counts.

## The runs

| run | condition | model | note |
|---|---|---|---|
| `smoke-01`, `smoke-02` | M, T | deepseek-v4-flash | synthetic task, plugin wiring shakedown |
| `dryrun-INVALID` | D | deepseek-v4-flash | **invalidated** — see below |
| `probe-01`, `probe-02` | T | deepseek-v4-flash | truncated step budget |
| `glm-5.2` | T | z-ai/glm-5.2:free | single probe |
| `minimax-m3` | T | minimax/minimax-m3:free | single probe |
| `laguna-s-2.1` | T | poolside/laguna-s-2.1:free | single probe |
| `ox-alpha-probe` | T | stealth/ox-alpha | short probe |
| `ox-alpha-full` | T | stealth/ox-alpha | full 102-step session |
| `sweep-D`, `sweep-M`, `sweep-T` | D, M, T | stealth/ox-alpha | the one three-condition sweep |

### Why one run is named INVALID

`dryrun-INVALID` ran before DSH's web-search tool was disabled. The benchmark
publishes its reference solutions on GitHub, and sessions retrieved the exact
`solution.patch` for the task. The run is kept under that name rather than deleted,
because a discarded run and the reason it was discarded are both part of the record.
The fix is in the adapter: `_render_patch()` disables `web`, `web-search-deepseek`,
`tool-web`, `tool-todo` and `tool-goal`.

## What the evidence shows, and what it does not

Reading `state-commits.jsonl` across all runs gives 24 attempts to save a reasoning
record: 13 accepted, 9 refused by the checker as malformed, 2 lost to tool errors.
All 9 refusals were followed by an accepted save, 8 of them on the very next
attempt. The `ox-alpha-full` sequence alternates cleanly — refused, fixed, refused,
fixed, refused, fixed, refused, fixed.

The rejection codes are `TML201` (a reference pointing at a node that does not
exist), `TML301` (a node connected to nothing), `MD_MISSING_SECTION` (the Markdown
arm, missing a required section) and `THOUGHTML_DIAGNOSTIC` (a confidence written
as `0.95 evidenced` rather than a bare number). The Markdown arm being rejected too
matters: both formats were held to a schema, so condition T was not uniquely
burdened.

**None of this shows that the reasoning record changed what the agent decided.**
It shows the record was checkable, that the checker caught real structural errors,
and that models repaired them rather than giving up. Whether keeping such a record
changes agent behaviour is what the frozen nine-session protocol is for, and that
has not been run.

## Provenance

Extracted from the execution host with the script recorded in the commit that
added this directory. The full session trees — container build contexts, verifier
output, raw session event logs, roughly 199 MB — remain on the execution host and
are not published; nothing here has been edited, only selected and copied.
