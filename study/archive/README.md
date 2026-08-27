# Archive

Material from **pre-registration v2.0**, the study design that held the harness
fixed (Codex CLI) and varied six models inside it. That collection was never run.
It is kept because superseded research should be reachable, not deleted.

Nothing here bears on the current work. Start at [`../README.md`](../README.md).

## What is here

| path | what it is |
|---|---|
| [`data/`](data/) | checksummed archive of raw transcripts, prompts, schedules, extracted outputs and grades from v2.0's discarded calibration pilots |

## What is elsewhere

**The executable machinery** — `scripts/`, `runs/`, `tasks/`, `tests/`,
`payloads/`, `schemas/`, `rule-j/`, `mutation-corpus/`, and the
`exploratory/luna_handoff_v1/` handoff test — is not in the working tree at all.
It is preserved at the tag `prereg-v2.0-archive`:

```bash
git checkout prereg-v2.0-archive -- study/scripts
```

**The pre-registration itself** stays at
[`../preregistration.md`](../preregistration.md), outside this directory, and
that is deliberate. `dsh-agent-utility-amendment.md` is one of the nineteen files
hashed in the frozen manifest, and it links to the pre-registration at that path.
Moving the file would break a link inside a frozen artifact, and regenerating the
manifest to tidy a filename would weaken the freeze it exists to guarantee. The
layout is constrained by the freeze, which is the correct trade.

## Why v1.0–v2.6 look like churn

The names scattered through this material — `luna`, `terra`, `sol`, `codex` — are
not placeholders. They are the model slugs (`gpt-5.6-luna` and siblings) and the
harness (Codex CLI) that v2.0 pinned by name. The version sequence v1.0 → v2.6
records a design being corrected in public: v1.0–v1.4 compared four vendor agent
systems in which model and harness were confounded by construction, and v2.0 was
a redesign that removed the confound rather than disclosing it.

The full deviation log is §13 of the pre-registration. It is the authoritative
record of what changed and why.
