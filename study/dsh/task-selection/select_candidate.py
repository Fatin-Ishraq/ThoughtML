"""Deterministic DeepSWE v1.1 task selection for the DSH agent-utility case study.

Reads only the frozen data in ``data/`` and re-derives the shortlist and the
single recommended candidate. No network access, no model calls.

Selection criteria are declared as constants below and were fixed BEFORE any
D/M/T session was run, so re-running this file reproduces the same shortlist.

Usage:
    python select_candidate.py            # shortlist + candidate
    python select_candidate.py --all      # also dump the full 113-task band table
"""

import argparse
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")

# --- Frozen selection criteria -------------------------------------------------
#
# C1  Difficulty band. deepseek-v4-flash must pass exactly 2 of its 4 published
#     v1.1 trials on the task. This is the maximum-variance interior point: it
#     rules out the ceiling effect that invalidated the Terra calibration pilots
#     (exp0-pilot-v2.4 / v2.6) and the symmetric floor effect.
# C2  Infrastructure cleanliness. Zero excluded_error trials across ALL 248
#     published v1.1 trials for the task (any model), i.e. no evidence of broken
#     dependencies, container faults, or verifier errors.
# C3  Verifier stability. Zero pass-to-pass regressions across the four Flash
#     trials, i.e. the held-out regression suite is not flaky under this model.
# C4  Host footprint. Compressed agent image at or below the cap below, since the
#     evaluation host is resource-constrained.
# C5  Budget. Mean Flash agent steps within the band below: long-horizon enough
#     that persistent state could matter, short enough to run 3 conditions.
#
# None of these criteria reference ThoughtML, reasoning structure, or anything
# that could favour condition T over condition M.

FLASH_PASSES_OF_4 = 2
MAX_EXCLUDED_ERRORS = 0
MAX_P2P_REGRESSIONS = 0
MAX_IMAGE_MB = 1000.0
STEP_BAND = (100, 200)


def load():
    with open(os.path.join(DATA, "deepswe-v1.1-task-index.json"), encoding="utf-8") as f:
        tasks = json.load(f)
    with open(os.path.join(DATA, "deepswe-v1.1-image-sizes.json"), encoding="utf-8") as f:
        sizes = json.load(f)
    for t in tasks:
        t["img_mb"] = round(sizes[t["task"]]["compressed_bytes"] / 1e6, 1)
    return tasks


def band(tasks):
    return [t for t in tasks if t["flash_pass"] == FLASH_PASSES_OF_4]


def shortlist(tasks):
    out = []
    for t in band(tasks):
        if t["n_err"] > MAX_EXCLUDED_ERRORS:
            continue
        if t["flash_p2p_fail"] > MAX_P2P_REGRESSIONS:
            continue
        if t["img_mb"] > MAX_IMAGE_MB:
            continue
        if not (STEP_BAND[0] <= t["flash_steps"] <= STEP_BAND[1]):
            continue
        out.append(t)
    # Deterministic order: smallest image first, then fewest steps, then name.
    return sorted(out, key=lambda t: (t["img_mb"], t["flash_steps"], t["task"]))


ROW = "%-40s %-11s %7s %6s %7s %6s %6s %6s"
HEAD = ROW % ("task", "lang", "img_MB", "steps", "dur_s", "f2p", "p2p", "all")


def show(rows):
    print(HEAD)
    for t in rows:
        print(
            ROW
            % (
                t["task"][:40],
                t["lang"],
                t["img_mb"],
                round(t["flash_steps"]),
                round(t["flash_dur_s"]),
                t["f2p_total"],
                t["p2p_total"],
                round(t["all_pass"], 2),
            )
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="also print the full 2/4 band")
    args = ap.parse_args()

    tasks = load()
    b = band(tasks)
    s = shortlist(tasks)

    print("DeepSWE v1.1 - 113 tasks, 4 published deepseek-v4-flash trials each\n")
    if args.all:
        print("C1 difficulty band (flash %d/4): %d tasks\n" % (FLASH_PASSES_OF_4, len(b)))
        show(sorted(b, key=lambda t: t["task"]))
        print()

    print("After C1-C5: %d tasks\n" % len(s))
    show(s)

    if s:
        c = s[0]
        print("\nRECOMMENDED CANDIDATE: %s" % c["task"])
        print("  repo        %s" % c["repo"])
        print("  language    %s" % c["lang"])
        print("  category    %s" % c["category"])
        print("  image       %s" % c["image"])
        print("  image size  %.1f MB compressed" % c["img_mb"])
        print("  container   %s cpu / %s MB mem / %s MB disk declared"
              % (c["cpus"], c["mem_mb"], c["storage_mb"]))
        print("  agent limit %s s" % c["agent_timeout"])
        print("  flash       %d/4 pass, mean %d steps, mean $%.2f, mean %d s"
              % (c["flash_pass"], round(c["flash_steps"]), c["flash_cost"],
                 round(c["flash_dur_s"])))
        print("  tests       %d fail-to-pass, %d pass-to-pass"
              % (c["f2p_total"], c["p2p_total"]))


if __name__ == "__main__":
    main()
