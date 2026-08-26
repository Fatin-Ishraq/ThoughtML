# DSH agent-utility study amendment

**Author:** Fatin Ishraq
**Draft version:** 0.3
**Date drafted:** 2026-08-24
**Status:** Pre-pilot development amendment. One credential-only session and one
plugin-compatibility smoke session exist and are excluded from all study outcomes.
On 2026-08-25, before pilot collection, the plugin surface was expanded from
three to six matched tool names; this document records that treatment change.
Later that day, again before any collection, plugin `0.3.0` restated the
state-management guidance as an explicit requirement, and the harness
configuration disabled DSH's web search and its built-in `todo`/`goal`
scratchpads. Both changes are recorded in §4.1.

## 0. Relationship to the original study

This document adds a new agent-utility phase to the study in
[`preregistration.md`](preregistration.md). It does not replace, rewrite, or
retroactively alter that protocol. The original study asks whether models can
author and whether the checker can audit ThoughtML reasoning records. This
extension asks whether making a persistent reasoning record available during an
agent task changes observable behaviour.

This amendment was written after the original study's contamination probes,
discarded calibration pilots, and exploratory Luna handoff task. Those artifacts
may motivate the extension but are not pooled with its results. This is a
post-data extension and will be described that way in any paper.

The extension is estimation-first. It tests ThoughtML rather than assuming that
ThoughtML helps. A null or adverse result is reportable.

## 1. Research objective

**Central question:** Does explicit, persistent ThoughtML state improve the
success, interaction efficiency, recovery, consistency, or auditability of a
long-horizon coding agent compared with matched persistent Markdown state?

The experiment uses [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)
as the fixed agent harness. DSH is currently a developer preview, so the exact
commit, dependency lockfile, configuration, and plugin surface must be frozen
before any pilot response is collected.

All development and study calls are pinned to provider `deepseek-official` and
model `deepseek-v4-flash`. A different model requires an explicit dated
amendment before collection rather than an operational substitution.

### Research questions

- **ARQ1 — Success:** Does ThoughtML change official task success relative to
  matched Markdown state?
- **ARQ2 — Interaction efficiency:** Does ThoughtML change the number of
  environment actions, tool calls, or test cycles required?
- **ARQ3 — Failure and recovery:** Does ThoughtML change repeated failed actions
  or the number of actions required to recover from a failed attempt?
- **ARQ4 — State consistency:** Does ThoughtML reduce goal drift, unresolved
  contradictions, or reliance on superseded beliefs?
- **ARQ5 — Context cost:** What input, output, and state-maintenance token cost
  does ThoughtML add or remove?
- **ARQ6 — Auditability:** Can a blinded reviewer diagnose an agent's goal,
  current belief, failure, revision, and next action more accurately or quickly
  from ThoughtML than from Markdown or an ordinary trajectory?

## 2. Experimental conditions and estimands

Every selected task is run under all three conditions.

| Code | Condition | Persistent state available to the agent |
|---|---|---|
| `D` | DSH baseline | No study-added reasoning-state artifact or state instruction. |
| `M` | DSH + Markdown | A persistent Markdown ledger with matched semantic fields. |
| `T` | DSH + ThoughtML | A persistent ThoughtML graph plus the released parser/checker. |

The primary treatment contrast is **T minus M**. It estimates the contribution
of the ThoughtML representation and checker beyond ordinary persistent notes.
Two diagnostic contrasts are reported separately:

- **M minus D** estimates the effect of adding persistent notes and their update
  instructions.
- **T minus D** estimates the total effect of adding the ThoughtML state system.

The T-minus-M result is a bundle comparison, not a syntax-only comparison. The
ThoughtML condition includes the parser and checker because they are part of the
released utility. Mechanism analysis will distinguish checker interventions,
state consultations, and ordinary note-taking when the trajectory permits it.

## 3. Benchmark and task sampling

