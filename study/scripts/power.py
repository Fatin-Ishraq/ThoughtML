#!/usr/bin/env python3
"""Pre-data simulation-based power checks for the four registered primaries."""

from __future__ import annotations

import argparse
import math
import random
import statistics
from pathlib import Path
from typing import Callable, Sequence

import studylib as lib


NORMAL = statistics.NormalDist()


def rank_abs(values: Sequence[float]) -> list[float]:
    indexed = sorted(enumerate(values), key=lambda x: abs(x[1]))
    ranks = [0.0] * len(values)
    i = 0
    while i < len(indexed):
        j = i + 1
        while j < len(indexed) and abs(indexed[j][1]) == abs(indexed[i][1]):
            j += 1
        rank = ((i + 1) + j) / 2
        for k in range(i, j):
            ranks[indexed[k][0]] = rank
        i = j
    return ranks


def wilcoxon_one_sided_positive(values: Sequence[float]) -> float:
    nonzero = [v for v in values if abs(v) > 1e-12]
    n = len(nonzero)
    if n < 2:
        return 1.0
    ranks = rank_abs(nonzero)
    w_plus = sum(rank for rank, value in zip(ranks, nonzero) if value > 0)
    mean = n * (n + 1) / 4
    variance = n * (n + 1) * (2 * n + 1) / 24
    z = (w_plus - mean - 0.5) / math.sqrt(variance)
    return 1 - NORMAL.cdf(z)


