# Generated study data

This directory is populated by `study/scripts/benchmark.py`.

- `frozen-manifest.json` hashes registered inputs.
- `schedules/` contains deterministic randomized run schedules. They are stored
  as compact JSON to keep code-review diffs small.
- `raw/` is created locally with one directory per run. It is intentionally
  ignored by Git after collection.
- `analysis/` contains compact generated metrics, tables, and figures and stays
  in Git.

The complete preserved raw records, the byte-original pretty-printed schedules,
and the discarded mutation-pilot output are packaged in
[`../data/thoughtml-study-data-v1.tar.gz`](../data/thoughtml-study-data-v1.tar.gz).
See [`../data/README.md`](../data/README.md) for provenance, checksums, status
boundaries, and restoration instructions.

Current preserved reports:

- `analysis/probe-cued-openai-v2.4-summary.json` regenerates the complete 20-run
  OpenAI cued-probe record, including the five later-withdrawn GPT-5.4 probes.
- `analysis/exp0-pilot-v2.4-summary.json` regenerates the complete discarded
  60-run Terra pilot, its failed acceptance gate, operational audit, and usage.
- `analysis/exp0-pilot-v2.6-summary.json` preserves the later 20-run hard-pilot
  summary separately from the discarded v2.4 pilot.

Never delete failed, excluded, unparseable, or unexpected runs. They are data.
Package and verify them before cleaning the working tree.
