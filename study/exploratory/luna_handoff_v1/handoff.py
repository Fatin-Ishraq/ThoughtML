#!/usr/bin/env python3
"""Candidate-only harness for the Luna multi-stage handoff existence test."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from typing import Any, Sequence


ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
TASK_PATH = ROOT / "task.json"
ANSWERS_PATH = ROOT / "answers.json"
PROTOCOL_PATH = ROOT / "protocol.json"
SPEC_PATH = REPO / "crates" / "thoughtml" / "llms.txt"
RUNS = ROOT / "runs"
CHECKPOINT_RE = re.compile(
    r"(?m)^\s*CHECKPOINT\s+([a-z0-9_.-]+)\s*=\s*(\S(?:.*?\S)?)\s*$"
)


class HandoffError(RuntimeError):
    pass


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


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def run_capture(command: Sequence[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            list(command),
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
            **kwargs,
        )
    except OSError as exc:
        return subprocess.CompletedProcess(list(command), 126, "", f"{type(exc).__name__}: {exc}")


def codex_program() -> list[str]:
    explicit = os.environ.get("THOUGHTML_CODEX_CLI")
    if explicit:
        return [explicit]
    if os.name == "nt":
        node = shutil.which("node.exe") or shutil.which("node")
        script = (
            Path(os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming")))
            / "npm"
            / "node_modules"
            / "@openai"
            / "codex"
            / "bin"
            / "codex.js"
        )
        if node and script.is_file():
            return [node, str(script)]
    return ["codex"]


def thoughtml_binary() -> Path:
    explicit = os.environ.get("THOUGHTML_GRADER")
    candidates = [
        Path(explicit) if explicit else None,
        REPO / "target" / "release" / "thoughtml.exe",
        REPO / "target" / "release" / "thoughtml",
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    found = shutil.which("thoughtml")
    if found:
        return Path(found).resolve()
    raise HandoffError("ThoughtML binary not found")


def command_version(command: Sequence[str]) -> str:
    result = run_capture(command)
    lines = (result.stdout or result.stderr).strip().splitlines()
    return lines[-1].strip() if lines else "unavailable"


def fraction(value: str | int) -> Fraction:
    return Fraction(str(value))


def normalize(priors: list[Fraction], likelihoods: list[Fraction]) -> list[Fraction]:
    weights = [p * likelihood for p, likelihood in zip(priors, likelihoods, strict=True)]
    total = sum(weights, Fraction(0))
    if total <= 0:
        raise HandoffError("posterior has zero mass")
    return [weight / total for weight in weights]


def format_fraction(value: Fraction) -> str:
    return str(value.numerator) if value.denominator == 1 else f"{value.numerator}/{value.denominator}"


def format_vector(values: list[Fraction]) -> str:
    return "[" + ",".join(format_fraction(value) for value in values) + "]"


def plan_decision(
    posterior: list[Fraction], data: dict[str, Any], deadline: int, floor: Fraction
) -> tuple[list[str], str, dict[str, Fraction], dict[str, Fraction]]:
    admissible: list[str] = []
    deadline_probabilities: dict[str, Fraction] = {}
    expected_losses: dict[str, Fraction] = {}
    for name, plan in sorted(data.items()):
        probability = sum(
            (posterior[index] for index, duration in enumerate(plan["times"]) if duration <= deadline),
            Fraction(0),
        )
        loss = sum(
            (posterior[index] * int(value) for index, value in enumerate(plan["losses"])),
            Fraction(0),
        )
        deadline_probabilities[name] = probability
        expected_losses[name] = loss
        if probability >= floor:
            admissible.append(name)
    if not admissible:
        raise HandoffError("no admissible plan")
    ranked = sorted((expected_losses[name], name) for name in admissible)
    if len(ranked) > 1 and ranked[0][0] == ranked[1][0]:
        raise HandoffError("reference task has a tied minimum-loss plan")
    return admissible, ranked[0][1], deadline_probabilities, expected_losses


def recovery_decision(
    posterior: list[Fraction], losses: dict[str, list[int]]
) -> tuple[str, dict[str, Fraction]]:
    expected = {
        name: sum(
            (posterior[index] * int(value) for index, value in enumerate(values)),
            Fraction(0),
        )
        for name, values in sorted(losses.items())
    }
    ranked = sorted((value, name) for name, value in expected.items())
    if len(ranked) > 1 and ranked[0][0] == ranked[1][0]:
        raise HandoffError("reference task has a tied recovery action")
    return ranked[0][1], expected


def solve_reference(task: dict[str, Any] | None = None) -> dict[str, str]:
    task = task or read_json(TASK_PATH)
    data = task["reference_data"]
    priors = [fraction(value) for value in task["priors"]]
    deadline = int(task["deadline_hours"])
    floor = fraction(task["minimum_deadline_probability"])

    initial = normalize(priors, [fraction(value) for value in data["initial_likelihoods"]])
    initial_admissible, initial_plan, _, _ = plan_decision(
        initial, data["plans"], deadline, floor
    )

    revised = normalize(priors, [fraction(value) for value in data["corrected_likelihoods"]])
    revised_admissible, revised_plan, _, _ = plan_decision(
        revised, data["plans"], deadline, floor
    )
    revised_z = normalize(
        revised, [fraction(value) for value in data["signal_likelihoods"][revised_plan]]
    )
    revised_recovery, _ = recovery_decision(revised_z, data["recovery_losses"])

    counterfactual = normalize(
        priors, [fraction(value) for value in data["counterfactual_likelihoods"]]
    )
    counterfactual_admissible, counterfactual_plan, _, _ = plan_decision(
        counterfactual, data["plans"], deadline, floor
    )
    counterfactual_z = normalize(
        counterfactual,
        [fraction(value) for value in data["signal_likelihoods"][counterfactual_plan]],
    )
    counterfactual_recovery, _ = recovery_decision(
        counterfactual_z, data["recovery_losses"]
    )

    return {
        "initial.posterior": format_vector(initial),
        "initial.admissible": "[" + ",".join(initial_admissible) + "]",
        "initial.plan": initial_plan,
        "revised.posterior": format_vector(revised),
        "revised.admissible": "[" + ",".join(revised_admissible) + "]",
        "revised.plan": revised_plan,
        "revised.z_posterior": format_vector(revised_z),
        "revised.recovery": revised_recovery,
        "counterfactual.posterior": format_vector(counterfactual),
        "counterfactual.admissible": "[" + ",".join(counterfactual_admissible) + "]",
        "counterfactual.plan": counterfactual_plan,
        "counterfactual.z_posterior": format_vector(counterfactual_z),
        "counterfactual.recovery": counterfactual_recovery,
    }


def canonical_value(value: str) -> str:
    return re.sub(r"\s+", "", value.strip())


def extract_checkpoints(text: str) -> tuple[dict[str, str], list[str]]:
    values: dict[str, str] = {}
    duplicates: list[str] = []
    for key, value in CHECKPOINT_RE.findall(text):
        if key in values:
            duplicates.append(key)
        else:
            values[key] = canonical_value(value)
    return values, sorted(set(duplicates))


def core_files() -> list[Path]:
    return [
        ROOT / "README.md",
        PROTOCOL_PATH,
        TASK_PATH,
        ANSWERS_PATH,
        ROOT / "instructions" / "thoughtml.txt",
        ROOT / "instructions" / "thoughtml-language.txt",
        ROOT / "instructions" / "markdown.txt",
        ROOT / "gold" / "final.thml",
        ROOT / "handoff.py",
        ROOT / "test_handoff.py",
        SPEC_PATH,
    ]


def file_record(path: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(REPO)),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def validate() -> list[str]:
    errors: list[str] = []
    for path in core_files():
        if not path.is_file():
            errors.append(f"missing file: {path.relative_to(REPO)}")
    if errors:
        return errors

    protocol = read_json(PROTOCOL_PATH)
    task = read_json(TASK_PATH)
    answers = read_json(ANSWERS_PATH)
    if protocol.get("model") != "gpt-5.6-luna":
        errors.append("model must remain gpt-5.6-luna")
    if protocol.get("conditions") != ["thoughtml", "markdown"]:
        errors.append("conditions must be thoughtml and markdown")
    if protocol.get("expected_calls") != 10 or protocol.get("stages_per_condition") != 5:
        errors.append("protocol must contain exactly ten calls across five stages")
    if len(task.get("stages", [])) != 5:
        errors.append("task must contain exactly five stages")

    solved = solve_reference(task)
    stored = {key: canonical_value(value) for key, value in answers["checkpoints"].items()}
    if solved != stored:
        errors.append(f"stored answers disagree with independent solver: solved={solved} stored={stored}")

    seen: list[str] = []
    for stage in task["stages"]:
        seen.extend(stage["new_checkpoint_keys"])
        registered = answers["cumulative_keys_by_stage"].get(str(stage["stage"]))
        if registered != seen:
            errors.append(f"stage {stage['stage']} cumulative checkpoint registration is wrong")
    if set(seen) != set(stored):
        errors.append("stage checkpoint keys do not cover the answer key exactly")

    for stage_number in range(1, 6):
        thoughtml_prompt = prompt_for("thoughtml", stage_number, "INHERITED")
        markdown_prompt = prompt_for("markdown", stage_number, "INHERITED")
        if len(thoughtml_prompt.encode("utf-8")) >= 2 * len(markdown_prompt.encode("utf-8")):
            errors.append(f"stage {stage_number} ThoughtML prompt is at least twice Markdown size")

    gold = (ROOT / "gold" / "final.thml").read_text(encoding="utf-8")
    gold_values, duplicates = extract_checkpoints(gold)
    if duplicates:
        errors.append(f"gold ledger has duplicate checkpoints: {duplicates}")
    if gold_values != stored:
        errors.append("gold ledger checkpoints disagree with answers.json")
    grader = thoughtml_binary()
    check = run_capture([str(grader), "check", str(ROOT / "gold" / "final.thml"), "--lint", "--strict"])
    if check.returncode != 0:
        errors.append(f"gold ThoughtML is not strict/lint clean: {(check.stdout or check.stderr).strip()}")

    return errors


def manifest_value(status: str) -> dict[str, Any]:
    protocol = read_json(PROTOCOL_PATH)
    grader = thoughtml_binary()
    value = {
        "schema_version": 1,
        "status": status,
        "created_at": now_utc(),
        "test_id": protocol["test_id"],
        "model": protocol["model"],
        "reasoning_effort": protocol["reasoning_effort"],
        "model_calls_authorized": protocol["model_calls_authorized"],
        "codex_version": command_version([*codex_program(), "--version"]),
        "thoughtml_version": command_version([str(grader), "--version"]),
        "thoughtml_sha256": sha256_file(grader),
        "files": [file_record(path) for path in core_files()],
    }
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    value["manifest_content_sha256"] = sha256_bytes(canonical)
    return value


def compare_manifest(path: Path) -> list[str]:
    manifest = read_json(path)
    differences: list[str] = []
    for record in manifest.get("files", []):
        local = REPO / record["path"]
        if not local.is_file():
            differences.append(f"missing: {record['path']}")
        elif sha256_file(local) != record["sha256"]:
            differences.append(f"changed: {record['path']}")
    grader = thoughtml_binary()
    if sha256_file(grader) != manifest.get("thoughtml_sha256"):
        differences.append("changed: ThoughtML binary")
    return differences


def active_manifest() -> Path | None:
    for name in ("frozen-manifest.json", "candidate-manifest.json"):
        path = ROOT / name
        if path.is_file() and not compare_manifest(path):
            return path
    return None


def prompt_for(condition: str, stage_number: int, prior_ledger: str) -> str:
    task = read_json(TASK_PATH)
    answers = read_json(ANSWERS_PATH)
    stage = task["stages"][stage_number - 1]
    instructions = (ROOT / "instructions" / f"{condition}.txt").read_text(encoding="utf-8")
    revealed = "\n".join(
        f"Stage {item['stage']} source fact:\n{item['reveal']}" for item in task["stages"][:stage_number]
    )
    required = ", ".join(answers["cumulative_keys_by_stage"][str(stage_number)])
    new = ", ".join(stage["new_checkpoint_keys"])
    inherited = prior_ledger if prior_ledger else "<none; create the ledger now>"
    parts = [
        instructions.strip(),
        "# Fixed task context",
        f"Hidden regimes in fixed order: {', '.join(task['regimes'])}.",
        f"Prior probabilities in that order: {', '.join(task['priors'])}.",
        "All probability calculations must use exact rational arithmetic.",
        "# Source facts revealed through this stage",
        revealed,
        f"# Current handoff: stage {stage_number} - {stage['name']}",
        stage["instruction"],
        f"New checkpoint keys for this stage: {new}.",
        f"All checkpoint keys that must exist in the returned complete ledger: {required}.",
        "# Inherited raw ledger",
        inherited,
    ]
    if condition == "thoughtml":
        parts.extend(
            [
                "# ThoughtML language subset for this test",
                (ROOT / "instructions" / "thoughtml-language.txt")
                .read_text(encoding="utf-8")
                .strip(),
            ]
        )
    return "\n\n".join(parts).strip() + "\n"


def build_schedule(manifest: Path | None = None) -> dict[str, Any]:
    protocol = read_json(PROTOCOL_PATH)
    task = read_json(TASK_PATH)
    items: list[dict[str, Any]] = []
    for condition in protocol["condition_order"]:
        for stage in task["stages"]:
            placeholder = "" if stage["stage"] == 1 else f"<raw {condition} stage-{stage['stage'] - 1} ledger>"
            template = prompt_for(condition, int(stage["stage"]), placeholder)
            items.append(
                {
                    "run_id": f"{protocol['test_id']}__{condition}__stage-{stage['stage']}",
                    "condition": condition,
                    "stage": stage["stage"],
                    "stage_name": stage["name"],
                    "model": protocol["model"],
                    "reasoning_effort": protocol["reasoning_effort"],
                    "prior_run_id": None
                    if stage["stage"] == 1
                    else f"{protocol['test_id']}__{condition}__stage-{stage['stage'] - 1}",
                    "prompt_template_sha256": sha256_bytes(template.encode("utf-8")),
                    "prompt_template_bytes": len(template.encode("utf-8")),
                }
            )
    manifest_value_ = read_json(manifest) if manifest else None
    return {
        "schema_version": 1,
        "test_id": protocol["test_id"],
        "created_at": now_utc(),
        "count": len(items),
        "manifest": str(manifest.relative_to(REPO)) if manifest else None,
        "manifest_sha256": sha256_file(manifest) if manifest else None,
        "collectable": bool(
            manifest_value_
            and manifest_value_.get("status") == "frozen"
            and protocol.get("model_calls_authorized") is True
        ),
        "items": items,
    }


def codex_command(model: str, effort: str, final_path: Path) -> list[str]:
    return [
        *codex_program(),
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--strict-config",
        "--sandbox",
        "read-only",
        "--config",
        'approval_policy="never"',
        "--model",
        model,
        "--config",
        f"model_reasoning_effort={json.dumps(effort)}",
        "--color",
        "never",
        "--json",
        "--output-last-message",
        str(final_path),
        "-",
    ]


def contains_tool_event(transcript: str) -> bool:
    suspicious = {"command_execution", "mcp_tool_call", "web_search", "tool_call"}

    def walk(value: Any) -> bool:
        if isinstance(value, dict):
            return any(
                (key in {"type", "item_type"} and str(child) in suspicious) or walk(child)
                for key, child in value.items()
            )
        if isinstance(value, list):
            return any(walk(child) for child in value)
        return False

    for line in transcript.splitlines():
        try:
            if walk(json.loads(line)):
                return True
        except json.JSONDecodeError:
            continue
    return False


def usage_from_events(transcript: str) -> dict[str, int]:
    usage = {
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_output_tokens": 0,
    }
    for line in transcript.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        values = event.get("usage") if event.get("type") == "turn.completed" else None
        if isinstance(values, dict):
            for key in usage:
                usage[key] += int(values.get(key, 0) or 0)
    return usage


def grade_output(condition: str, stage: int, text: str) -> dict[str, Any]:
    answers = read_json(ANSWERS_PATH)
    expected_all = {key: canonical_value(value) for key, value in answers["checkpoints"].items()}
    expected_keys = answers["cumulative_keys_by_stage"][str(stage)]
    task = read_json(TASK_PATH)
    new_keys = task["stages"][stage - 1]["new_checkpoint_keys"]
    observed, duplicates = extract_checkpoints(text)
    correct = {key: observed.get(key) == expected_all[key] for key in expected_keys}
    future = sorted(key for key in observed if key in expected_all and key not in expected_keys)
    unknown = sorted(key for key in observed if key not in expected_all)
    result: dict[str, Any] = {
        "condition": condition,
        "stage": stage,
        "observed_checkpoints": observed,
        "duplicate_checkpoint_keys": duplicates,
        "missing_checkpoint_keys": [key for key in expected_keys if key not in observed],
        "wrong_checkpoint_keys": [key for key in expected_keys if key in observed and not correct[key]],
        "unexpected_future_checkpoint_keys": future,
        "unknown_checkpoint_keys": unknown,
        "new_checkpoint_accuracy": sum(bool(correct[key]) for key in new_keys) / len(new_keys),
        "cumulative_checkpoint_accuracy": sum(bool(correct[key]) for key in expected_keys)
        / len(expected_keys),
        "all_required_correct": all(correct.values()) and not duplicates and not future,
    }
    if condition == "thoughtml":
        output_path = RUNS / "_grade-candidate.thml"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text, encoding="utf-8", newline="\n")
        grader = thoughtml_binary()
        strict = run_capture([str(grader), "check", str(output_path), "--strict"])
        lint = run_capture([str(grader), "check", str(output_path), "--lint", "--strict"])
        result.update(
            {
                "format_valid": strict.returncode == 0,
                "lint_clean": lint.returncode == 0,
                "strict_diagnostics": (strict.stdout or strict.stderr).strip(),
                "lint_diagnostics": (lint.stdout or lint.stderr).strip(),
                "revision_link_count": len(
                    re.findall(r"(?m)^\s*link\s+\S+\s+revises\s+\S+\s*$", text)
                ),
            }
        )
    else:
        lowered = text.lower()
        result.update(
            {
                "format_valid": text.lstrip().startswith("# Decision Ledger"),
                "has_superseded_section": stage < 3 or "superseded" in lowered,
                "has_current_section": stage < 3 or "current" in lowered,
                "branches_separated": stage < 5
                or ("main branch" in lowered and "counterfactual branch" in lowered),
            }
        )
    return result


def cmd_validate(_: argparse.Namespace) -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"ERROR {error}")
        return 1
    protocol = read_json(PROTOCOL_PATH)
    print("clean - task, solver, checkpoint registry, gold ledger, and harness agree")
    print(f"model={protocol['model']} calls={protocol['expected_calls']} authorized={protocol['model_calls_authorized']}")
    return 0


def cmd_freeze(args: argparse.Namespace) -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"ERROR {error}")
        return 1
    protocol = read_json(PROTOCOL_PATH)
    if not args.candidate and protocol.get("model_calls_authorized") is not True:
        print("refusing authoritative freeze: protocol.json does not authorize model calls")
        print("use --candidate while the test is preparation-only")
        return 1
    status = "candidate" if args.candidate else "frozen"
    manifest = manifest_value(status)
    target = ROOT / f"{status}-manifest.json"
    write_json(target, manifest)
    print(f"wrote {target}")
    print(f"manifest content SHA-256: {manifest['manifest_content_sha256']}")
    return 0


def cmd_schedule(_: argparse.Namespace) -> int:
    manifest = active_manifest()
    if manifest is None:
        print("no clean candidate or frozen manifest; run freeze --candidate")
        return 1
    schedule = build_schedule(manifest)
    write_json(ROOT / "schedule.json", schedule)
    print(f"wrote {ROOT / 'schedule.json'} ({schedule['count']} calls)")
    print(f"collectable={schedule['collectable']}")
    return 0


def verify_schedule(schedule: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    manifest_text = schedule.get("manifest")
    if not manifest_text:
        return ["schedule has no manifest"]
    manifest = REPO / manifest_text
    if not manifest.is_file() or sha256_file(manifest) != schedule.get("manifest_sha256"):
        errors.append("schedule manifest is missing or changed")
    elif compare_manifest(manifest):
        errors.extend(compare_manifest(manifest))
    if len(schedule.get("items", [])) != 10:
        errors.append("schedule does not contain exactly ten calls")
    return errors


def cmd_run(args: argparse.Namespace) -> int:
    schedule_path = Path(args.schedule)
    if not schedule_path.is_absolute():
        schedule_path = REPO / schedule_path
    schedule = read_json(schedule_path)
    errors = verify_schedule(schedule)
    if errors:
        for error in errors:
            print(f"ERROR {error}")
        return 1
    if args.dry_run:
        for item in schedule["items"]:
            placeholder = "" if item["stage"] == 1 else f"<raw {item['condition']} prior-stage ledger>"
            prompt = prompt_for(item["condition"], int(item["stage"]), placeholder)
            print(
                f"{item['run_id']} bytes={len(prompt.encode('utf-8'))} "
                f"sha256={sha256_bytes(prompt.encode('utf-8'))}"
            )
        print("DRY RUN ONLY - no model was contacted")
        return 0
    if not args.execute:
        print("refusing calls: pass --execute after explicit authorization")
        return 1
    if not schedule.get("collectable"):
        print("refusing calls: schedule is candidate-only and non-collectable")
        return 1

    timeout = int(read_json(PROTOCOL_PATH)["timeout_seconds"])
    scratch_root = RUNS / "_scratch"
    scratch_root.mkdir(parents=True, exist_ok=True)
    previous: dict[str, str] = {}
    for index, item in enumerate(schedule["items"], 1):
        condition = item["condition"]
        stage = int(item["stage"])
        run_dir = RUNS / "raw" / item["run_id"]
        final_path = run_dir / "final.txt"
        metadata_path = run_dir / "metadata.json"
        if args.resume and metadata_path.is_file():
            previous[condition] = final_path.read_text(encoding="utf-8") if final_path.is_file() else ""
            print(f"[{index}/10] skip {item['run_id']}")
            continue
        prior = previous.get(condition, "")
        if stage > 1 and not prior:
            print(f"refusing stage {stage}: prior {condition} ledger is missing")
            return 1
        prompt = prompt_for(condition, stage, prior)
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "prompt.txt").write_text(prompt, encoding="utf-8", newline="\n")
        command = codex_command(item["model"], item["reasoning_effort"], final_path)
        started = now_utc()
        began = time.monotonic()
        with tempfile.TemporaryDirectory(
            prefix="luna-handoff-", dir=scratch_root, ignore_cleanup_errors=True
        ) as scratch:
            result = run_capture(command, input=prompt, cwd=scratch, timeout=timeout)
        elapsed = time.monotonic() - began
        transcript = result.stdout or ""
        (run_dir / "events.jsonl").write_text(transcript, encoding="utf-8", newline="\n")
        (run_dir / "stderr.txt").write_text(result.stderr or "", encoding="utf-8", newline="\n")
        final = final_path.read_text(encoding="utf-8") if final_path.is_file() else ""
        metadata = {
            "schema_version": 1,
            "run": item,
            "started_at": started,
            "completed_at": now_utc(),
            "elapsed_seconds": round(elapsed, 3),
            "exit_code": result.returncode,
            "prompt_sha256": sha256_bytes(prompt.encode("utf-8")),
            "final_sha256": sha256_bytes(final.encode("utf-8")) if final else None,
            "tool_event": contains_tool_event(transcript),
            "usage": usage_from_events(transcript),
            "usable": result.returncode == 0 and bool(final.strip()) and not contains_tool_event(transcript),
            "attempt_count": 1,
        }
        write_json(metadata_path, metadata)
        print(f"[{index}/10] {item['run_id']} usable={metadata['usable']}")
        if not final:
            print("stopping pipeline: stage produced no ledger")
            return 1
        previous[condition] = final
    return 0


def cmd_grade(_: argparse.Namespace) -> int:
    count = 0
    for metadata_path in sorted((RUNS / "raw").glob("*/metadata.json")):
        run_dir = metadata_path.parent
        metadata = read_json(metadata_path)
        final_path = run_dir / "final.txt"
        if not final_path.is_file():
            continue
        item = metadata["run"]
        grade = grade_output(
            item["condition"], int(item["stage"]), final_path.read_text(encoding="utf-8")
        )
        grade["usable"] = bool(metadata.get("usable"))
        write_json(run_dir / "grade.json", grade)
        count += 1
    print(f"graded {count} handoff stages")
    return 0


def cmd_analyze(_: argparse.Namespace) -> int:
    cmd_grade(argparse.Namespace())
    rows: list[dict[str, Any]] = []
    for grade_path in sorted((RUNS / "raw").glob("*/grade.json")):
        grade = read_json(grade_path)
        metadata = read_json(grade_path.parent / "metadata.json")
        grade["usage"] = metadata.get("usage", {})
        rows.append(grade)
    by_condition: list[dict[str, Any]] = []
    for condition in ("thoughtml", "markdown"):
        group = sorted((row for row in rows if row["condition"] == condition), key=lambda row: row["stage"])
        final = next((row for row in group if row["stage"] == 5), None)
        by_condition.append(
            {
                "condition": condition,
                "observed_stages": len(group),
                "all_stages_usable": len(group) == 5 and all(row.get("usable") for row in group),
                "mean_new_checkpoint_accuracy": sum(row["new_checkpoint_accuracy"] for row in group)
                / len(group)
                if group
                else None,
                "final_all_required_correct": final.get("all_required_correct") if final else None,
                "final_format_valid": final.get("format_valid") if final else None,
                "input_tokens": sum(row["usage"].get("input_tokens", 0) for row in group),
                "output_tokens": sum(row["usage"].get("output_tokens", 0) for row in group),
            }
        )
    summary = {
        "schema_version": 1,
        "generated_at": now_utc(),
        "exploratory_only": True,
        "observed_stages": len(rows),
        "by_condition": by_condition,
        "interpretation_rule": {
            "illustrative_thoughtml_win": "ThoughtML final ledger is fully correct and Markdown has at least one checkpoint, revision, or branch-separation failure.",
            "no_accuracy_advantage": "Both final ledgers are fully correct.",
            "task_or_workflow_failure": "Both final ledgers are not fully correct.",
        },
    }
    write_json(RUNS / "analysis.json", summary)
    print(json.dumps(summary, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    validate_parser = sub.add_parser("validate")
    validate_parser.set_defaults(func=cmd_validate)
    freeze = sub.add_parser("freeze")
    freeze.add_argument("--candidate", action="store_true")
    freeze.set_defaults(func=cmd_freeze)
    schedule = sub.add_parser("schedule")
    schedule.set_defaults(func=cmd_schedule)
    run = sub.add_parser("run")
    run.add_argument("--schedule", default=str(ROOT / "schedule.json"))
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--execute", action="store_true")
    run.add_argument("--resume", action="store_true")
    run.set_defaults(func=cmd_run)
    grade = sub.add_parser("grade")
    grade.set_defaults(func=cmd_grade)
    analyze = sub.add_parser("analyze")
    analyze.set_defaults(func=cmd_analyze)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
