#!/usr/bin/env python3
"""Post-data semantic reanalysis for the frozen Luna handoff run.

The frozen v1 grader compared checkpoint values lexically. ThoughtML labelled
posterior-vector entries (for example, ``R1=2/9``), while Markdown used the
unlabelled equivalent. This script preserves the v1 grades and raw outputs and
applies one narrow, symmetric normalization to posterior checkpoints only.
"""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
RUNS = ROOT / "runs"
RESULTS = ROOT / "results"
ARCHIVE_INDEX = REPO / "study" / "data" / "thoughtml-study-data-v1.index.tsv"
ARCHIVED_PREFIX = "study/exploratory/luna_handoff_v1/runs/"
SEMANTIC_GRADE_NAME = "grade-semantic-v2.json"

HANDOFF_SPEC = importlib.util.spec_from_file_location("frozen_luna_handoff", ROOT / "handoff.py")
if HANDOFF_SPEC is None or HANDOFF_SPEC.loader is None:
    raise RuntimeError("could not load frozen Luna handoff module")
handoff = importlib.util.module_from_spec(HANDOFF_SPEC)
HANDOFF_SPEC.loader.exec_module(handoff)

POSTERIOR_KEYS = frozenset(
    {
        "initial.posterior",
        "revised.posterior",
        "revised.z_posterior",
        "counterfactual.posterior",
        "counterfactual.z_posterior",
    }
)
VECTOR_LABELS = ("R1", "R2", "R3")
LABELLED_ENTRY_RE = re.compile(r"^(R[123])=(.+)$")
NORMALIZATION_ID = "posterior-vector-optional-r-labels-v1"


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def semantic_checkpoint_value(key: str, value: str) -> str:
    """Return the disclosed comparison form without changing stored evidence.

    Only the five registered posterior checkpoints are eligible. An unlabelled
    three-entry vector is unchanged. A fully labelled vector is normalized only
    when R1, R2, and R3 each occur exactly once; label order may vary because the
    labels themselves define component identity. Mixed, duplicate, unknown, or
    incomplete labelling is deliberately left unchanged and therefore cannot
    become equal to the frozen answer accidentally.
    """

    canonical = handoff.canonical_value(value)
    if key not in POSTERIOR_KEYS or not (canonical.startswith("[") and canonical.endswith("]")):
        return canonical

    entries = canonical[1:-1].split(",")
    if len(entries) != len(VECTOR_LABELS):
        return canonical
    if all("=" not in entry for entry in entries):
        return canonical

    labelled: dict[str, str] = {}
    for entry in entries:
        match = LABELLED_ENTRY_RE.fullmatch(entry)
        if match is None:
            return canonical
        label, component = match.groups()
        if label in labelled or not component:
            return canonical
        labelled[label] = component
    if set(labelled) != set(VECTOR_LABELS):
        return canonical
    return "[" + ",".join(labelled[label] for label in VECTOR_LABELS) + "]"


def verify_archived_inputs() -> int:
    if not ARCHIVE_INDEX.is_file():
        raise RuntimeError(f"archive index is missing: {ARCHIVE_INDEX}")
    with ARCHIVE_INDEX.open(encoding="utf-8", newline="") as handle:
        rows = [
            row
            for row in csv.DictReader(handle, delimiter="\t")
            if row["path"].startswith(ARCHIVED_PREFIX)
        ]
    if len(rows) != 63:
        raise RuntimeError(f"expected 63 archived Luna files, found {len(rows)}")
    for row in rows:
        path = REPO / Path(row["path"])
        if not path.is_file():
            raise RuntimeError(f"archived Luna input is missing: {row['path']}")
        if path.stat().st_size != int(row["bytes"]):
            raise RuntimeError(f"archived Luna input size changed: {row['path']}")
        if sha256_file(path) != row["sha256"]:
            raise RuntimeError(f"archived Luna input hash changed: {row['path']}")
    return len(rows)


