#!/usr/bin/env python3
"""Pre-data H1b task-count estimation using the registered cluster bootstrap."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

import power
import studylib as lib


TASK_COUNTS = (30, 60, 90, 120, 150, 180)
EFFECTS = (0.06, 0.08, 0.10, 0.12)


def estimate(simulations: int, bootstraps: int, seed: int) -> dict[str, object]:
    grid = []
    cell = 0
    for tasks in TASK_COUNTS:
        for effect in EFFECTS:
            grid.append(
                {
                    "tasks": tasks,
                    "effect": effect,
                    "correct_rate": 0.72,
                    "power": power.simulate_h1b(
                        effect,
                        simulations,
                        bootstraps,
                        seed + cell,
                        tasks=tasks,
                        correct_rate=0.72,
                    ),
                }
            )
            cell += 1

    minimum_tasks = {}
    for effect in EFFECTS:
        passing = [
            row["tasks"]
            for row in grid
            if row["effect"] == effect and row["power"] >= 0.80
        ]
        minimum_tasks[str(effect)] = min(passing) if passing else None

    return {
        "schema_version": 1,
        "pre_data": True,
        "method": "Monte Carlo simulation of paired-condition AUROC contrast with cluster bootstrap over tasks",
        "seed": seed,
        "simulations_per_cell": simulations,
        "cluster_bootstraps_per_simulation": bootstraps,
        "fixed_assumptions": {
            "models_per_task": 6,
            "base_auroc": 0.60,
            "primary_grid_correct_rate": 0.72,
            "decision_rule": "95% cluster-bootstrap CI lower bound greater than zero",
            "target_power": 0.80,
        },
        "primary_grid": grid,
        "minimum_tested_tasks_at_80pct_by_effect": minimum_tasks,
        "accuracy_sensitivity": "Not varied in this planning grid; the pilot acceptance window protects against near-all-correct or near-all-wrong labels.",
        "interpretation_boundary": "These are planning estimates under explicit simulation assumptions, not observed performance.",
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulations", type=int, default=150)
    parser.add_argument("--bootstraps", type=int, default=120)
    parser.add_argument("--seed", type=int, default=20260821)
    parser.add_argument("--out", default=str(lib.STUDY / "sample-size-estimation.json"))
    args = parser.parse_args(argv)
    report = estimate(args.simulations, args.bootstraps, args.seed)
    output = Path(args.out)
    if not output.is_absolute():
        output = lib.REPO / output
    lib.write_json(output, report)
    print(f"wrote {output}")
    for effect, tasks in report["minimum_tested_tasks_at_80pct_by_effect"].items():
        print(f"effect={effect}: minimum tested tasks at 80% power = {tasks}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
