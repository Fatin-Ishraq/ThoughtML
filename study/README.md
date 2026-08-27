# The ThoughtML study

**Author:** Fatin Ishraq · **Status as of 2026-08-27:** infrastructure complete and
frozen; **no registered data collected.** Everything below that reports a number
comes from development runs, which are excluded from every study outcome by design.

If you read one other file, read
[`dsh/case-study-01/protocol.md`](dsh/case-study-01/protocol.md) — it is the
binding document for the experiment that is ready to run.

---

## 1. The question

ThoughtML is a plain-text language for reasoning that a program can check: claims,
the evidence under them, stated confidence, and beliefs that were superseded rather
than deleted. The checker is a deterministic parser. It is not a model judging
another model, which is the property the whole project rests on.

Two questions follow, and they are different:

1. **Can models author it, and can the checker catch them when they don't?**
   This is the original pre-registered study.
2. **Does having a persistent, checkable reasoning record change how an agent
   behaves while doing real work?**
   This is the agent-utility extension, and it is where the current work sits.

The second question is deliberately framed as estimation, not confirmation. A null
or adverse result is reportable, and the protocol's power statement forbids a
success claim in either direction from the current design.

## 2. What state this is in

| | |
|---|---|
| Experiment designed and frozen | yes |
| Execution infrastructure built and self-tested | yes |
| Registered sessions collected | **no — zero** |
| Development sessions run | 17 |
| Blocking constraint | model quota / funding, not engineering |

Nine registered sessions are scheduled, seeded, and byte-pinned. The runner
refuses to start if anything drifted. It has never been run.

## 3. What the experiment is

One task, three conditions, three repetitions — nine sessions.

| condition | what the agent gets |
|---|---|
| **D** | no reasoning-state tools (baseline) |
| **M** | the same tools, backed by a structured Markdown ledger |
| **T** | the same tools, backed by a ThoughtML ledger and its checker |

D/M/T are identical in every respect except the state artifact. The primary
contrast is **T − M**, which isolates the effect of the *checkable* format from the
effect of merely having a place to write things down. M exists so that a positive T
result cannot be explained by "it helped to take notes."

The task is `cattrs-partial-structuring-recovery`, one Python task from
DeepSWE v1.1. It was chosen mechanically, before any hypothesis was tested against
it, from **28,010 published trial records** covering all 113 tasks — selected for
maximum outcome variance, zero verifier flakiness, a container the host can run, and
a step count long enough for reasoning state to matter. The selection code, the
raw trial data, and the provenance record are all in
[`dsh/task-selection/`](dsh/task-selection/).

## 4. What the development runs showed

**These are not results.** They are development sessions on a substitute model,
one session per condition, on one task. They are reported here because they are the
only observations that exist, and because omitting them would misrepresent what is
known. No claim in this section survives into a paper without the registered
collection.

**Scale.** 17 sessions, 552 model calls, ~39.5M tokens (809k input, 38.3M cache
reads, 406k output), about **$0.90 total**. Most sessions ran on
`stealth/ox-alpha` via OpenRouter; `glm-5.2`, `minimax-m3` and `laguna-s-2.1` each
got one probe. Every session used an open-weight or free-tier route. No first-party
OpenAI or Google model was used anywhere in this project.

**The checker caught real errors, and the model repaired them.** Across all
sessions there were 24 attempts to save a reasoning record: 13 accepted, 9 refused
by the checker as malformed, 2 lost to tool errors. Every one of the 9 refusals was
followed by an accepted save, 8 of them on the very next attempt. None was
abandoned. Representative cycle, verbatim from the logs:

```
TML201: link.from of `superseded-none-part-of-reasoning-state`
        is an unresolved reference `superseded-none`
→ 55 seconds later, accepted:
  "Initial checkpoint: goal, requirements, and implementation plan
   established before first modifying action; fixed dangling part-of reference."
```

The Markdown arm was rejected too (missing required sections), so both formats were
held to a schema — condition T was not uniquely burdened.