def semantic_grade(run_dir: Path) -> dict[str, Any]:
    original_grade = read_json(run_dir / "grade.json")
    metadata = read_json(run_dir / "metadata.json")
    final_text = (run_dir / "final.txt").read_text(encoding="utf-8")
    observed, duplicates = handoff.extract_checkpoints(final_text)
    if observed != original_grade.get("observed_checkpoints"):
        raise RuntimeError(f"v1 observed checkpoints disagree with raw output: {run_dir.name}")
    if duplicates != original_grade.get("duplicate_checkpoint_keys"):
        raise RuntimeError(f"v1 duplicate record disagrees with raw output: {run_dir.name}")

    answers = read_json(ROOT / "answers.json")
    stage = int(original_grade["stage"])
    expected_keys = answers["cumulative_keys_by_stage"][str(stage)]
    new_keys = read_json(ROOT / "task.json")["stages"][stage - 1]["new_checkpoint_keys"]
    expected_all = {
        key: semantic_checkpoint_value(key, value)
        for key, value in answers["checkpoints"].items()
    }
    comparison_values = {
        key: semantic_checkpoint_value(key, value) for key, value in observed.items()
    }
    correct = {
        key: comparison_values.get(key) == expected_all[key] for key in expected_keys
    }
    future = sorted(key for key in observed if key in expected_all and key not in expected_keys)

    lexical_v1 = {
        "all_required_correct": original_grade["all_required_correct"],
        "cumulative_checkpoint_accuracy": original_grade["cumulative_checkpoint_accuracy"],
        "new_checkpoint_accuracy": original_grade["new_checkpoint_accuracy"],
        "wrong_checkpoint_keys": original_grade["wrong_checkpoint_keys"],
    }
    result = dict(original_grade)
    result.update(
        {
            "schema_version": 2,
            "grader_version": "semantic-v2",
            "comparison_normalization": {
                "id": NORMALIZATION_ID,
                "scope": sorted(POSTERIOR_KEYS),
                "symmetric": True,
                "rule": (
                    "Normalize a three-entry posterior vector only when R1, R2, and R3 "
                    "each label exactly one component; compare in R1/R2/R3 order."
                ),
            },
            "lexical_v1_comparison": lexical_v1,
            "comparison_values": comparison_values,
            "normalized_checkpoint_keys": sorted(
                key for key in observed if comparison_values[key] != observed[key]
            ),
            "wrong_checkpoint_keys": [
                key for key in expected_keys if key in observed and not correct[key]
            ],
            "new_checkpoint_accuracy": sum(bool(correct[key]) for key in new_keys)
            / len(new_keys),
            "cumulative_checkpoint_accuracy": sum(
                bool(correct[key]) for key in expected_keys
            )
            / len(expected_keys),
            "all_required_correct": all(correct.values()) and not duplicates and not future,
            "usage": metadata.get("usage", {}),
            "usable": bool(metadata.get("usable")),
        }
    )
    return result


