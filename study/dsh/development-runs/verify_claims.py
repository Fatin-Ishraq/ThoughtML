"""Recompute every development-run figure quoted in the study README.

Reads only the files in this directory. No model call, no network, no host access.

    python3 verify_claims.py

Exits non-zero if any claim fails to reproduce, so it can run in CI.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The figures asserted in ../../README.md section 4. If the evidence stops
# supporting one of these, this script fails rather than the README quietly
# becoming wrong.
CLAIMED = {
    "state_commit_attempts": 24,
    "state_commits_accepted": 13,
    "checker_rejections": 9,
    "tool_errors": 2,
    "rejections_repaired": 9,
    "repaired_on_next_attempt": 8,
    "sessions": 17,
}


def load_commit_sequences() -> dict[str, list[str]]:
    """Per run, the ordered outcome of every reasoning_state_commit attempt."""
    sequences = {}
    for path in sorted(HERE.glob("*/state-commits.jsonl")):
        outcomes = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            event = json.loads(line)
            if event.get("committed"):
                outcomes.append("accepted")
            elif event.get("valid") is False:
                outcomes.append("rejected")
            else:
                outcomes.append("error")
        sequences[path.parent.name] = outcomes
    return sequences


def main() -> int:
    sequences = load_commit_sequences()
    counts = Counter(o for seq in sequences.values() for o in seq)

    # A rejection is "repaired" when a later attempt in the same session is
    # accepted. Counting per session, not globally, so a different session's
    # success cannot be credited to this one's failure.
    repaired = next_attempt = 0
    for outcomes in sequences.values():
        for i, outcome in enumerate(outcomes):
            if outcome != "rejected":
                continue
            if "accepted" in outcomes[i + 1:]:
                repaired += 1
            if i + 1 < len(outcomes) and outcomes[i + 1] == "accepted":
                next_attempt += 1

    # A run directory can hold several sessions -- smoke-01 holds five -- so the
    # extractor numbers them. Globbing only the unnumbered name undercounts.
    sessions = sum(
        len(json.loads(p.read_text(encoding="utf-8")).get("sessions") or [])
        for p in sorted(HERE.glob("*/metrics-summary*.json"))
    )

    observed = {
        "state_commit_attempts": sum(counts.values()),
        "state_commits_accepted": counts["accepted"],
        "checker_rejections": counts["rejected"],
        "tool_errors": counts["error"],
        "rejections_repaired": repaired,
        "repaired_on_next_attempt": next_attempt,
        "sessions": sessions,
    }

    failures = []
    print("%-28s %8s %8s" % ("claim", "README", "observed"))
    for key, claimed in CLAIMED.items():
        got = observed[key]
        mark = "ok" if got == claimed else "MISMATCH"
        if got != claimed:
            failures.append(key)
        print("%-28s %8d %8d  %s" % (key, claimed, got, mark))

    codes = Counter(
        d.get("code", "?")
        for path in sorted(HERE.glob("*/state-commits.jsonl"))
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
        for d in json.loads(line).get("diagnostics") or []
    )
    print("\nchecker diagnostic codes across all rejections:")
    for code, n in sorted(codes.items()):
        print("  %-24s %d" % (code, n))

    print("\nper-run commit sequence:")
    for run, outcomes in sequences.items():
        short = " ".join(o[:3].upper() for o in outcomes)
        print("  %-18s %s" % (run, short))

    if failures:
        print("\nFAILED to reproduce: %s" % ", ".join(failures))
        return 1
    print("\nevery claimed figure reproduces from the evidence in this directory")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
