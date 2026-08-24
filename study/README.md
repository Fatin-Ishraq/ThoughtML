# ThoughtML benchmark workspace

This directory contains the executable artifacts for the versioned study protocol in
[`preregistration.md`](preregistration.md). The benchmark is deliberately split
into three states:

1. **Design** — author tasks, prompts, schemas, and code. No model calls.
2. **Freeze** — validate every artifact and write `frozen-manifest.json` with
   byte-sensitive SHA-256 hashes.
3. **Collect** — run the contamination probe, pilot, and main schedules without
   changing frozen artifacts.

Do not run registered collection until every item in `protocol-issues.md` is
resolved and the pre-registration/deviation log reflects those resolutions.

## Layout

- `tasks/` — registered task sets and contamination probes.
- `tasks/reviewer-checklist.md` — required human ambiguity review before freeze.
- `payloads/` — prompt instructions and the generic-schema control.
- `schemas/` — JSON Schemas for tasks and generic responses.
- `config/` — pinned models and benchmark constants.
- `scripts/benchmark.py` — validation, freezing, scheduling, running, grading,
  mutation generation, and analysis entry point.
- `tests/` — offline tests for the benchmark machinery.
- `runs/` — generated manifests, compact schedules, and analysis summaries.
- `data/` — the versioned, checksummed archive of raw transcripts, exact prompts,
  original schedules, extracted outputs, grades, and discarded pilot artifacts.

## Safe pre-data commands

```powershell
python study/scripts/benchmark.py validate
python study/scripts/verify_answers.py
python study/scripts/verify_answers.py --task-set pilot
python study/scripts/benchmark.py freeze --candidate
python -m unittest discover -s study/tests -v
```

After protocol resolution and an explicit freeze:

```powershell
python study/scripts/benchmark.py freeze
python study/scripts/benchmark.py schedule --phase probe-cued --seed 20260820
python study/scripts/benchmark.py schedule --phase exp0-pilot-v2.6 --seed 20260821
```

The runner does not start unless a current authoritative manifest exists. Until
the user explicitly permits model calls, keep only a candidate manifest and
draft schedules. A dry run prints and records the exact invocation without
contacting a model:

```powershell
python study/scripts/benchmark.py run --schedule study/runs/schedules/probe-cued.json --dry-run
```

The v2.6 hard-pilot tasks were approved unchanged by the project author on
2026-08-21. Its 10 pilot-only tasks and 20-call Terra schedule become collectable
only from the authoritative manifest generated after that approval.

The original pre-call checklist is preserved in
[`pre-model-status.md`](pre-model-status.md); current collection status and every
post-freeze amendment are recorded in the pre-registration's §13 log.

## Research handoff

Every paper number must be regenerated from raw artifacts. Preserve:

- the frozen manifest and schedule seed;
- every JSONL transcript, including excluded runs;
- the final-message file and mechanically extracted output;
- exclusion and extraction reasons;
- grader version/hash and command line;
- collection timestamps and observed model metadata;
- analysis JSON, tables, and figures.

The repository keeps those raw artifacts in the verified archive documented at
[`data/README.md`](data/README.md). Extract it into a clean checkout when a
byte-original run tree is required for reanalysis.