def percentile(values: Sequence[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return math.nan
    position = (len(ordered) - 1) * q
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return ordered[low]
    return ordered[low] * (high - position) + ordered[high] * (position - low)


def fast_auroc(rows: Sequence[tuple[bool, float]]) -> float | None:
    positives = sum(label for label, _ in rows)
    negatives = len(rows) - positives
    if positives == 0 or negatives == 0:
        return None
    ordered = sorted(rows, key=lambda row: row[1])
    positive_rank_sum = 0.0
    i = 0
    while i < len(ordered):
        j = i + 1
        while j < len(ordered) and ordered[j][1] == ordered[i][1]:
            j += 1
        average_rank = ((i + 1) + j) / 2
        positive_rank_sum += average_rank * sum(label for label, _ in ordered[i:j])
        i = j
    return (positive_rank_sum - positives * (positives + 1) / 2) / (positives * negatives)


def cluster_bootstrap(
    task_rows: Sequence[Sequence[tuple[bool, float]]],
    statistic: Callable[[list[tuple[bool, float]]], float | None],
    rng: random.Random,
    samples: int,
) -> list[float]:
    out: list[float] = []
    n = len(task_rows)
    for _ in range(samples):
        flattened: list[tuple[bool, float]] = []
        for _ in range(n):
            flattened.extend(task_rows[rng.randrange(n)])
        value = statistic(flattened)
        if value is not None:
            out.append(value)
    return out


def score_for_auc(label: bool, auc: float, rng: random.Random) -> float:
    separation = math.sqrt(2) * NORMAL.inv_cdf(auc)
    mean = separation / 2 if label else -separation / 2
    return rng.gauss(mean, 1.0)


def simulate_h1a(delta: float, simulations: int, seed: int) -> float:
    rng = random.Random(seed)
    rejections = 0
    for _ in range(simulations):
        task_differences = [rng.gauss(delta, 0.09) for _ in range(30)]
        if wilcoxon_one_sided_positive(task_differences) < 0.05:
            rejections += 1
    return rejections / simulations


def simulate_h1b(
    delta_auc: float,
    simulations: int,
    bootstraps: int,
    seed: int,
    base_auc: float = 0.60,
    tasks: int = 30,
    correct_rate: float = 0.72,
) -> float:
    rng = random.Random(seed)
    rejections = 0
    target_auc = min(0.98, base_auc + delta_auc)
    for _ in range(simulations):
        paired_tasks: list[tuple[list[tuple[bool, float]], list[tuple[bool, float]]]] = []
        for _task in range(tasks):
            f_rows: list[tuple[bool, float]] = []
            b_rows: list[tuple[bool, float]] = []
            for _model in range(6):
                correct = rng.random() < correct_rate
                f_rows.append((correct, score_for_auc(correct, base_auc, rng)))
                b_rows.append((correct, score_for_auc(correct, target_auc, rng)))
            paired_tasks.append((f_rows, b_rows))
        deltas: list[float] = []
        for _ in range(bootstraps):
            sampled = [paired_tasks[rng.randrange(tasks)] for _ in range(tasks)]
            f = [row for task in sampled for row in task[0]]
            b = [row for task in sampled for row in task[1]]
            f_auc = fast_auroc(f)
            b_auc = fast_auroc(b)
            if f_auc is not None and b_auc is not None:
                deltas.append(b_auc - f_auc)
        if deltas and percentile(deltas, 0.025) > 0:
            rejections += 1
    return rejections / simulations


def simulate_upper_bound(
    true_mean: float,
    decision_bound: float,
    task_sd: float,
    document_sd: float,
    documents_per_task: int,
    simulations: int,
    bootstraps: int,
    seed: int,
) -> float:
    rng = random.Random(seed)
    confirmations = 0
    for _ in range(simulations):
        tasks: list[list[float]] = []
        for _task in range(12):
            task_mean = rng.gauss(true_mean, task_sd)
            tasks.append(
                [min(1.0, max(0.0, rng.gauss(task_mean, document_sd))) for _ in range(documents_per_task)]
            )
        estimates: list[float] = []
        for _ in range(bootstraps):
            sampled = [tasks[rng.randrange(12)] for _ in range(12)]
            values = [value for task in sampled for value in task]
            estimates.append(sum(values) / len(values))
        if percentile(estimates, 0.975) < decision_bound:
            confirmations += 1
    return confirmations / simulations


def first_at_least(grid: list[dict[str, float]], threshold: float = 0.8) -> float | None:
    for row in grid:
        if row["power"] >= threshold:
            return row["effect"]
    return None


def run_simulations(simulations: int, bootstraps: int, seed: int) -> dict[str, object]:
    h1a = [
        {"effect": effect, "power": simulate_h1a(effect, simulations, seed + i)}
        for i, effect in enumerate((0.03, 0.04, 0.05, 0.06, 0.07, 0.08))
    ]
    h1b = [
        {
            "effect": effect,
            "power": simulate_h1b(effect, simulations, bootstraps, seed + 100 + i),
        }
        for i, effect in enumerate((0.04, 0.06, 0.08, 0.10, 0.12, 0.16))
    ]
    h2 = [
        {
            "effect": effect,
            "power": simulate_upper_bound(
                effect, 0.15, 0.025, 0.04, 18, simulations, bootstraps, seed + 200 + i
            ),
        }
        for i, effect in enumerate((0.03, 0.05, 0.07, 0.09, 0.11, 0.13))
    ]
    h3 = [
        {
            "effect": effect,
            "power": simulate_upper_bound(
                effect, 0.35, 0.04, 0.08, 15, simulations, bootstraps, seed + 300 + i
            ),
        }
        for i, effect in enumerate((0.15, 0.20, 0.25, 0.30, 0.35))
    ]
    return {
        "schema_version": 1,
        "pre_data": True,
        "seed": seed,
        "simulations_per_cell": simulations,
        "cluster_bootstraps_per_simulation": bootstraps,
        "assumptions": {
            "h1a_task_sd": 0.09,
            "h1b_base_auroc": 0.60,
            "h1b_correct_rate": 0.72,
            "h2_task_sd": 0.025,
            "h2_document_sd": 0.04,
            "h3_task_sd": 0.04,
            "h3_pair_sd": 0.08,
            "note": "Sensitivity assumptions are explicit; rerun alternative scenarios before freeze, never after outcomes are seen.",
        },
        "h1a": {"grid": h1a, "mde_at_80pct": first_at_least(h1a)},
        "h1b": {"grid": h1b, "mde_at_80pct": first_at_least(h1b)},
        "h2": {"grid": h2, "largest_true_mean_with_80pct_confirmation": next((r["effect"] for r in reversed(h2) if r["power"] >= 0.8), None)},
        "h3": {"grid": h3, "largest_true_mean_with_80pct_confirmation": next((r["effect"] for r in reversed(h3) if r["power"] >= 0.8), None)},
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulations", type=int, default=500)
    parser.add_argument("--bootstraps", type=int, default=500)
    parser.add_argument("--seed", type=int, default=20260820)
    parser.add_argument("--out", default=str(lib.STUDY / "power-analysis.json"))
    args = parser.parse_args(argv)
    report = run_simulations(args.simulations, args.bootstraps, args.seed)
    out = Path(args.out)
    if not out.is_absolute():
        out = lib.REPO / out
    lib.write_json(out, report)
    print(f"wrote {out}")
    for hypothesis in ("h1a", "h1b", "h2", "h3"):
        print(f"{hypothesis}: {report[hypothesis]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
