# DeepSWE v1.1 task selection for the DSH agent-utility case study

**Date:** 2026-08-25
**Status:** Candidate proposed. Nothing is frozen. **Zero model calls were made.**
**Scope:** Selects one task for the exploratory single-task D/M/T case study
described in [`../../dsh-agent-utility-amendment.md`](../../dsh-agent-utility-amendment.md).

This directory is a reproducible record, not a result. It contains the published
benchmark data the selection used, the criteria, the script that re-derives the
shortlist, and hashes of all of it.

```bash
git clone --depth 1 https://github.com/datacurve-ai/deep-swe
python collect_trials.py      # re-fetch the published trial data
python build_task_index.py    # join trials with task metadata
python select_candidate.py    # re-derive the shortlist and candidate
```

---

## 1. Benchmark change: SWE-bench Verified to DeepSWE v1.1

The amendment (§3) still names SWE-bench Verified. This selection targets
**DeepSWE v1.1** instead. That substitution is **not yet an approved amendment**
and must be recorded as a dated deviation before any collection.

Why DeepSWE v1.1 fits the agent-utility question better:

| Property | Relevance |
|---|---|
| 113 original tasks, written from scratch, 91 repos, 5 languages | Reduces (does not eliminate) the contamination exposure disclosed in amendment §3. |
| Behavioural verifiers, not implementation-detail assertions | Accepts any correct solution, so condition differences are not confounded by structural conformity. |
| Isolated agent container plus **separate** pristine verifier container (v1.1) | Grading is independent of the agent's runtime, which matters because M and T add files to that runtime. |
| CTRF per-test reports | Gives a continuous secondary outcome (fail-to-pass fraction) with far lower variance than binary pass. |
| Published per-trial steps, tokens, cost, duration | Our ARQ2/ARQ5 measures become comparable against a public reference. |
| Published `deepseek-v4-flash` results at 53% | Flash is capable enough to succeed and weak enough to fail and recover. |

