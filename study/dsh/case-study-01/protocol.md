# DSH agent-utility case study 01 — frozen mini-protocol

**Author:** Fatin Ishraq
**Version:** 1.0
**Frozen:** 2026-08-25
**Status:** Frozen before the first study model call. No session in this protocol
has been run.

This protocol governs **one task, three conditions, three repetitions — nine
sessions**. It is an exploratory case study and an integration shakedown. It is
**not** evidence that ThoughtML improves agent performance, and §13 states
plainly what it cannot show.

---

## 0. Authority and relationship to the existing study

This document sits under
[`../dsh-agent-utility-amendment.md`](../dsh-agent-utility-amendment.md) v0.3 and
does not alter it. Where the amendment and this protocol differ, the differences
are recorded as dated deviations in §1 rather than silently applied.

The task selected here is recorded in
[`../task-selection/README.md`](../task-selection/README.md) with its full
criteria, data, and provenance hashes.

**This task is permanently barred from the amendment's confirmatory pilot and
main samples**, regardless of outcome, because its selection was adaptive
(task-selection record §5).

## 1. Dated deviations from the amendment

| # | Deviation | Reason | Disclosure obligation |
|---|---|---|---|
| D1 | Benchmark is **DeepSWE v1.1**, not SWE-bench Verified (amendment §3) | Original long-horizon tasks, behavioural verifiers, separate pristine verifier container, published per-trial step/token/cost data, and a published `deepseek-v4-flash` reference of 53% | Must be stated wherever the benchmark is named |
| D2 | `memory_enforcement_policy: ignore` | The task declares `memory_mb = 8192`; the execution host exposes **3.78 GB** to Docker. Pier's default `AUTO` resolves to a hard ceiling on Docker, which cannot be satisfied | Results are **not** under the standard DeepSWE resource contract. Must be stated alongside any comparison to published leaderboard numbers |
| D3 | Agent is **DSH** via a custom Pier adapter, not `mini-swe-agent` | The study's subject is DSH plus persistent state | Absolute success is not comparable to the leaderboard; only within-task, cross-condition contrasts are |
| D4 | Three repetitions per condition on one task | Chosen 2026-08-25 to make the success outcome interpretable rather than a single coin flip | Still underpowered; see §7.1 and §13 |

No further deviation may be introduced after the first study call without a new
dated entry here and a version bump.

## 2. Task freeze

| | |
|---|---|
| Task id | `cattrs-partial-structuring-recovery` |
| Dataset | DeepSWE **v1.1** |
| Task repo | `github.com/datacurve-ai/deep-swe` @ `435ee89ec2f2e2289f33b0da4f992f0b7b7266b9` (Apache-2.0) |
| Upstream repo | `github.com/python-attrs/cattrs` |
| Base commit | `6bc4708fb9b2ac52d9a18997e923da6a58916102` |
| Agent image | `public.ecr.aws/d3j8x8q7/swe-bench-202605:kh7f7cahc5ddm1qzpxz13kpmrh8235pc-v1.1` |
| **Image manifest digest** | `sha256:443a3534dab64283e5a9dedf3b7ac8867ed7d5dabcde39bc39c77ab5a909176a` |
| Image config digest | `sha256:f08103fa95bffd90de35d86e715a9f8d1c1fef07faa7854f237302c92484aa39` |
| Image size | 760.5 MB compressed / 26 layers / 3.63 GB on disk |
| Verifier | separate pristine container, `no-network`, 1800 s |
| Agent budget | `no-network` plus allowlist, 5400 s |
| Graded tests | 69 fail-to-pass, 7 pass-to-pass |

**The image must be referenced by digest, not tag, in every run.** A tag that
moves invalidates the freeze.

### Published reference (context only, never pooled with our results)

`deepseek-v4-flash` on this task, 4 published v1.1 trials: **2 pass / 2 fail**;
both failures were near-misses (68/69 and 67/69 fail-to-pass) with the regression
suite fully intact; mean 158 agent steps, mean $0.40, mean 1341 s.

## 3. Conditions

| Code | Persistent state available to the agent |
|---|---|
| `D` | none — no study-added state artifact and no state instruction |
| `M` | persistent Markdown ledger, matched semantic sections |
| `T` | persistent ThoughtML graph plus the released parser/checker |

Primary contrast: **T − M**. Diagnostic contrasts: M − D and T − D.

M and T receive identical tool names, checkpoint policy, size/output budgets,
revision semantics, recovery notices, and context timing. Only format-specific
syntax and validation guidance differ. This is a **system bundle** comparison,
not a syntax-only one, and is described that way.

## 4. Schedule

Frozen in [`schedule.json`](schedule.json); regenerate and verify with
`python make_schedule.py --check`.

Seed **20260825**, blocked by repetition, condition order shuffled within block:

