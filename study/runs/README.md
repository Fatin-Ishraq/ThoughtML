# Generated study data

This directory is populated by `study/scripts/benchmark.py`.

- `frozen-manifest.json` hashes registered inputs.
- `schedules/` contains deterministic randomized run schedules.
- `raw/` contains one directory per run with prompt, JSONL transcript, final
  message, metadata, extraction, and grade.
- `analysis/` contains generated metrics, tables, and figures.

Current preserved reports:

- `analysis/probe-cued-openai-v2.4-summary.json` regenerates the complete 20-run
  OpenAI cued-probe record, including the five later-withdrawn GPT-5.4 probes.
- `analysis/exp0-pilot-v2.4-summary.json` regenerates the complete discarded
  60-run Terra pilot, its failed acceptance gate, operational audit, and usage.

Never delete failed, excluded, unparseable, or unexpected runs. They are data.