Sources: [deepswe.datacurve.ai](https://deepswe.datacurve.ai/),
task repo [datacurve-ai/deep-swe](https://github.com/datacurve-ai/deep-swe)
(Apache-2.0, commit `435ee89ec2f2e2289f33b0da4f992f0b7b7266b9`),
runner [datacurve-ai/pier](https://github.com/datacurve-ai/pier).

## 2. Data and its validation

`data/deepswe-v1.1-trials.jsonl.gz` holds **28,010 published v1.1 trial records**
covering all 113 tasks and 62 model/effort configurations, extracted from the
server-rendered payload of each public task page. Every configuration has exactly
4 trials per task.

The extraction is validated against the published leaderboard:

> `deepseek-v4-flash` = **241/452 = 53.3% pass@1**, against the site's reported
> **53% ± 4%**.

Because per-task Flash results come in fours, each task carries a published Flash
difficulty of 0/4, 1/4, 2/4, 3/4, or 4/4:

| Flash passes | 0/4 | 1/4 | 2/4 | 3/4 | 4/4 |
|---|---|---|---|---|---|
| tasks | 22 | 16 | **23** | 29 | 23 |

## 3. Selection criteria (hypothesis-neutral, fixed before selection)

| | Criterion | Rationale |
|---|---|---|
| C1 | Flash passes exactly **2 of 4** published trials | Maximum-variance interior point. Rules out the **ceiling effect that invalidated both Terra calibration pilots**, and the symmetric floor effect. |
| C2 | **Zero** `excluded_error` trials across all 248 v1.1 trials for the task | Excludes tasks with broken dependencies, container faults, or verifier errors. |
| C3 | **Zero** pass-to-pass regressions across the four Flash trials | The held-out regression suite is not flaky under this model. |
| C4 | Compressed agent image ≤ 1000 MB | The evaluation host is resource-constrained. |
| C5 | Mean Flash agent steps in [100, 200] | Long-horizon enough that persistent state could matter; short enough to run three conditions inside budget. |

None of these reference ThoughtML, reasoning structure, or anything that could
favour condition T over condition M. 23 tasks meet C1; **5 survive C1–C5**.

## 4. Shortlist

| task | lang | image MB | steps | dur s | f2p | p2p | all-model pass |
|---|---|---|---|---|---|---|---|
| **cattrs-partial-structuring-recovery** | python | 760.5 | 158 | 1341 | 69 | 7 | 0.64 |
| tengo-callable-instance-isolation | go | 767.8 | 122 | 1253 | 23 | 122 | 0.63 |
| dateutil-rfc5545-timezone-interop | python | 768.1 | 133 | 1229 | 67 | 2035 | 0.41 |
| obsidian-linter-link-format-conversion | typescript | 838.4 | 111 | 1164 | 60 | 1131 | 0.27 |
| httpx-multipart-response-parsing | python | 899.0 | 119 | 1279 | 122 | 1272 | 0.59 |

The deterministic tiebreak (smallest image, then fewest steps, then name) selects
the first row.

## 5. Recommended candidate

### `cattrs-partial-structuring-recovery`

| | |
|---|---|
| Repository | [python-attrs/cattrs](https://github.com/python-attrs/cattrs) |
| Base commit | `6bc4708fb9b2ac52d9a18997e923da6a58916102` |
| Language / category | Python / feature_request |
| Image | `public.ecr.aws/d3j8x8q7/swe-bench-202605:kh7f7cahc5ddm1qzpxz13kpmrh8235pc-v1.1` (760.5 MB compressed) |
| Declared container | 2 CPU, 8192 MB RAM, 20480 MB disk |
| Agent budget | 5400 s (Flash mean 1341 s, max observed 1680 s — comfortable headroom) |
| Agent network | `no-network` (Pier allowlist required for the model API) |
| Verifier | separate pristine container, 1800 s, `no-network` |
| Tests | 69 fail-to-pass, 7 pass-to-pass |
| Published Flash | 2/4 pass, mean 158 steps, mean $0.40, peak context ~175k |
| Across all 25 models | 0.64 pass; 4 models always pass, 1 never passes |

**The four published Flash trials:**

| outcome | fail-to-pass | pass-to-pass | steps | output tok | duration | cost |
|---|---|---|---|---|---|---|
| fail | 68/69 | 7/7 | 210 | 139k | 1680 s | $0.58 |
| pass | 69/69 | 7/7 | 159 | 89k | 1129 s | $0.38 |
| fail | 67/69 | 7/7 | 124 | 91k | 1400 s | $0.33 |
| pass | 69/69 | 7/7 | 137 | 82k | 1156 s | $0.31 |

### Why this task

1. **It sits exactly on the interior point (C1).** Both prior Terra pilots died of
   a ceiling effect. A task at 2/4 cannot be at ceiling or floor for this model.
2. **Failures are near-misses, not collapses.** Both failures missed 1–2 of 69
   tests with the regression suite fully intact. The failure mode is *a missed
   requirement*, which is diagnosable, rather than an unrecoverable dead end.
3. **The instruction is a dense checklist of roughly ten independently testable
   requirements** — `PartialResult` shape, absent-versus-failed semantics,
   default fallbacks, recursive nested partials, atomic collection failure,
   `refine()`, `init=False` exclusion, `forbid_extra_keys`, `detailed_validation`,
   three supported class kinds, and the export. This gives the human-coded
   outcomes in amendment §6 something concrete to score per requirement: goal
   drift, superseded belief, and unresolved contradiction all become checkable
   against a known requirement list.
4. **Cheapest, fastest loop in the shortlist.** Pure-Python library, smallest
   image, focused pytest runs, only 7 pass-to-pass tests. Most agent steps per
   unit of wall-clock and cost.
5. **Most legible language for the blinded auditability sub-study (§7).**
   Reviewers can judge a Python converter far more easily than Go VM internals.

**Runner-up:** `tengo-callable-instance-isolation`. Its advantage is a much
stronger regression suite (122 pass-to-pass tests versus 7), so collateral
breakage would be detected far more reliably. Its disadvantages are that the
requirements are one entangled design problem rather than a checklist (weaker
signal for the goal-drift outcome) and that Go VM internals are harder to
blind-review. Pick tengo instead if regression sensitivity matters more than
requirement-tracking legibility.

**Disclosed selection caveat.** Criteria C1–C5 are hypothesis-neutral, but
reason 3 above is a *post-hoc observation* about why this task is interesting for
ThoughtML, and it did influence my recommendation over the runner-up. That is
acceptable for an exploratory case study and is exactly why this task must be
**permanently barred from the confirmatory pilot and main samples** (amendment
§3), regardless of what the case study shows.

## 6. How DSH runs inside DeepSWE / Pier

DeepSWE is executed by [Pier](https://github.com/datacurve-ai/pier). Published
leaderboard numbers come from Pier driving `mini-swe-agent` on Modal. **DSH is
not one of Pier's built-in agents** (`nop`, `oracle`, `antigravity-sdk`,
`claude-code`, `codex`, `cursor-cli`, `gemini-cli`, `opencode`, `mini-swe-agent`).

Pier supports custom agents as a first-class feature, so **no fork is required**:

- `pier run --agent-import-path 'module.path:ClassName'` is a supported CLI
  option (`src/pier/cli/jobs.py`), backed by
  `AgentFactory.create_agent_from_import_path`.
- A DSH adapter subclasses `BaseAgent` / `BaseInstalledAgent` and implements a
  small surface: `name()`, `version()`, `setup()`, `run()`, plus optional
  `install_spec()` and `network_allowlist()`.
- `install_spec()` returns build-time Dockerfile steps layered onto the task
  image. This is how `codex.py` installs Node and `npm install -g @openai/codex`.
  The DSH adapter does the same for Node ≥ 22 and the pinned
  `@deepseek-ai/dsh@0.1.1-rc.2`, plus the ThoughtML plugin from
  `integrations/dsh`. **Install happens at build time with network; the agent
  then runs `no-network` except for the allowlist.**
- `network_allowlist()` returns the runtime domains the agent may reach. Codex
  defaults to `api.openai.com`; the DSH adapter returns the DeepSeek API host.
  Both the `docker` and `modal` environments honour allowlists under
  `allow_internet = false`.

### Three integration gates that are not yet resolved

1. **State must live outside `/app`.** The verifier collect hook is
   `cd /app && git diff --binary <base> HEAD > /logs/artifacts/model.patch`, and
   the instruction tells the agent to "commit everything when you are done."
   Any ThoughtML or Markdown ledger written under `/app` would be **committed
   into the graded patch**, making M and T produce structurally different patches
   from D and tripping the verifier's out-of-scope path signal. The plugin's
   state root must be forced outside the repository (for example `/opt/tml-state`)
   and this must be asserted in a pre-flight check, not merely configured.
2. **Step and token accounting.** Pier's `n_agent_steps`, token, and cost fields
   come from ATIF trajectory conversion (`SUPPORTS_ATIF`). A DSH adapter must
   either convert DSH's persisted session JSONL into Pier's trajectory model, or
   set `SUPPORTS_ATIF = False` and rely on the study's own metrics collector. The
   first makes our numbers comparable to the leaderboard; the second is faster to
   build. This choice must be made before the freeze because ARQ2 and ARQ5 depend
   on it.
3. **Base image toolchain.** Task images derive from `mars-base` and are built
   per language; the cattrs image is Python-based and Node is not guaranteed to be
   present. The install spec must install Node itself, as `codex.py` does.

### Execution host

Re-verified on this machine today: **Docker CLI missing; WSL2 registered but its
Ubuntu `ext4.vhdx` is absent; 9.7 GB free on C: (down from 12.04 GB at the
2026-08-24 audit)**. Local execution remains infeasible, and free disk has
shrunk below one uncompressed task image plus its verifier container. The
realistic route is `pier run --env modal`, which is what produced the published
leaderboard, or a repaired Linux/Docker host.

## 7. Scientific warnings that must survive into the write-up

- **One task, three sessions, is a case study.** It cannot support a claim about
  ThoughtML's effect on agent success.
- **At 2/4 the binary outcome is nearly pure noise.** Flash itself flips on this
  task. A single run per condition has no power to detect a success difference;
  three conditions differing by one pass/fail is fully consistent with chance.
  If success is to be readable at all, the case study needs **repetitions per
  condition** (the amendment already anticipates repetitions and clustering in
  §9). Otherwise the readable outcomes are the lower-variance process measures:
  fail-to-pass fraction, steps, repeated failed actions, recovery latency, tokens,
  checkpoint compliance, and the auditability sub-study.
- **Adaptive task selection is not confirmatory.** Choosing later tasks after
  seeing this one's outcome is fine for exploration and fatal for an unbiased
  benchmark claim. This task is permanently excluded from the pilot and main
  samples either way.
- **Contamination is reduced, not eliminated.** DeepSWE tasks are original, but
  the underlying repositories are public.

## 8. Files

| file | what |
|---|---|
| `collect_trials.py` | fetches published v1.1 trial records for all 113 tasks |
| `build_task_index.py` | joins trials with `task.toml` metadata into one row per task |
| `select_candidate.py` | applies C1–C5 and prints the shortlist and candidate |
| `write_provenance.py` | regenerates `data/provenance.json` |
| `data/deepswe-v1.1-trials.jsonl.gz` | 28,010 published trial records |
| `data/deepswe-v1.1-task-index.json` | 113 joined task rows |
| `data/deepswe-v1.1-image-sizes.json` | compressed image size per task, from the public registry |
| `data/provenance.json` | sources, validation, and SHA-256 of every file above |
