# ThoughtML study data archive v1

This directory keeps the bulky experimental evidence as one versioned archive
instead of thousands of generated text-file lines in the main code review.
Nothing was discarded: the archive contains every file that was present in the
selected data directories before compaction.

## Files

- `thoughtml-study-data-v1.tar.gz` — 1,012 archived files (1,580,648 bytes).
- `thoughtml-study-data-v1.index.tsv` — SHA-256 and byte size for every archived
  repository-relative path.
- `thoughtml-study-data-v1.provenance.json` — archive-level checksum, source
  commit, content groups, and interpretation boundaries.

Archive SHA-256:

```text
7ca468acadfbf46b4f2d51a81ce514cfd2e801a768cb37972fde8bc4e89a6690
```

## Contents and boundaries

The archive preserves:

- 880 files under `study/runs/raw/`, including the complete withdrawn v2.4
  records and the later v2.6 hard-pilot records;
- the twelve byte-original generated schedules before JSON compaction;
- four compact analysis snapshots;
- 53 discarded development mutation-pilot files;
- 63 files from the ten-call exploratory Luna handoff run.

These groups retain their original scientific status. Withdrawn, discarded,
exploratory, and registered data must not be pooled. The archive preserves the
Luna handoff's original lexical analysis as historical output. A subsequent
post-data correction, documented under
`study/exploratory/luna_handoff_v1/results/`, fixes its disclosed semantic
comparison without modifying this archive or its raw responses.

No API credential pattern was found in the selected data before packaging.
Absolute local paths inside historical metadata are preserved because changing
them would alter the original evidence.

## Verify

From the repository root:

```powershell
python study/scripts/verify_data_archive.py
```

The verifier checks the archive-level SHA-256 and then streams every member to
confirm its path, byte size, and SHA-256 against the TSV index.

## Restore

Extract only in a clean checkout or a separate analysis directory because the
archive restores the byte-original schedules as well as the ignored raw trees:

```powershell
tar -xzf study/data/thoughtml-study-data-v1.tar.gz
```

The schedules kept in the normal checkout are JSON-semantically identical but
compact. Extraction restores their original pretty-printed bytes.
