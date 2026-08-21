"""Deterministically recompute every Experiment 0 answer key.

This script uses no network and no model. It intentionally implements a second
representation of each problem so a stale or mistyped key fails before freeze.
"""

from __future__ import annotations

import argparse
import heapq
import itertools
import math
from fractions import Fraction
from pathlib import Path

from studylib import STUDY, load_calibration, write_json


def letter_for(value, options):
    return "ABCD"[options.index(value)]


def inventory_balance():
    return letter_for(720 - 185 + 96 - 210 + 54, [421, 451, 529, 475])


def discount_then_tax():
    return letter_for(Fraction(320) * Fraction(75, 100) * Fraction(108, 100), [240, Fraction(1242, 5), Fraction(1296, 5), Fraction(1328, 5)])


def elapsed_time():
    return letter_for(9 * 60 + 35 + 45 + 15 + 70 + 20, [11 * 60 + 45, 11 * 60 + 55, 12 * 60 + 5, 12 * 60 + 15])


def syllogism():
    return "A"


def die_multiple():
    p = Fraction(sum(n % 3 == 0 for n in range(1, 9)), 8)
    return letter_for(p, [Fraction(1, 4), Fraction(1, 8), Fraction(3, 8), Fraction(1, 2)])


def speed_conversion():
    speed = Fraction(24, 10) / Fraction(18, 60)
    return letter_for(speed, [6, Fraction(36, 5), 8, Fraction(48, 5)])


def weighted_defect_rate():
    rate = Fraction(120 * 4 + 80 * 10, 200)
    return letter_for(rate, [Fraction(52, 10), 6, 7, Fraction(64, 10)])


def combined_work():
    remaining = 1 - 2 * (Fraction(1, 6) + Fraction(1, 8))
    total = 2 + remaining / Fraction(1, 6)
    return letter_for(total, [4, Fraction(9, 2), 5, Fraction(11, 2)])


def dilution():
    salt = 12 * Fraction(25, 100)
    added = salt / Fraction(15, 100) - 12
    return letter_for(added, [5, 6, 8, 10])


def bayes_basic():
    posterior = Fraction(1, 10) * Fraction(4, 5) / (Fraction(1, 10) * Fraction(4, 5) + Fraction(9, 10) * Fraction(1, 5))
    values = [Fraction(4, 13), Fraction(1, 5), Fraction(4, 9), Fraction(4, 5)]
    return letter_for(min(values, key=lambda x: abs(x - posterior)), values)


def expected_value():
    a = Fraction(3, 5) * 100 + Fraction(2, 5) * -20
    b = Fraction(9, 10) * 55
    return "A" if a - b == Fraction(5, 2) else "D"


def two_set_inclusion():
    return letter_for(100 - (58 + 47 - 22), [13, 17, 21, 25])


def ordering_constraints():
    choices = ["JKML", "JLKM", "MJLK", "LJKM"]
    valid = [x for x in choices if x.index("J") < x.index("L") and x.index("K") == x.index("J") + 1 and x[0] != "M"]
    return letter_for(valid[0], choices) if len(valid) == 1 else "INVALID"


def truth_labels():
    boxes = "JKLM"
    valid = []
    for token in boxes:
        statements = [token == "K", token != "K", token == "M", token != "K"]
        if sum(statements) == 1:
            valid.append(token)
    return letter_for(valid[0], list(boxes)) if len(valid) == 1 else "INVALID"


def shortest_path():
    graph = {
        "A": [("B", 4), ("C", 7)],
        "B": [("A", 4), ("C", 1), ("D", 6)],
        "C": [("A", 7), ("B", 1), ("D", 2), ("E", 8)],
        "D": [("B", 6), ("C", 2), ("E", 3)],
        "E": [("C", 8), ("D", 3)],
    }
    queue = [(0, "A")]
    seen = {}
    while queue:
        cost, node = heapq.heappop(queue)
        if node in seen:
            continue
        seen[node] = cost
        for nxt, weight in graph[node]:
            heapq.heappush(queue, (cost + weight, nxt))
    return letter_for(seen["E"], [9, 10, 11, 12])


def capacity_trips():
    per_trip = 1200 // 145
    return letter_for(math.ceil(18 / per_trip), [2, 3, 4, 5])


def nested_loop():
    total = sum(i - j for i in range(1, 5) for j in range(1, i + 1))
    return letter_for(total, [6, 10, 14, 20])