def condition_summary(condition: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    group = sorted(
        (row for row in rows if row["condition"] == condition),
        key=lambda row: row["stage"],
    )
    final = next((row for row in group if row["stage"] == 5), None)
    input_tokens = sum(row["usage"].get("input_tokens", 0) for row in group)
    output_tokens = sum(row["usage"].get("output_tokens", 0) for row in group)
    result: dict[str, Any] = {
        "condition": condition,
        "observed_stages": len(group),
        "all_stages_usable": len(group) == 5 and all(row.get("usable") for row in group),
        "mean_new_checkpoint_accuracy": (
            sum(row["new_checkpoint_accuracy"] for row in group) / len(group) if group else None
        ),
        "final_all_required_correct": final.get("all_required_correct") if final else None,
        "final_format_valid": final.get("format_valid") if final else None,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
    }
    if condition == "thoughtml":
        result["final_revision_link_count"] = final.get("revision_link_count") if final else None
        result["final_lint_clean"] = final.get("lint_clean") if final else None
    else:
        result["final_branches_separated"] = final.get("branches_separated") if final else None
        result["final_has_current_section"] = final.get("has_current_section") if final else None
        result["final_has_superseded_section"] = (
            final.get("has_superseded_section") if final else None
        )
    return result


def relative_difference(value: int, baseline: int) -> float | None:
    return (value - baseline) / baseline if baseline else None


def analyze() -> dict[str, Any]:
    archived_files_verified = verify_archived_inputs()
    original_analysis = RUNS / "analysis-grader-v1.json"
    if not original_analysis.is_file():
        raise RuntimeError("preserved v1 analysis is missing")

    rows: list[dict[str, Any]] = []
    for original_grade_path in sorted((RUNS / "raw").glob("*/grade.json")):
        row = semantic_grade(original_grade_path.parent)
        write_json(original_grade_path.parent / SEMANTIC_GRADE_NAME, row)
        rows.append(row)
    if len(rows) != 10:
        raise RuntimeError(f"expected 10 graded stages, found {len(rows)}")

    by_condition = [condition_summary(condition, rows) for condition in ("thoughtml", "markdown")]
    condition_map = {row["condition"]: row for row in by_condition}
    thoughtml = condition_map["thoughtml"]
    markdown = condition_map["markdown"]
    both_correct = bool(
        thoughtml["final_all_required_correct"] and markdown["final_all_required_correct"]
    )
    classification = (
        "no_accuracy_advantage"
        if both_correct
        else "illustrative_thoughtml_win"
        if thoughtml["final_all_required_correct"]
        else "task_or_workflow_failure"
        if not markdown["final_all_required_correct"]
        else "markdown_only_accuracy_win"
    )

    summary = {
        "schema_version": 2,
        "generated_at": now_utc(),
        "exploratory_only": True,
        "analysis_revision": "semantic-v2-post-data-correction",
        "provenance": {
            "archived_input_files_verified": archived_files_verified,
            "archive_index": str(ARCHIVE_INDEX.relative_to(REPO)).replace("\\", "/"),
            "raw_outputs_modified": False,
            "original_analysis": "study/exploratory/luna_handoff_v1/runs/analysis-grader-v1.json",
            "original_analysis_sha256": sha256_file(original_analysis),
            "semantic_grader": str(Path(__file__).resolve().relative_to(REPO)).replace("\\", "/"),
            "semantic_grader_sha256": sha256_file(Path(__file__).resolve()),
        },
        "comparison_normalization": {
            "id": NORMALIZATION_ID,
            "symmetric": True,
            "post_data": True,
            "reason": (
                "The frozen v1 grader treated optional R1/R2/R3 component labels as "
                "different answers despite identical posterior values."
            ),
        },
        "observed_stages": len(rows),
        "by_condition": by_condition,
        "token_comparison": {
            "baseline": "markdown",
            "thoughtml_input_overhead_fraction": relative_difference(
                thoughtml["input_tokens"], markdown["input_tokens"]
            ),
            "thoughtml_output_overhead_fraction": relative_difference(
                thoughtml["output_tokens"], markdown["output_tokens"]
            ),
            "thoughtml_total_overhead_fraction": relative_difference(
                thoughtml["total_tokens"], markdown["total_tokens"]
            ),
        },
        "result_classification": classification,
        "interpretation": (
            "Both final ledgers contain every required answer correctly, so this single "
            "exploratory task shows no accuracy advantage. ThoughtML preserves explicit "
            "machine-readable revision links and branch structure, with higher token use."
        ),
    }
    write_json(RUNS / "analysis-semantic-v2.json", summary)
    write_json(RESULTS / "analysis-semantic-v2.json", summary)
    RESULTS.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(original_analysis, RESULTS / "analysis-grader-v1.json")
    return summary


def main() -> int:
    summary = analyze()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