| block | order |
|---|---|
| 1 | T, M, D |
| 2 | M, D, T |
| 3 | D, T, M |

The seed happens to yield a Latin square — each condition appears exactly once in
each slot position — which removes slot-position confounding. This was a property
of the frozen seed, not a designed constraint, and is reported as such.

Sessions run in the listed order. **Order may not be changed in response to
observed results.** A session that fails for infrastructure reasons is re-run in
place and both attempts are preserved (§11).

## 5. Fixed controls

Identical across D, M, and T unless the treatment itself requires the difference:

- provider `deepseek-official`, model `deepseek-v4-flash`, identical sampling and
  reasoning settings and context limit;
- DSH `0.1.1-rc.2` with the committed pnpm lockfile, same profile, same system
  prompt base, same non-study plugins;
- identical task text, image digest, and initial container state;
- identical coding, shell, filesystem, and testing tools;
- identical network and sandbox policy;
- identical token, action, wall-time, and retry budgets;
- identical termination rules and the official DeepSWE verifier;
- identical usage-accounting and event-extraction code;
- same host, same Docker daemon, same resource policy.

Each session starts from a fresh DSH session and a fresh container. **No state,
patch, transcript, or tool cache may cross conditions.**

An unavailable model is a **stop**, not permission to substitute another model.

## 6. Environment freeze

Measured on the execution host on 2026-08-25:

| component | pinned value |
|---|---|
| Host OS | Windows 11 Pro 10.0.26200.9168 |
| Host RAM | 7.39 GB total |
| WSL | 2.6.3.0, kernel 6.6.87.2-1 |
| Distro | Ubuntu 24.04.4 LTS |
| Docker Engine | 29.7.2 (build `a7dcaa6`), storage driver `overlayfs`, cgroup v2 |
| Docker-visible resources | 3.78 GB memory, 12 CPUs |
| Pier | `datacurve-pier` 0.3.1 |
| Python (host side) | 3.12.3 |
| uv | 0.12.5 |
| DSH | `@deepseek-ai/dsh` 0.1.1-rc.2 |
| ThoughtML | repository checker 0.5.0, built for Linux inside the agent image |
| Telemetry | `DSH_TELEMETRY_MODE=DISABLED`, verified in the composed config before every run |

The DeepSeek credential is supplied via `DEEPSEEK_API_KEY` from a gitignored
`.env`. It must never appear in any tracked file, log, manifest, or artifact.

**Task checkout requirement.** The DeepSWE task repository must be cloned
natively on Linux with LF line endings, and the manifest must hash those LF
files. A checkout made on Windows converts `tests/test.sh` to CRLF, which turns
its shebang into `#!/bin/bash\r`; the verifier container then fails with
`/tests/test.sh: cannot execute: required file not found` and **no `reward.json`
is produced at all**. This was observed on 2026-08-25 during the pre-collection
dry run. The failure mode is dangerous because it appears only at the grading
step, after the agent has already done its work and a valid `model.patch` has
been collected — so it would waste a full session before surfacing. Verify with
`file tasks/<id>/tests/test.sh`, which must not report CRLF.

## 7. Outcomes

### 7.1 Primary — and an explicit power statement

1. **Official task success**: binary pass/fail from the frozen DeepSWE v1.1
   verifier. Local partial test success is not official success.
2. **Environment actions to termination**: externally consequential primitive
   actions until success, failure, or budget exhaustion. Model-facing tool calls
   are reported separately.

> **Power statement, frozen in advance.** This task sits at 2/4 published Flash
> difficulty — the maximum-variance point. With three runs per condition, the
> success outcome **cannot** distinguish a real effect from chance. No claim of a
> success difference may be made from this protocol, in either direction,
> including a claim that ThoughtML does *not* help. The success numbers are
> reported for completeness and as an integration check.

Fewer actions is favourable **only** jointly with success. An agent that fails
early is not efficient.

### 7.2 Secondary mechanical outcomes

Lower-variance and therefore the substantive readout:

- fail-to-pass fraction from the CTRF report (continuous, per-test);
- input, cached-input, output, reasoning-output, and total tokens;
- state-specific tokens and read/commit/inspect/diff/explain/analyze calls;
- model-facing tool calls and primitive shell/filesystem/test actions;
- test invocations and distinct failing test signatures;
- wall-clock duration and timeout reason;
- **exact repeated action**: same normalized action and arguments repeated after
  the same observed outcome with no intervening relevant file-state change;
- **recovery latency**: primitive actions from a recorded failure until the
  failing signature changes, the target test passes, or the run is censored;
- ThoughtML parse, strict-validation, and lint status at each checkpoint;
- missing, empty, or stale checkpoints in M and T.

Normalization rules for actions, file-state change, failure signature, and
state-token attribution **must be implemented and unit-tested before the first
study call**. No definition may be adjusted after seeing a condition difference.

