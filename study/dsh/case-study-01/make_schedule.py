"""Emit the frozen session schedule for DSH case study 01.

Deterministic: one seed, blocked by repetition, condition order randomised
within each block. Re-running reproduces schedule.json byte for byte.

    python make_schedule.py --check    # verify schedule.json matches
    python make_schedule.py --write    # regenerate schedule.json
"""

import argparse
import json
import os
import random

ROOT = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(ROOT, "schedule.json")

TASK = "cattrs-partial-structuring-recovery"
CONDITIONS = ("D", "M", "T")
REPETITIONS = 3
SEED = 20260825  # frozen on 2026-08-25, before any session was run


def build():
    rng = random.Random(SEED)
    sessions = []
    blocks = []
    for block in range(1, REPETITIONS + 1):
        order = list(CONDITIONS)
        rng.shuffle(order)
        blocks.append(order)
        for slot, cond in enumerate(order, 1):
            sessions.append(
                {
                    "session_id": "cs01-b%d-s%d-%s" % (block, slot, cond),
                    "block": block,
                    "slot": slot,
                    "condition": cond,
                    "task": TASK,
                }
            )
    return {
        "study": "dsh-case-study-01",
        "task": TASK,
        "conditions": list(CONDITIONS),
        "repetitions": REPETITIONS,
        "total_sessions": len(sessions),
        "seed": SEED,
        "blocking": "one block per repetition; condition order shuffled within block",
        "block_orders": blocks,
        "sessions": sessions,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    sched = build()
    text = json.dumps(sched, indent=1)

    if args.write:
        # newline="\n" so the freeze record is byte-identical on Windows and
        # Linux; make_manifest.py hashes these bytes.
        with open(DEST, "w", encoding="utf-8", newline="\n") as f:
            f.write(text + "\n")
        print("wrote", DEST)
    elif args.check:
        with open(DEST, encoding="utf-8") as f:
            on_disk = f.read()
        ok = on_disk == text + "\n"
        print("schedule matches frozen seed:", ok)
        raise SystemExit(0 if ok else 1)
    else:
        print(text)


if __name__ == "__main__":
    main()
