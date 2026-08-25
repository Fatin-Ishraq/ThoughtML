"""Gate 4: prove the reported metrics are reproducible from raw session events.

`metrics-summary.json` is written by the study's metrics collector as the session
runs. This script recomputes the same quantities *independently*, from the raw
`events.jsonl` and `tools.jsonl` written by a separate plugin, and fails if any
of them disagree.

That matters because protocol.md §6 lists environment actions, tool calls, and
tokens as reported outcomes, and §10 gate 4 requires them to be reproducible from
the raw events rather than trusted because a live counter said so. A silent
mismatch would mean the numbers in the write-up cannot be re-derived from the
preserved artifacts.

    python verify_extraction.py <trial-agent-dir> [more dirs...]
    python verify_extraction.py --job <jobs-dir>      # every trial under a job

Reads only. No container, no model call, no credential.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

# Mirrors integrations/dsh/src/index.js STATE_TOOL_NAMES.
STATE_TOOL_NAMES = (
    "reasoning_state_read",
    "reasoning_state_commit",
    "reasoning_state_inspect",
    "reasoning_state_diff",
    "reasoning_state_explain",
    "reasoning_state_analyze",
)


def signature(name: str, arguments) -> str:
    """Mirrors metrics.js signature(): sha256 of name + JSON arguments.

    json.dumps with these separators matches JSON.stringify for the scalar and
    container shapes DSH emits as tool arguments.
    """
    encoded = json.dumps(arguments, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(("%s\n%s" % (name, encoded)).encode("utf-8")).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    rows = []
    if not path.is_file():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def recompute(agent_dir: Path) -> dict:
    events = read_jsonl(agent_dir / "logs" / "events.jsonl")
    tools = read_jsonl(agent_dir / "logs" / "tools.jsonl")

    out = {
        "steps": 0,
        "turns": 0,
        "modelCalls": 0,
        "eventCount": len(events),
        "inputTokens": 0,
        "cacheReadTokens": 0,
        "outputTokens": 0,
        "reasoningTokens": 0,
        "providers": [],
        "models": [],
    }

    for e in events:
        etype = e.get("type")
        data = e.get("data") or {}
        if etype == "step/end":
            out["steps"] += 1
        elif etype == "turn/end":
            out["turns"] += 1
        elif etype == "request/header":
            cfg = ((data.get("header") or {}).get("config")) or {}
            for key, field in (("provider", "providers"), ("model", "models")):
                value = cfg.get(key)
                if value and value not in out[field]:
                    out[field].append(value)
        elif etype == "assistant/message":
            out["modelCalls"] += 1
            usage = data.get("usage") or {}
            for field in (
                "inputTokens",
                "cacheReadTokens",
                "outputTokens",
                "reasoningTokens",
            ):
                out[field] += int(usage.get(field) or 0)

    # Tool-derived measures, replaying metrics.js observeToolResult().
    tool_counts = {
        "toolCalls": 0,
        "failedToolCalls": 0,
        "repeatedActions": 0,
        "repeatedFailedActions": 0,
        "recoveryEpisodesStarted": 0,
        "recoveryEpisodesCompleted": 0,
        "stateReads": 0,
        "stateInspections": 0,
        "stateDiffs": 0,
        "stateExplanations": 0,
        "stateAnalyses": 0,
        "stateCommitAttempts": 0,
    }
    distances: list[int] = []
    last_signature = None
    open_failure = None
    tool_index = 0

    for t in tools:
        name = t.get("name")
        sig = signature(name, t.get("arguments"))
        tool_index += 1
        tool_counts["toolCalls"] += 1
        if last_signature == sig:
            tool_counts["repeatedActions"] += 1
        last_signature = sig

        is_state_tool = name in STATE_TOOL_NAMES
        if t.get("isError"):
            tool_counts["failedToolCalls"] += 1
            if not is_state_tool:
                if open_failure and open_failure["signature"] == sig:
                    tool_counts["repeatedFailedActions"] += 1
                if not open_failure:
                    tool_counts["recoveryEpisodesStarted"] += 1
                    open_failure = {"signature": sig, "toolIndex": tool_index}
        elif not is_state_tool and open_failure:
            tool_counts["recoveryEpisodesCompleted"] += 1
            distances.append(tool_index - open_failure["toolIndex"])
            open_failure = None

        for tool_name, field in (
            ("reasoning_state_read", "stateReads"),
            ("reasoning_state_inspect", "stateInspections"),
            ("reasoning_state_diff", "stateDiffs"),
            ("reasoning_state_explain", "stateExplanations"),
            ("reasoning_state_analyze", "stateAnalyses"),
            ("reasoning_state_commit", "stateCommitAttempts"),
        ):
            if name == tool_name:
                tool_counts[field] += 1

    out.update(tool_counts)
    out["recoveryToolDistances"] = distances
    return out


COMPARED = (
    "steps",
    "turns",
    "modelCalls",
    "eventCount",
    "inputTokens",
    "cacheReadTokens",
    "outputTokens",
    "reasoningTokens",
    "toolCalls",
    "failedToolCalls",
    "repeatedActions",
    "repeatedFailedActions",
    "recoveryEpisodesStarted",
    "recoveryEpisodesCompleted",
    "stateReads",
    "stateInspections",
    "stateDiffs",
    "stateExplanations",
    "stateAnalyses",
    "stateCommitAttempts",
    "providers",
    "models",
    "recoveryToolDistances",
)


def verify(agent_dir: Path) -> tuple[bool, list[str]]:
    summary_path = agent_dir / "metrics" / "metrics-summary.json"
    if not summary_path.is_file():
        return False, ["no metrics-summary.json under %s" % agent_dir]

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    sessions = summary.get("sessions") or []
    if len(sessions) != 1:
        return False, [
            "expected exactly one session, found %d (multi-session summaries need "
            "per-session raw logs to compare against)" % len(sessions)
        ]
    reported = sessions[0]
    derived = recompute(agent_dir)

    problems = []
    for field in COMPARED:
        want = reported.get(field)
        got = derived.get(field)
        if isinstance(want, list) and isinstance(got, list):
            match = sorted(map(str, want)) == sorted(map(str, got))
        else:
            match = (want or 0) == (got or 0)
        if not match:
            problems.append("  %-28s summary=%r  recomputed=%r" % (field, want, got))
    return (not problems), problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="*", type=Path, help="trial agent/ directories")
    ap.add_argument(
        "--job",
        type=Path,
        action="append",
        default=[],
        help="a jobs dir; verifies every trial under it (repeatable)",
    )
    args = ap.parse_args()

    targets: list[Path] = list(args.dirs)
    for job in args.job:
        targets.extend(
            sorted(
                # .../agent/metrics/metrics-summary.json -> .../agent
                p.parent.parent
                for p in job.rglob("agent/metrics/metrics-summary.json")
            )
        )
    if not targets:
        ap.error("give at least one agent directory or --job")

    failures = 0
    for agent_dir in targets:
        ok, problems = verify(agent_dir)
        label = agent_dir.parent.name or str(agent_dir)
        if ok:
            print("PASS  %s" % label)
        else:
            failures += 1
            print("FAIL  %s" % label)
            for line in problems:
                print(line)

    print()
    print("%d verified, %d failed" % (len(targets) - failures, failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