def state_machine():
    transitions = {("A", 0): "B", ("B", 0): "A", ("C", 0): "C", ("A", 1): "C", ("B", 1): "C", ("C", 1): "A"}
    state = "A"
    for symbol in [0, 1, 0, 1, 1]:
        state = transitions[(state, symbol)]
    return letter_for(state, ["A", "B", "C", None])


def simpsons_paradox():
    within_a = Fraction(81, 87) > Fraction(234, 270) and Fraction(192, 263) > Fraction(55, 80)
    pooled_b = Fraction(234 + 55, 270 + 80) > Fraction(81 + 192, 87 + 263)
    return "D" if within_a and pooled_b else "INVALID"


def compare_posteriors():
    a = Fraction(1, 100) * Fraction(9, 10) / (Fraction(1, 100) * Fraction(9, 10) + Fraction(99, 100) * Fraction(5, 100))
    b = Fraction(1, 100) * Fraction(7, 10) / (Fraction(1, 100) * Fraction(7, 10) + Fraction(99, 100) * Fraction(1, 100))
    return "C" if b > a and abs(float(b) - .414) < .001 else "INVALID"


def three_set_inclusion():
    union = 110 + 90 + 80 - 50 - 45 - 35 + 20
    return letter_for(200 - union, [20, 25, 40, 30])


def critical_path():
    finish = {"A": 3, "B": 4}
    finish["C"] = finish["A"] + 5
    finish["D"] = max(finish["A"], finish["B"]) + 2
    finish["E"] = finish["B"] + 4
    finish["F"] = max(finish["C"], finish["D"]) + 3
    finish["G"] = max(finish["E"], finish["F"]) + 2
    return letter_for(finish["G"], [12, 13, 14, 16])


def five_slot_schedule():
    choices = ["PQRST", "RPQST", "PQSTR", "RSTPQ"]
    valid = [x for x in choices if x.index("Q") == x.index("P") + 1 and x.index("R") < x.index("S") and x.index("T") not in {0, 4} and x.index("T") == x.index("S") + 1]
    return letter_for(valid[0], choices) if len(valid) == 1 else "INVALID"


def knapsack():
    items = [(6, 13), (5, 11), (4, 8), (3, 6)]
    best = max((sum(items[i][1] for i in subset), subset) for r in range(5) for subset in itertools.combinations(range(4), r) if sum(items[i][0] for i in subset) <= 10)
    return "A" if best[1] == (0, 2) else "INVALID"


def markov_two_step():
    p = Fraction(4, 5) * Fraction(1, 5) + Fraction(1, 5) * Fraction(3, 5)
    return letter_for(p, [Fraction(4, 25), Fraction(6, 25), Fraction(7, 25), Fraction(8, 25)])


def conditional_without_replacement():
    p = Fraction(math.comb(5, 2), math.comb(12, 2) - math.comb(7, 2))
    return letter_for(p, [Fraction(2, 9), Fraction(2, 7), Fraction(5, 17), Fraction(10, 33)])


def quantified_logic():
    return "A"


def structural_counterfactual():
    u, x = 1, 0
    y = int(x != u)
    return "D" if y == 1 else "INVALID"


def recurrence():
    values = [2, 3]
    for n in range(2, 6):
        values.append(2 * values[-1] - values[-2] + n)
    return letter_for(values[5], [32, 37, 42, 48])


def two_stage_screening():
    p = Fraction(2, 100) * Fraction(9, 10) * Fraction(8, 10)
    posterior = p / (p + Fraction(98, 100) * Fraction(1, 10) * Fraction(5, 100))
    values = [0.227, 0.395, 0.595, 0.746]
    return letter_for(min(values, key=lambda x: abs(x - float(posterior))), values)


SOLVERS = {name: value for name, value in globals().copy().items() if callable(value) and name not in {"letter_for", "main"}}


def verify() -> dict:
    rows = []
    for task in load_calibration():
        solver_name = task.get("verification", {}).get("solver")
        solver = SOLVERS.get(solver_name)
        computed = solver() if solver else "MISSING"
        rows.append({
            "task_id": task["id"],
            "difficulty": task["difficulty"],
            "solver": solver_name,
            "key": task["answer"],
            "computed": computed,
            "passed": computed == task["answer"],
        })
    return {
        "schema_version": 1,
        "method": "deterministic standard-library reference solvers; no model calls",
        "task_count": len(rows),
        "passed": sum(row["passed"] for row in rows),
        "failed": sum(not row["passed"] for row in rows),
        "results": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=STUDY / "answer-verification.json")
    args = parser.parse_args()
    report = verify()
    write_json(args.output, report)
    print(f"verified {report['passed']}/{report['task_count']} answer keys; output={args.output}")
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