The intended benchmark is
[SWE-bench Verified](https://www.swebench.com/verified.html), a public set of
500 engineer-reviewed software-engineering tasks with test-based evaluation.
It is used only for testing and evaluation; this study performs no training,
fine-tuning, or task-specific prompt optimization.

> **Dated deviation, 2026-08-25.** The exploratory one-task case study uses
> **DeepSWE v1.1** instead of SWE-bench Verified. The reasons, the selection
> criteria, and the full benchmark comparison are recorded in
> [`dsh/task-selection/README.md`](dsh/task-selection/README.md) and frozen as
> deviation D1 in [`dsh/case-study-01/protocol.md`](dsh/case-study-01/protocol.md).
> This deviation currently covers **only** that case study. The pilot and main
> evaluation described below still name SWE-bench Verified and would need their
> own dated amendment before collection.

Before any model call, the study must freeze:

1. the exact dataset release or revision;
2. task IDs and task-order seed;
3. repository/container identifiers and base commits;
4. a task-selection script and its hash; and
5. an attestation that pilot and main tasks are disjoint.

### Pilot

- Ten tasks, each run once under D, M, and T: **30 agent sessions**.
- Tasks are permanently pilot-only and never enter the main result.
- Selection must cover more than one repository and avoid choosing tasks based
  on whether they appear especially favourable to ThoughtML.
- Exact task IDs are frozen only after offline DSH and SWE-bench feasibility
  checks, but before the first pilot model call.

### Main evaluation

- Target range: 40–60 unseen tasks under all three conditions.
- The exact main sample size, task IDs, repetition count, and any prespecified
  replication subset must be frozen before inspecting pilot outcomes by
  condition.
- If cost prevents a sample capable of supporting a confirmatory claim, the
  main evaluation remains explicitly estimation-first and reports uncertainty.

Public benchmark status does not eliminate possible model exposure to task
content. Absolute success may therefore be affected by contamination. The
within-task, same-model condition contrast remains the principal quantity of
interest, and this limitation will be disclosed.

## 4. Matched state intervention

The Markdown and ThoughtML conditions receive the same state-management
instruction except for format-specific syntax and validation guidance. Both
state artifacts must represent the same semantic categories:

- current task goal and constraints;
- observations and evidence with provenance;
- current hypotheses or beliefs;
- failed, rejected, or superseded hypotheses;
- actions and their observed results;
- unresolved questions or contradictions;
- current plan and next intended action; and
- uncertainty where the agent expresses it.

Both conditions use the same six tool names: read the complete current state;
atomically validate and commit a complete replacement against an expected
revision; inspect validation plus bounded history; diff two immutable revisions;
explain one focused state element; and run bounded analysis. Invalid, stale,
oversized, and unchanged candidates do not replace the last valid revision.

Condition T uses the released ThoughtML strict checker. Its diff is semantic,
its explanation targets a graph node, and its analysis exposes the released
compute/audit lenses. Condition M checks the same required semantic sections;
its diff identifies changed sections, its explanation returns one section, and
its analysis reports section structure. This difference is an explicit part of
the T-minus-M system bundle—not a hidden advantage or a syntax-only contrast.
Both conditions retain the same context timing, tool names, size/context/output
budgets, checkpoint instruction, revision semantics, and recovery notice.

### 4.1 Pre-collection corrections, 2026-08-25

A truncated condition-T probe on the frozen case-study task (30 steps, logged as
a development call) exposed two problems that would have invalidated collection.
Both fixes are applied identically to D, M and T, and both were made before any
study session.

**Disabled harness tools.** DSH's `web`, `web-search-deepseek`, `tool-web`,
`tool-todo` and `tool-goal` plugins are disabled in every condition.

- *Web search* resolves through the allowlisted model-API host, so it functions
  even inside a `no-network` container. The probe and an earlier dry run both
  used it to retrieve DeepSWE's published `solution/solution.patch` for the task.
  With it enabled, every session would measure how well the model locates the
  reference solution online rather than whether it can solve the task. Any result
  produced with web search enabled is void; the 2026-08-25 dry run is therefore
  development evidence about the pipeline only, not about agent capability.
- *`todo_write` and the goal tool* are DSH's own persistent scratchpads. While
  they are available, condition `D` is not a no-persistent-state baseline, and
  the agent has an established alternative to the study's ledger. The probe
  recorded zero uses of any state tool while the agent worked normally with the
  built-ins. Removing them makes `D` a real baseline and makes the T-minus-M
  contrast a comparison of state representations rather than of note-taking
  habits.

**Restated guidance (treatment change).** Plugin `0.3.0` rewrites
`REASONING_STATE_GUIDANCE` from a descriptive passage into an explicit
requirement with numbered checkpoints. The semantic content — what to record,
when to checkpoint, how commits and revisions behave — is unchanged; only its
force and ordering changed. The text remains a single shared constant, so M and T
receive identical guidance and continue to differ only in representation. This is
permitted by §8, which allows correcting instructions that are unusable in all
conditions, and is recorded here rather than applied silently.

Whether the ledger is now actually used is an empirical question that must be
re-checked with a fresh probe before collection, and checkpoint compliance
remains a measured outcome rather than an enforced one.

The agent is instructed to checkpoint state at the same moments in M and T:

1. after forming an initial plan and before the first modifying action;
2. after a failed command, edit, build, or test that changes the current plan;
3. when evidence causes a hypothesis to be rejected or revised; and
4. before the final answer.

Checkpoint compliance is measured rather than used as an outcome-based
exclusion. A session is not excluded merely because the agent neglected its
state.

## 5. Fixed controls

The following must be identical across D, M, and T unless the treatment itself
requires the stated difference:

- exact model identifier, provider, reasoning/sampling settings, and context
  limit;
- DSH commit, dependency lockfile, profile, system prompt base, and plugins;
- task text and initial repository/container state;
- available coding, shell, filesystem, and testing tools;
- network and sandbox policy;
- token, environment-action, wall-time, and retry budgets;
- termination rules and official grader;
- usage-accounting and event-extraction code; and
- hardware class where it can materially affect timeouts.

Each session starts from a fresh DSH session and clean task workspace. No state,
patch, transcript, or tool cache from one condition may be supplied to another.
Condition order is randomized within task using one frozen seed. The three runs
for a task may be operationally blocked, but schedule order cannot be changed in
response to observed quality.

## 6. Outcomes and operational definitions

### Primary outcomes

1. **Official task success:** binary pass/fail from the frozen SWE-bench
   evaluator. Partial local test success is not official success.
2. **Environment actions to termination:** count of externally consequential
   primitive actions until success, failure, or budget exhaustion. Model-facing
   tool calls are also reported separately because one tool call may bundle
   multiple primitive operations.

Fewer actions is favourable only when interpreted jointly with success. An
agent that fails early is not considered efficient. Actions-to-success is
reported among successful task-condition pairs, with selection bias disclosed;
a failure-aware time-to-success analysis is preferred for the complete set.

### Secondary mechanical outcomes

- input, cached-input, output, reasoning-output, and total tokens;
- state-specific tokens and state read/commit/inspect/diff/explain/analyze calls;
- model-facing tool calls and primitive shell/filesystem/test actions;
- test invocations and distinct failing test signatures;
- wall-clock duration and timeout reason;
- exact repeated action: the same normalized action and arguments repeated
  after the same observed outcome with no intervening relevant file-state
  change;
- recovery latency: primitive actions from a recorded failure until the failing
  signature changes, the target test passes, or the run is censored;
- ThoughtML parse, strict-validation, and lint status at each checkpoint; and
- missing, empty, or stale state checkpoints in M and T.

Normalization rules for actions, file-state changes, failure signatures, and
state-token attribution must be implemented and tested before the pilot freeze.
No definition may be tuned after seeing a favourable condition difference.

### Human-coded outcomes

Goal drift, semantic contradiction, reliance on superseded beliefs, and quality
of recovery are not inferred from syntax alone. They are scored on a frozen
rubric by reviewers blinded to the condition label where representation format
does not make blinding impossible. Ambiguous cases and disagreements are
retained.

## 7. Auditability sub-study

Reviewers receive a randomized artifact package and answer five questions:

1. What goal and constraint was the agent currently pursuing?
2. What was its current explanation or hypothesis?
3. What failed most recently?
4. Which belief or plan was revised or became obsolete?
5. What action did the agent intend to take next?

For each package, record answer correctness against a two-reviewer reference,
completion time, reviewer confidence, and an unusable/insufficient-information
flag. The artifact views and information budget must be frozen. ThoughtML's
format cannot be hidden, so the study blinds task/condition codes and expected
direction rather than claiming complete representation blinding.

Auditability is not substituted for agent performance. It is a separate outcome
that may remain useful when success and efficiency are unchanged.

## 8. Pilot decision rules

The pilot is a measurement and integration test, not evidence for the main
effect. It passes only if:

- at least 27 of 30 scheduled sessions reach a recorded terminal state;
- the official evaluator produces a result for every completed session;
- exact prompts, model metadata, usage, event logs, patches, state artifacts,
  and terminal reasons are preserved;
- environment actions and tool calls can be reproduced from the raw events;
- M and T use the same checkpoint policy and neither receives an unintended
  tool, context, or budget advantage; and
- the state interface works without corrupting or escaping the task workspace.

The pilot may justify fixing instrumentation, compatibility, or instructions
that are unusable in all conditions. It may not justify selecting easier tasks,
raising budgets, changing metrics, or revising the intervention because one
condition appears to win or lose. Any rerun uses fresh, disjoint pilot tasks and
is logged as a new pilot version.

## 9. Analysis plan

The main inferential contrast is paired within task: T versus M.

- Report every condition's raw numerator/denominator, estimate, paired
  difference, and 95% confidence interval.
- Test task success with a paired binary method and cluster repetitions within
  task if repetitions are present.
- Analyze action counts with a failure-aware method; also report transparent
  paired summaries for successful pairs.
- Analyze tokens, tool calls, repeats, and recovery with paired task-level
  differences or ratios and bootstrap confidence intervals.
- Treat task as the sampling/cluster unit, not each action or checkpoint.
- Apply Holm correction to the two primary T-versus-M outcome tests.
- Report M-versus-D and T-versus-D as diagnostic contrasts unless separately
  promoted before the main freeze.
- Report adverse effects and overhead with the same prominence as benefits.

No non-inferiority claim is made from a nonsignificant difference. A performance
preservation margin and adequate power would need to be frozen explicitly
before collection to support such a claim.

## 10. Interpretation matrix

| Observed pattern | Defensible interpretation |
|---|---|
| T improves success over M | Evidence that the ThoughtML state system helped this fixed DSH/model/benchmark setting. |
| Success is similar and T uses fewer actions/repeats | Evidence of interaction-efficiency benefit, subject to interval width. |
| Performance is similar and auditability improves | ThoughtML adds reviewer utility; it does not establish agent-performance improvement. |
| M and T both improve over D, but T and M are similar | Persistent state helped; ThoughtML-specific benefit was not detected. |
| T costs more tokens with no measured benefit | Adverse or null utility result under this setting. |
| Results vary strongly by task | Report moderators and uncertainty; do not select only favourable examples. |

All conclusions are limited to the frozen DSH version, model, task sample,
budgets, and intervention. ThoughtML validates internal structure; it does not
by itself establish that a belief is true or that evidence is complete.

## 11. Required artifacts

Before collection, preserve:

- this amendment and every dated deviation;
- pinned DSH source/dependency identifiers and composed configuration;
- pinned ThoughtML binary/source identifier and hashes;
- dataset revision, selected task IDs, containers, and selection script;
- matched prompts, state templates, plugin code, budgets, and schedule seed;
- metric schemas, normalization code, grader code, and tests; and
- a candidate then authoritative manifest of byte-sensitive hashes.

For every session, preserve the exact prompt, raw standard session events,
provider metadata, usage, tool results, terminal state, patch, state checkpoints,
official grade, extraction record, retries, and exclusions. Generated tables
must be reproducible from these artifacts rather than transcribed by hand.

## 12. Resolved engineering gates and next freeze

The development audit and offline implementation have now resolved four earlier
questions:

1. the executable dependency is pinned to npm package DSH `0.1.1-rc.2` with a
   committed pnpm lockfile;
2. the headless loop, persisted session events, tool results, usage, and terminal
   state are extractable;
3. one development-only credential diagnostic returned `READY`, and a separate
   plugin smoke session completed read/commit/inspect and returned
   `PLUGIN_READY`, using provider `deepseek-official` and model
   `deepseek-v4-flash`; both are excluded from study outcomes; and
4. the external plugin in `../integrations/dsh` supplies persistent bounded
   context, six matched tool names, strict validation, immutable revision
   history, bounded revision diff/explain/analyze operations, recovery guidance,
   observable files, and separate metrics without changing the DSH agent loop.
   Its source is included on the research branch but is not yet merged into
   `main` or released as a standalone package.

Eleven package tests pass for both formats, including the three added operations
and output bounds. A zero-network deterministic run also
passes inside the pinned DSH loop for D, M, and T: it observes one controlled
tool failure and recovery; M and T commit revision 1, preserve revision 0,
receive refreshed state context, and record a post-failure checkpoint. These are
engineering results only, not evidence of agent utility.

The remaining pre-pilot gates are scientific and benchmark-specific:

1. freeze the exact public task subset, dataset revision, repository/container
   identifiers, and pilot/main separation;
2. finish the feasible container execution route and primitive-action
   accounting boundary;
3. freeze prompts, budgets, schedule seed, metric-normalization and grader code;
   and
4. produce the authoritative byte-sensitive manifest before the first pilot
   response.

Only an explicitly authorized frozen pilot may contribute model outcomes. Every
live call remains pinned to `deepseek-v4-flash`; an unavailable model is a stop,
not permission to substitute another model.
