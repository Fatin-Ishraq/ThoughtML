"""Collect every published DeepSWE v1.1 trial record.

The DeepSWE site server-renders each task page with the full trial list for that
task embedded in the payload. This walks the 113 task ids from the task repo and
extracts those records into one gzipped JSONL file.

This reads public benchmark result pages only. It makes no model calls and
submits nothing.

Usage:
    git clone --depth 1 https://github.com/datacurve-ai/deep-swe
    python collect_trials.py            # writes data/deepswe-v1.1-trials.jsonl.gz
"""

import concurrent.futures
import gzip
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
TDIR = os.environ.get("DEEPSWE_TASKS") or os.path.join(ROOT, "deep-swe", "tasks")
DEST = os.path.join(ROOT, "data", "deepswe-v1.1-trials.jsonl.gz")
BASE = "https://deepswe.datacurve.ai/data/v1.1/tasks/%s"

STR_FIELDS = (
    "trial_name", "task_name", "source", "eval_scope", "model", "provider",
    "harness", "config", "reasoning_effort", "outcome", "error_category",
    "started_at", "finished_at", "metrics_source",
)
NUM_FIELDS = (
    "reward", "score_value", "f2p_total", "f2p_passed", "p2p_total", "p2p_passed",
    "f2p", "p2p", "partial", "n_agent_steps", "cost_usd", "n_input_tokens",
    "n_cache_tokens", "n_output_tokens", "peak_context_tokens",
    "agent_duration_seconds", "trial_duration_seconds",
)
BOOL_FIELDS = (
    "passed", "errored", "included_in_score", "has_model_patch", "has_trajectory",
    "has_verifier_output",
)
# Fields kept as int when the payload holds a whole number.
INT_FIELDS = {
    "f2p_total", "f2p_passed", "p2p_total", "p2p_passed", "n_agent_steps",
    "n_input_tokens", "n_cache_tokens", "n_output_tokens", "peak_context_tokens",
}


def fetch(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "thoughtml-study-task-selection/1.0",
            "Accept-Encoding": "gzip",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read()
        encoded = resp.headers.get("Content-Encoding") == "gzip"
    if encoded:
        raw = gzip.decompress(raw)
    return raw.decode("utf-8", "replace")


def records(html):
    """Pull each {trial_name:...} object out of the rendered payload.

    The payload is a JS object literal, not JSON: bare keys, !0/!1 booleans, and
    back-references. Rather than reimplement a JS parser, each record is located
    by brace matching and then read field by field. Every value of interest is an
    identifier, enum, ISO timestamp, number, or boolean, so no string in the set
    contains an escaped quote.
    """
    out = []
    for match in re.finditer(r'{trial_name:"', html):
        start = match.start()
        depth = 0
        end = None
        for i in range(start, min(len(html), start + 20000)):
            if html[i] == "{":
                depth += 1
            elif html[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end is None:
            continue
        chunk = html[start:end]
        rec = {}
        for key in STR_FIELDS:
            m = re.search(r'[,{]%s:(?:"([^"]*)"|null)' % key, chunk)
            rec[key] = m.group(1) if (m and m.group(1) is not None) else None
        for key in NUM_FIELDS:
            m = re.search(
                r"[,{]%s:(?:(-?[0-9]+(?:[.][0-9]+)?(?:[eE][-+]?[0-9]+)?)|null)" % key,
                chunk,
            )
            val = float(m.group(1)) if (m and m.group(1) is not None) else None
            if val is not None and key in INT_FIELDS and val == int(val):
                val = int(val)
            rec[key] = val
        for key in BOOL_FIELDS:
            m = re.search(r"[,{]%s:(!0|!1)" % key, chunk)
            rec[key] = (m.group(1) == "!0") if m else None
        out.append(rec)
    return out


def one(task):
    try:
        return task, records(fetch(BASE % task)), None
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        return task, [], repr(exc)


def main():
    if not os.path.isdir(TDIR):
        sys.exit(
            "task directory not found: %s\n"
            "clone it first:  git clone --depth 1 "
            "https://github.com/datacurve-ai/deep-swe" % TDIR
        )
    tasks = sorted(
        d for d in os.listdir(TDIR) if os.path.isdir(os.path.join(TDIR, d))
    )

    rows, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for i, (task, recs, err) in enumerate(pool.map(one, tasks), 1):
            if err:
                errors.append((task, err))
            rows.extend(recs)
            print("%3d/%d %-55s %4d %s" % (i, len(tasks), task, len(recs), err or ""),
                  flush=True)

    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    with gzip.open(DEST, "wt", encoding="utf-8", compresslevel=9) as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")

    print("TOTAL", len(rows), "ERRORS", len(errors), "->", DEST)
    for task, err in errors:
        print("ERR", task, err)
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
