# DSH agent-utility case study 01

One task, three conditions, three repetitions — **nine sessions**. Exploratory
case study and integration shakedown, **not** evidence that ThoughtML improves
agent performance. See [`protocol.md`](protocol.md) §13 for what this design can
and cannot show.

**Status: frozen, not yet collected.** No study model call has been made.

| file | role |
|---|---|
| [`protocol.md`](protocol.md) | **binding.** Task pin, conditions, deviations, outcomes, power statement |
| [`schedule.json`](schedule.json) | the nine sessions, seed 20260825; verify with `make_schedule.py --check` |
| [`manifest.json`](manifest.json) | byte-sensitive freeze record; regenerate with `make_manifest.py` |
| [`run_case_study.py`](run_case_study.py) | the collection runner; refuses to start if anything drifted |

## Running it

```bash
# pre-flight only, spends nothing
python3 run_case_study.py --check

# execute the nine sessions (~4-5 h, ~$4-5 in deepseek-v4-flash tokens)
python3 run_case_study.py --run
```

Run this on the execution host (inside WSL), where Docker, Pier, and the Linux
`thoughtml` checker live. Pre-flight refuses to start on CRLF in the task's
`tests/test.sh`, a missing checker, an incomplete manifest, a schedule that no
longer matches its seed, or an image digest mismatch.

## After collection

Results land at `--out` (default `/root/case-study-01/`), **outside this repo**.
Copy them to `runs/` beneath this directory before committing, keeping the
existing convention: compact records tracked, raw trajectories left under an
ignored path.

Then verify the reported numbers re-derive from the raw logs:

```bash
python3 ../pier_agent/verify_extraction.py --job /root/case-study-01/<session-id>
```

## Related

- [`../../dsh-agent-utility-amendment.md`](../../dsh-agent-utility-amendment.md) — the parent design
- [`../task-selection/README.md`](../task-selection/README.md) — why this task, out of 113
- [`../pier_agent/`](../pier_agent/) — the DSH adapter and its self-test
- [`../diagnostics/dev-calls-2026-08-25.json`](../diagnostics/dev-calls-2026-08-25.json) — development calls, excluded from results