**Models wrote things nothing asked them to write.** Sessions recorded designs they
had already abandoned, as explicit superseded nodes with the reason attached. One
model attempted `confidence 0.95 evidenced` — trying to attach a basis to its own
confidence number — and the checker refused it, because the format accepts only a
bare number. That is a point in the format's favour and a genuine design gap at the
same time, and it is recorded as such.

**The ledger did not bloat.** Over a 102-step session it *shrank*, 3.7 kB → 2.4 kB
across four revisions, as the agent pruned while preserving supersessions.

**Condition T cost more.** In the one three-condition sweep, T used 88 model calls
against 49 for D and 41 for M. If that holds up under collection it is a real cost
and will be reported as one.

**What has not been shown.** Nothing here demonstrates that the reasoning record
*caused* a change in the agent's decisions. What the logs show is a faithful
witness — the model recording changes of mind whose causes were ordinary (a failed
edit, a test run). Demonstrating causation requires the D/M/T comparison at n > 1,
which is exactly what has not been affordable.

## 5. Where things are

| path | what it is |
|---|---|
| [`dsh/case-study-01/`](dsh/case-study-01/) | **the current experiment.** Protocol, seeded schedule, byte manifest, runner, frozen requirement checklist |
| [`dsh/task-selection/`](dsh/task-selection/) | how the task was chosen from 113, with the 28,010-trial dataset and provenance |
| [`dsh/pier_agent/`](dsh/pier_agent/) | the adapter running the harness under D/M/T, its ~60-check self-test, and an independent extraction verifier |
| [`dsh/diagnostics/`](dsh/diagnostics/) | records of development-only model calls, excluded from results |
| [`dsh-agent-utility-amendment.md`](dsh-agent-utility-amendment.md) | the parent design for the agent-utility extension |
| [`exploratory/luna_handoff_v1/`](exploratory/luna_handoff_v1/) | an earlier exploratory handoff test, superseded |
| [`data/`](data/) | checksummed archive of raw transcripts from the original study's discarded pilots |

### Superseded, kept for the record

[`preregistration.md`](preregistration.md) is **pre-registration v2.0**, which
designed a different experiment: six models varying inside one fixed harness
(Codex CLI). That design was not run and is not the work described above. It is
kept because deleting a filed pre-registration is bad practice, not because it
describes current plans. Its §13 deviation log is the authoritative history of
how the design changed.

The same applies to `tasks/`, `payloads/`, `schemas/`, `runs/`, `rule-j/`,
`mutation-corpus/`, and `scripts/benchmark.py` — machinery for v2.0, retained,
not current.

## 6. What the next step needs

The nine registered sessions cost roughly **$4–5** in model tokens and 4–5 hours
of wall clock. That is not the constraint. The constraint is that nine sessions on
one task cannot support a claim in either direction — the protocol says so
explicitly, in advance.

A result worth publishing needs the same design across **15–20 tasks**, which is
where the cost becomes real and where outside support would change what is
possible. The infrastructure to spend it already exists and has been shaken down
against eight defects that would each have silently corrupted or destroyed real
data:

- a web-search tool retrieving the benchmark's own published `solution.patch`
- artifacts written outside the mounted paths and discarded at session end
- CRLF line endings killing the verifier with no reward file and no error
- tagged per-trial images accumulating until the verifier build failed silently

Each was found by running exploratory sessions rather than by reading code. That
is what the $0.90 bought.

## 7. Reading order for a reviewer

1. [`dsh/case-study-01/protocol.md`](dsh/case-study-01/protocol.md) — the binding design; §13 states what it cannot show
2. [`dsh/task-selection/README.md`](dsh/task-selection/README.md) — that the task was not cherry-picked
3. [`dsh/pier_agent/dsh_agent.py`](dsh/pier_agent/dsh_agent.py) — how the three conditions are made identical apart from the artifact
4. [`dsh/case-study-01/requirements.md`](dsh/case-study-01/requirements.md) — the 15 obligations, frozen before collection so scoring cannot be shaped after the fact
5. [`dsh-agent-utility-amendment.md`](dsh-agent-utility-amendment.md) — how this extends the original study without rewriting it
