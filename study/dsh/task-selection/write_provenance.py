"""Regenerate data/provenance.json (hashes every other file in this directory)."""

import gzip
import hashlib
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(ROOT, "data", "provenance.json")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main():
    files = {}
    for base, _, names in os.walk(ROOT):
        for name in sorted(names):
            full = os.path.join(base, name)
            if os.path.abspath(full) == DEST:
                continue
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            files[rel] = {"sha256": sha256(full), "bytes": os.path.getsize(full)}

    trials = os.path.join(ROOT, "data", "deepswe-v1.1-trials.jsonl.gz")
    with gzip.open(trials, "rt", encoding="utf-8") as f:
        rows = sum(1 for _ in f)

    prov = {
        "record": "DeepSWE v1.1 task-selection inputs for the DSH agent-utility case study",
        "collected_on": "2026-08-25",
        "no_model_calls": True,
        "benchmark": {
            "name": "DeepSWE",
            "version": "v1.1",
            "tasks": 113,
            "site": "https://deepswe.datacurve.ai/",
            "task_repo": "https://github.com/datacurve-ai/deep-swe",
            "task_repo_commit": "435ee89ec2f2e2289f33b0da4f992f0b7b7266b9",
            "task_repo_commit_date": "2026-08-06T13:01:53-07:00",
            "task_repo_license": "Apache-2.0",
            "runner": "https://github.com/datacurve-ai/pier",
            "published_harness": "mini-swe-agent on Modal",
        },
        "trials": {
            "rows": rows,
            "scope": "all published v1.1 trials for all 113 tasks",
            "source": "server-rendered payload of "
            "https://deepswe.datacurve.ai/data/v1.1/tasks/<task-id>",
            "trials_per_task_model_config": 4,
            "validation": "deepseek-v4-flash reproduces the published leaderboard "
            "score: 241/452 = 53.3% pass@1 (site reports 53% +/- 4%)",
        },
        "files": files,
    }

    with open(DEST, "w", encoding="utf-8") as f:
        json.dump(prov, f, indent=1)
    print("wrote", DEST, "covering", len(files), "files")


if __name__ == "__main__":
    main()
