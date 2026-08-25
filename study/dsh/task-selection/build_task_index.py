"""Join DeepSWE v1.1 published trial data with local task metadata.

Inputs
    deep-swe/                          clone of github.com/datacurve-ai/deep-swe
    data/deepswe-v1.1-trials.jsonl.gz  output of collect_trials.py

Output
    data/deepswe-v1.1-task-index.json  one row per task

No network access, no model calls.
"""

import collections
import gzip
import json
import os
import statistics as st
import sys
import tomllib

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
TDIR = os.environ.get("DEEPSWE_TASKS") or os.path.join(ROOT, "deep-swe", "tasks")


def meta(task):
    d = os.path.join(TDIR, task)
    with open(os.path.join(d, "task.toml"), "rb") as f:
        cfg = tomllib.load(f)
    md = cfg.get("metadata", {})
    env = cfg.get("environment", {})
    agent = cfg.get("agent", {})
    verifier = cfg.get("verifier", {})

    def sz(*parts):
        p = os.path.join(d, *parts)
        return os.path.getsize(p) if os.path.exists(p) else 0

    return dict(
        task=task,
        lang=md.get("language"),
        repo=md.get("repository_url"),
        base_commit=md.get("base_commit_hash"),
        category=md.get("category"),
        title=md.get("display_title"),
        ext_id=md.get("ext_id"),
        image=env.get("docker_image"),
        cpus=env.get("cpus"),
        mem_mb=env.get("memory_mb"),
        storage_mb=env.get("storage_mb"),
        agent_timeout=agent.get("timeout_sec"),
        agent_network=agent.get("network_mode"),
        verifier_timeout=verifier.get("timeout_sec"),
        verifier_mode=verifier.get("environment_mode"),
        instr_b=sz("instruction.md"),
        sol_b=sz("solution", "solution.patch"),
        testpatch_b=sz("tests", "test.patch"),
        cfg_b=sz("tests", "config.json"),
    )


def main():
    if not os.path.isdir(TDIR):
        sys.exit(
            "task directory not found: %s\n"
            "clone it first:  git clone --depth 1 "
            "https://github.com/datacurve-ai/deep-swe" % TDIR
        )

    path = os.path.join(DATA, "deepswe-v1.1-trials.jsonl.gz")
    with gzip.open(path, "rt", encoding="utf-8") as f:
        rows = [json.loads(line) for line in f]

    byt = collections.defaultdict(list)
    for r in rows:
        byt[r["task_name"]].append(r)

    out = []
    for task, trials in byt.items():
        m = meta(task)
        scored = [r for r in trials if r["included_in_score"]]
        fl = [r for r in scored if r["model"] == "deepseek-v4-flash"]

        def avg(vals):
            vals = [v for v in vals if v is not None]
            return st.mean(vals) if vals else None

        m.update(
            n_all=len(scored),
            all_pass=(sum(r["passed"] for r in scored) / len(scored)) if scored else None,
            n_err=sum(1 for r in trials if not r["included_in_score"]),
            flash_n=len(fl),
            flash_pass=sum(r["passed"] for r in fl),
            flash_rate=(sum(r["passed"] for r in fl) / len(fl)) if fl else None,
            flash_steps=avg([r["n_agent_steps"] for r in fl]),
            flash_steps_pass=avg([r["n_agent_steps"] for r in fl if r["passed"]]),
            flash_cost=avg([r["cost_usd"] for r in fl]),
            flash_out_tok=avg([r["n_output_tokens"] for r in fl]),
            flash_in_tok=avg([r["n_input_tokens"] for r in fl]),
            flash_peak_ctx=avg([r["peak_context_tokens"] for r in fl]),
            flash_dur_s=avg([r["agent_duration_seconds"] for r in fl]),
            flash_partial=avg([r["partial"] for r in fl]),
            f2p_total=(fl[0]["f2p_total"] if fl else None),
            p2p_total=(fl[0]["p2p_total"] if fl else None),
            flash_p2p_fail=sum(1 for r in fl if r["p2p"] is not None and r["p2p"] < 1),
        )
        out.append(m)

    out.sort(key=lambda t: t["task"])
    dest = os.path.join(DATA, "deepswe-v1.1-task-index.json")
    # newline="\n" so the index is byte-identical on Windows and Linux.
    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=1)
    print("tasks indexed", len(out), "->", dest)


if __name__ == "__main__":
    main()