### 7.3 Human-coded outcomes

Goal drift, semantic contradiction, reliance on superseded beliefs, and recovery
quality are scored on a frozen rubric by reviewers blinded to condition where
format permits. This task's instruction is a checklist of roughly ten
independently testable requirements, so each is scored **per requirement** rather
than holistically. Ambiguous cases and disagreements are retained, not resolved
away.

### 7.4 Auditability sub-study

As amendment §7: five questions per artifact package, randomized order, recording
correctness against a two-reviewer reference, completion time, confidence, and an
insufficient-information flag. ThoughtML's format cannot be hidden, so task and
condition codes and the expected direction are blinded instead.

## 8. State isolation — a correctness requirement, not a preference

The verifier collects the graded patch with
`git diff --binary 6bc4708… HEAD > /logs/artifacts/model.patch` executed in
`/app`, and the task instruction tells the agent to *"work on a new branch from
main and commit everything when you are done."*

Therefore **any state artifact written under `/app` would be committed into the
graded patch**, making M and T produce structurally different patches from D and
tripping the verifier's out-of-scope path signal. That would contaminate the
primary contrast.

Mandatory, and asserted rather than merely configured:

1. The state root is outside the repository (`/opt/tml-state`) in both M and T.
2. A **pre-flight assertion** fails the session if the state root resolves inside
   `/app` or if any symlink escapes it.
3. A **post-run assertion** fails the session if `model.patch` contains any path
   belonging to the state root or the plugin.
4. `git status --porcelain` in `/app` is captured before the first agent action
   and after the final commit, and both are preserved.

A session that violates 1–3 is void and re-run in place, logged as an
infrastructure exclusion (§11).

## 9. Budgets

| | |
|---|---|
| Agent wall-clock | 5400 s per session (task-declared) |
| Verifier | 1800 s per session (task-declared) |
| Retries | infrastructure only; zero task retries |
| Expected token cost | ~$0.40 per session at published Flash rates; ~$4 for all nine, plus state-tool overhead in M and T |

Budgets are identical across conditions. Exceeding a budget is a recorded
terminal state, not a reason to extend it.

## 10. Gates that must pass before the first study call

1. DSH Pier adapter loads via `pier run --agent-import-path` and completes a
   session end to end.
2. Node and DSH install at **image build time**; the agent runs with network
   restricted to the model API allowlist.
3. §8 state isolation assertions implemented and unit-tested.
4. Step, tool-call, and token extraction reproducible from raw DSH events, with
   the ATIF-conversion decision recorded.
5. Deterministic offline D/M/T run passes against the pinned adapter.
6. `DSH_TELEMETRY_MODE=DISABLED` verified in the composed config.
7. Authoritative manifest of byte-sensitive hashes produced.

Development and smoke sessions used to satisfy these gates are **excluded from
all study outcomes** and recorded in the diagnostics log, continuing the existing
practice for the five prior Flash development calls.

## 11. Exclusions and stop rules

- A session is excluded **only** for infrastructure failure — container fault,
  verifier error, credential or network failure, or a §8 violation. It is re-run
  in place and both attempts are preserved.
- A session is **never** excluded because the agent performed badly, neglected
  its state, or produced an unfavourable result.
- Non-compliance with the checkpoint instruction is **measured**, not excluded.
- If more than two of nine sessions require infrastructure re-runs, collection
  **stops** and the cause is fixed before restarting as a new protocol version.

## 12. Artifacts preserved per session

Exact prompt; raw DSH session events; provider metadata and usage; every tool
result; terminal state and reason; `model.patch`; all state checkpoints and the
immutable revision journal; `reward.json`, `ctrf.json`, `test-stdout.txt`,
`run.log`; the extraction record; retries; exclusions; and the pre/post
`git status` captures from §8.

All generated tables must be reproducible from these artifacts, not transcribed
by hand.

## 13. Analysis, and what this cannot show

With one task the analysis is **descriptive**. Report for every condition the raw
numbers, the paired within-task differences across the three repetitions, and the
spread. Report adverse effects and token overhead with the same prominence as any
benefit.

No inferential test is performed on nine sessions. No confidence interval is
presented as though it generalized.

**This protocol cannot show:**

- that ThoughtML improves agent success — see the §7.1 power statement;
- that ThoughtML does *not* help — absence of a visible difference here is not
  evidence of absence;
- anything about other tasks, models, harnesses, or hosts;
- anything under the standard DeepSWE resource contract, because of deviation D2.

**What it can show:** that the three-condition system runs end to end in a real
benchmark container; that the measurement definitions produce reproducible
numbers from raw events; whether ThoughtML's token and action overhead is small
or large; and whether a blinded reviewer can answer the five auditability
questions better from one representation than another.

The honest headline for this work is a shakedown, not a finding. The claim comes
later, from the pilot and main evaluation, or not at all.
