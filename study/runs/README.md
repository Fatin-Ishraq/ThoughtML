# Generated study data

This directory is populated by `study/scripts/benchmark.py`.

- `frozen-manifest.json` hashes registered inputs.
- `schedules/` contains deterministic randomized run schedules.
- `raw/` contains one directory per run with prompt, JSONL transcript, final
  message, metadata, extraction, and grade.
- `analysis/` contains generated metrics, tables, and figures.

Never delete failed, excluded, unparseable, or unexpected runs. They are data.
