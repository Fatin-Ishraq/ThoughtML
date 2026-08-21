#!/usr/bin/env python3
"""Executable benchmark harness for the ThoughtML v2.0 pre-registration."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import studylib as lib


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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


def command_version(command: Sequence[str]) -> str:
    result = run_capture(command)
    text = (result.stdout or result.stderr).strip().splitlines()
    return text[-1].strip() if text else "unavailable"


def codex_program() -> list[str]:
    """Resolve the CLI without relying on Windows' extensionless npm shim."""
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
    env = os.environ.get("THOUGHTML_GRADER")
    candidates = [
        Path(env) if env else None,
        lib.REPO / "target" / "release" / "thoughtml.exe",
        lib.REPO / "target" / "release" / "thoughtml",
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    found = shutil.which("thoughtml")
    if found:
        return Path(found).resolve()
    raise lib.StudyError("ThoughtML grader not found; set THOUGHTML_GRADER or build release binary")


def protocol_headings(marker: str) -> list[str]:
    text = (lib.STUDY / "protocol-issues.md").read_text(encoding="utf-8")
    issues = []
    chunks = text.split("\n## ")[1:]
    for chunk in chunks:
        heading = chunk.splitlines()[0].strip()
        if marker in heading:
            issues.append(heading)
    return issues


def open_protocol_issues() -> list[str]:
    return protocol_headings("[OPEN]")


def phase_protocol_issues(phase: str) -> list[str]:
    if phase in {"exp0-pilot", "exp0-main"}:
        return protocol_headings("[EXP0 BLOCKER]")
    if phase in {"exp1-thoughtml", "exp1-generic"}:
        return protocol_headings("[EXP1 BLOCKER]")
    return []


def cmd_validate(_: argparse.Namespace) -> int:
    messages = lib.validate_artifacts()
    errors = [m for m in messages if m.level == "error"]
    for message in messages:
        print(f"{message.level.upper()}[{message.code}] {message.message}")
    if not messages:
        print("clean — benchmark artifacts satisfy every mechanical pre-data check")
    else:
        print(f"{len(errors)} error(s), {len(messages) - len(errors)} warning(s)")

    grader = thoughtml_binary()
    config = lib.read_json(lib.CONFIG / "benchmark.json")
    print(f"Codex: {command_version([*codex_program(), '--version'])}")
    print(f"Grader: {command_version([str(grader), '--version'])}")
    print(f"Grader SHA-256: {lib.sha256_file(grader)}")
    print(f"Spec SHA-256: {lib.sha256_file(lib.SPEC)}")
    if lib.sha256_file(grader) != config["grader_sha256"]:
        print("ERROR[GRADER_HASH] release grader does not match preregistration")
        errors.append(lib.ValidationMessage("error", "GRADER_HASH", "mismatch"))
    for source in sorted((lib.STUDY / "mutation-corpus" / "registered-clean").glob("*.thml")):
        lint = run_capture([str(grader), "check", str(source), "--lint", "--strict"])
        provenance = run_capture(
            [str(grader), "--strict", "--strict-provenance", str(source)]
        )
        if lint.returncode != 0 or provenance.returncode != 0:
            print(f"ERROR[MUTATION_SEED] {source.name} is not strict-clean in every registered mode")
            errors.append(lib.ValidationMessage("error", "MUTATION_SEED", source.name))
    return 1 if errors else 0


def manifest_value(status: str) -> dict[str, Any]:
    grader = thoughtml_binary()
    files = [lib.file_record(path) for path in lib.registered_files()]
    git_head = run_capture(["git", "rev-parse", "HEAD"], cwd=lib.REPO).stdout.strip()
    source_diff = run_capture(
        ["git", "diff", "--name-only", "6b323bfaacab44ec0aef19dfa0abfdf98503959e", "--", "crates", "web", "docs", "examples"],
        cwd=lib.REPO,
    ).stdout.splitlines()
    value = {
        "schema_version": 1,
        "status": status,
        "created_at": now_utc(),
        "git_head": git_head,
        "pinned_source_commit": "6b323bfaacab44ec0aef19dfa0abfdf98503959e",
        "source_files_changed_since_pin": source_diff,
        "codex_version": command_version([*codex_program(), "--version"]),
        "thoughtml_version": command_version([str(grader), "--version"]),
        "grader_path": str(grader),
        "grader_sha256": lib.sha256_file(grader),
        "files": files,
        "task_counts": {
            "calibration": len(lib.load_calibration()),
            "authoring": len(lib.load_authoring()),
            "probe_cued": len(lib.load_probes("cued")),
            "probe_neutral": len(lib.load_probes("neutral")),
        },
        "open_protocol_issues": open_protocol_issues(),
        "phase_protocol_issues": {
            "exp0": phase_protocol_issues("exp0-main"),
            "exp1": phase_protocol_issues("exp1-thoughtml"),
        },
    }
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    value["manifest_content_sha256"] = lib.sha256_bytes(canonical.encode("utf-8"))
    return value


def compare_manifest(path: Path) -> list[str]:
    expected = lib.read_json(path)
    differences: list[str] = []
    for record in expected.get("files", []):
        local = lib.REPO / record["path"]
        if not local.is_file():
            differences.append(f"missing: {record['path']}")
        elif lib.sha256_file(local) != record["sha256"]:
            differences.append(f"hash changed: {record['path']}")
    grader = thoughtml_binary()
    if lib.sha256_file(grader) != expected.get("grader_sha256"):
        differences.append("grader hash changed")
    return differences


def cmd_freeze(args: argparse.Namespace) -> int:
    target = lib.RUNS / ("candidate-manifest.json" if args.candidate else "frozen-manifest.json")
    if args.check:
        if not target.exists():
            print(f"missing manifest: {target}")
            return 1
        differences = compare_manifest(target)
        if differences:
            for difference in differences:
                print(f"CHANGED {difference}")
            return 1
        print(f"clean — {target.name} matches every registered byte and grader hash")
        return 0

    errors = [m for m in lib.validate_artifacts() if m.level == "error"]
    if errors:
        for error in errors:
            print(f"ERROR[{error.code}] {error.message}")
        return 1
    issues = open_protocol_issues()
    if issues and not args.candidate:
        print("refusing authoritative freeze while protocol issues remain:")
        for issue in issues:
            print(f"- {issue}")
        print("Use --candidate for a non-collectable manifest.")
        return 1
    value = manifest_value("candidate" if args.candidate else "frozen")
    lib.write_json(target, value)
    print(f"wrote {target}")
    print(f"manifest content SHA-256: {value['manifest_content_sha256']}")
    if not args.candidate:
        versioned = lib.RUNS / "manifests" / f"frozen-{value['manifest_content_sha256'][:16]}.json"
        lib.write_json(versioned, value)
        print(f"wrote immutable manifest snapshot {versioned}")
    return 0


def active_manifest(draft: bool) -> Path | None:
    frozen = lib.RUNS / "frozen-manifest.json"
    candidate = lib.RUNS / "candidate-manifest.json"
    if frozen.exists():
        value = lib.read_json(frozen)
        versioned = lib.RUNS / "manifests" / f"frozen-{value['manifest_content_sha256'][:16]}.json"
        active_frozen = versioned if versioned.exists() else frozen
        if not compare_manifest(active_frozen):
            return active_frozen
        if not draft:
            return active_frozen
    if draft and candidate.exists():
        return candidate
    return None


def cmd_schedule(args: argparse.Namespace) -> int:
    manifest = active_manifest(args.draft)
    if manifest is None and not args.draft:
        print("no frozen manifest; resolve protocol issues and run `freeze` first")
        return 1
    if manifest is not None:
        drift = compare_manifest(manifest)
        if drift and not args.draft:
            print("refusing schedule: authoritative manifest is stale")
            for difference in drift:
                print(f"- {difference}")
            return 1
    schedule = lib.build_schedule(args.phase, args.seed)
    expected = lib.EXPECTED_PHASE_COUNTS[args.phase]
    if schedule["count"] != expected:
        raise lib.StudyError(f"{args.phase} generated {schedule['count']}, expected {expected}")
    schedule["created_at"] = now_utc()
    schedule["manifest"] = str(manifest.relative_to(lib.REPO)) if manifest else None
    schedule["manifest_sha256"] = lib.sha256_file(manifest) if manifest else None
    blockers = phase_protocol_issues(args.phase)
    schedule["phase_protocol_issues"] = blockers
    manifest_status = lib.read_json(manifest).get("status") if manifest else None
    schedule["collectable"] = bool(manifest and manifest_status == "frozen" and not blockers)
    out = Path(args.out) if args.out else lib.RUNS / "schedules" / f"{args.phase}.json"
    if not out.is_absolute():
        out = lib.REPO / out
    lib.write_json(out, schedule)
    print(f"wrote {out} ({schedule['count']} runs, seed {args.seed})")
    if not schedule["collectable"]:
        print("DRAFT ONLY - this schedule cannot start registered collection")
        for blocker in blockers:
            print(f"PHASE BLOCKER - {blocker}")
    return 0


def codex_command(item: dict[str, Any], final_path: Path) -> list[str]:
    effort_toml = json.dumps(item["reasoning_effort"])
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
        item["model"],
        "--config",
        f"model_reasoning_effort={effort_toml}",
        "--color",
        "never",
        "--json",
        "--output-last-message",
        str(final_path),
        "-",
    ]


def parse_observed_settings(jsonl_text: str) -> dict[str, list[Any]]:
    observed: dict[str, set[Any]] = {"model": set(), "reasoning_effort": set()}

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in observed and isinstance(child, (str, int, float, bool)):
                    observed[key].add(child)
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    for line in jsonl_text.splitlines():
        try:
            walk(json.loads(line))
        except json.JSONDecodeError:
            continue
    return {key: sorted(values, key=str) for key, values in observed.items()}


def run_one(item: dict[str, Any], timeout: int) -> dict[str, Any]:
    run_dir = lib.RUNS / "raw" / item["run_id"]
    run_dir.mkdir(parents=True, exist_ok=True)
    prompt = lib.prompt_for(item)
    prompt_path = run_dir / "prompt.txt"
    prompt_path.write_text(prompt, encoding="utf-8", newline="\n")
    if lib.sha256_file(prompt_path) != item["prompt_sha256"]:
        raise lib.StudyError(f"prompt hash changed while materializing {item['run_id']}")

    retry = lib.read_json(lib.CONFIG / "benchmark.json")["retry"]
    attempts: list[dict[str, Any]] = []
    successful_attempt: int | None = None
    for attempt in range(1, int(retry["max_retries"]) + 2):
        attempt_dir = run_dir / f"attempt-{attempt}"
        attempt_dir.mkdir(parents=True, exist_ok=True)
        final_path = attempt_dir / "final.txt"
        command = codex_command(item, final_path)
        started = now_utc()
        started_monotonic = time.monotonic()
        with tempfile.TemporaryDirectory(prefix="thoughtml-study-") as scratch:
            env = os.environ.copy()
            env["NO_COLOR"] = "1"
            try:
                result = run_capture(
                    command,
                    input=prompt,
                    cwd=scratch,
                    env=env,
                    timeout=timeout,
                )
                timed_out = False
            except subprocess.TimeoutExpired as exc:
                result = subprocess.CompletedProcess(command, 124, exc.stdout or "", exc.stderr or "")
                timed_out = True
        elapsed = time.monotonic() - started_monotonic
        transcript = result.stdout or ""
        stderr = result.stderr or ""
        (attempt_dir / "events.jsonl").write_text(transcript, encoding="utf-8", newline="\n")
        (attempt_dir / "stderr.txt").write_text(stderr, encoding="utf-8", newline="\n")
        final_text = final_path.read_text(encoding="utf-8") if final_path.exists() else ""
        tool_used, tool_hits = lib.contains_tool_event(transcript)
        attempt_record = {
            "attempt": attempt,
            "started_at": started,
            "completed_at": now_utc(),
            "elapsed_seconds": round(elapsed, 3),
            "exit_code": result.returncode,
            "timed_out": timed_out,
            "final_bytes": len(final_text.encode("utf-8")),
            "tool_event": tool_used,
            "tool_event_hits": tool_hits,
            "observed_settings": parse_observed_settings(transcript),
            "command": command,
        }
        attempts.append(attempt_record)
        if result.returncode == 0 and final_text.strip():
            successful_attempt = attempt
            break
        if attempt <= int(retry["max_retries"]):
            time.sleep(float(retry["base_delay_seconds"]) * float(retry["multiplier"]) ** (attempt - 1))

    exclusions: list[str] = []
    final_text = ""
    chosen_attempt: dict[str, Any] | None = None
    if successful_attempt is None:
        exclusions.append("harness-error-empty-or-rate-limit-after-retries")
    else:
        chosen_attempt = attempts[successful_attempt - 1]
        final_path = run_dir / f"attempt-{successful_attempt}" / "final.txt"
        final_text = final_path.read_text(encoding="utf-8")
        if chosen_attempt["tool_event"]:
            exclusions.append("tool-call-occurred")
        observed = chosen_attempt["observed_settings"]
        if observed["model"] and item["model"] not in observed["model"]:
            exclusions.append("observed-model-mismatch")
        if observed["reasoning_effort"] and item["reasoning_effort"] not in observed["reasoning_effort"]:
            exclusions.append("observed-reasoning-effort-mismatch")

    metadata = {
        "schema_version": 1,
        "run": {k: v for k, v in item.items() if k != "task"},
        "task_metadata": {k: v for k, v in item["task"].items() if k != "prompt"},
        "prompt_sha256": item["prompt_sha256"],
        "payload_transport": "stdin-closed-after-write",
        "attempts": attempts,
        "successful_attempt": successful_attempt,
        "excluded": bool(exclusions),
        "exclusion_reasons": exclusions,
        "context_audit": {
            "neutral_scratch_directory": True,
            "ephemeral": True,
            "user_config_ignored": True,
            "project_rules_ignored": True,
            "transcript_can_prove_absence_of_injected_hidden_context": False,
        },
    }
    lib.write_json(run_dir / "metadata.json", metadata)
    if final_text:
        grade_run(run_dir, item, final_text)
    return metadata


def full_valid_generic(text: str) -> tuple[bool, Any | None]:
    try:
        return True, json.loads(text)
    except json.JSONDecodeError:
        return False, None


def thoughtml_check_text(text: str, grader: Path, temp_dir: Path) -> tuple[bool, list[Any]]:
    candidate = temp_dir / "candidate.thml"
    candidate.write_text(text, encoding="utf-8", newline="\n")
    result = run_capture([str(grader), "check", str(candidate), "--json"])
    try:
        diagnostics = json.loads(result.stdout) if result.stdout.strip() else []
    except json.JSONDecodeError:
        diagnostics = [{"severity": "error", "message": "grader emitted invalid JSON"}]
    return result.returncode == 0, diagnostics


def extract_output(text: str, condition: str, grader: Path, run_dir: Path) -> dict[str, Any]:
    if condition == "G":
        full_valid, _ = full_valid_generic(text)
    else:
        full_valid, _ = thoughtml_check_text(text, grader, run_dir)
    candidate, path = lib.extract_candidate(text, full_valid)
    record: dict[str, Any] = {"path": path, "extracted": candidate is not None}
    if candidate is None:
        return record
    suffix = ".json" if condition == "G" else ".thml"
    extracted_path = run_dir / f"extracted{suffix}"
    extracted_path.write_text(candidate, encoding="utf-8", newline="\n")
    record["file"] = extracted_path.name
    record["sha256"] = lib.sha256_file(extracted_path)
    return record


def thoughtml_grade(extracted: Path, grader: Path) -> dict[str, Any]:
    check = run_capture([str(grader), "check", str(extracted), "--json"])
    lint = run_capture([str(grader), "check", str(extracted), "--json", "--lint", "--strict"])
    strict = run_capture([str(grader), "--strict", str(extracted)])
    provenance = run_capture([str(grader), "--strict", "--strict-provenance", str(extracted)])
    compute = run_capture([str(grader), "--compact", "--compute", str(extracted)])
    try:
        diagnostics = json.loads(check.stdout) if check.stdout.strip() else []
    except json.JSONDecodeError:
        diagnostics = []
    try:
        lint_diagnostics = json.loads(lint.stdout) if lint.stdout.strip() else []
    except json.JSONDecodeError:
        lint_diagnostics = []
    model: dict[str, Any] | None = None
    if compute.returncode == 0:
        try:
            model = json.loads(compute.stdout)
        except json.JSONDecodeError:
            model = None
    text_features = lib.parse_thoughtml_text_features(extracted.read_text(encoding="utf-8"))
    features = lib.canonical_thoughtml_features(model) if model is not None else text_features
    features["text_number_field_count"] = text_features["number_field_count"]
    features["text_number_fields_missing_basis"] = text_features["number_fields_missing_basis"]
    return {
        "format": "thoughtml",
        "parseable": check.returncode == 0,
        "strict_clean": strict.returncode == 0,
        "lint_clean": lint.returncode == 0,
        "strict_provenance_clean": provenance.returncode == 0,
        "diagnostics": diagnostics,
        "lint_diagnostics": lint_diagnostics,
        "compute_succeeded": model is not None,
        "features": features,
    }


def generic_grade(extracted: Path) -> dict[str, Any]:
    try:
        value = json.loads(extracted.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {"format": "generic-json", "parseable": False, "schema_clean": False, "errors": [str(exc)]}
    errors = lib.validate_generic(value)
    return {
        "format": "generic-json",
        "parseable": True,
        "schema_clean": not errors,
        "errors": errors,
        "features": lib.generic_features(value) if isinstance(value, dict) else {},
    }


def grade_run(run_dir: Path, item: dict[str, Any], final_text: str) -> dict[str, Any]:
    grader = thoughtml_binary()
    extraction = extract_output(final_text, item["condition"], grader, run_dir)
    lib.write_json(run_dir / "extraction.json", extraction)
    if not extraction["extracted"]:
        grade = {"parseable": False, "unparseable_response": True, "features": {}}
    else:
        extracted = run_dir / extraction["file"]
        grade = generic_grade(extracted) if item["condition"] == "G" else thoughtml_grade(extracted, grader)

    features = grade.setdefault("features", {})
    if item["phase"].startswith("exp0"):
        selected = lib.selected_option(features.get("final_answer_text"))
        features["selected_option"] = selected
        features["correct"] = selected == item["task"].get("answer") if selected else False
        features["answer_key"] = item["task"].get("answer")
    if item["phase"].startswith("probe"):
        raw = (run_dir / extraction["file"]).read_text(encoding="utf-8") if extraction["extracted"] else ""
        relation_names = sorted(set(re.findall(r"\b(?:" + "|".join(map(re.escape, lib.RELATIONS)) + r")\b", raw)))
        posture_names = sorted(set(re.findall(r"\b(?:" + "|".join(map(re.escape, lib.POSTURES)) + r")\b", raw)))
        features["correct_core_relation_names"] = relation_names
        features["posture_names"] = posture_names
        features["probe_exposure_hit"] = bool(grade.get("parseable") and relation_names)
    lib.write_json(run_dir / "grade.json", grade)
    return grade


def cmd_run(args: argparse.Namespace) -> int:
    schedule_path = Path(args.schedule)
    if not schedule_path.is_absolute():
        schedule_path = lib.REPO / schedule_path
    schedule = lib.read_json(schedule_path)
    blockers = phase_protocol_issues(str(schedule.get("phase", "")))
    if blockers and not args.dry_run:
        print("refusing collection: unresolved phase protocol issues")
        for blocker in blockers:
            print(f"- {blocker}")
        return 1
    if not schedule.get("collectable") and not args.dry_run:
        print("refusing collection: schedule is not backed by an authoritative frozen manifest")
        return 1
    if schedule.get("manifest"):
        manifest = lib.REPO / schedule["manifest"]
        if not manifest.exists() or lib.sha256_file(manifest) != schedule.get("manifest_sha256"):
            print("refusing collection: schedule manifest is missing or changed")
            return 1
        differences = compare_manifest(manifest)
        if differences:
            print("refusing collection: registered artifacts drifted")
            for difference in differences:
                print(f"- {difference}")
            return 1

    items = schedule["items"][: args.limit if args.limit is not None else None]
    if args.dry_run:
        for item in items:
            final = Path("<run-dir>") / "final.txt"
            print(item["run_id"])
            print(json.dumps(codex_command(item, final), ensure_ascii=False))
            print(f"prompt bytes={item['prompt_bytes']} sha256={item['prompt_sha256']}")
        return 0

    for index, item in enumerate(items, 1):
        metadata_path = lib.RUNS / "raw" / item["run_id"] / "metadata.json"
        if args.resume and metadata_path.exists():
            print(f"[{index}/{len(items)}] skip existing {item['run_id']}")
            continue
        print(f"[{index}/{len(items)}] {item['run_id']}", flush=True)
        metadata = run_one(item, args.timeout)
        print(
            f"  attempts={len(metadata['attempts'])} excluded={metadata['excluded']} reasons={metadata['exclusion_reasons']}",
            flush=True,
        )
    return 0


def load_grades() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    raw = lib.RUNS / "raw"
    if not raw.exists():
        return rows
    for grade_path in sorted(raw.glob("*/grade.json")):
        run_dir = grade_path.parent
        metadata_path = run_dir / "metadata.json"
        if not metadata_path.exists():
            continue
        metadata = lib.read_json(metadata_path)
        grade = lib.read_json(grade_path)
        row = dict(metadata["run"])
        row["excluded"] = metadata["excluded"]
        row["exclusion_reasons"] = metadata["exclusion_reasons"]
        attempts = metadata.get("attempts", [])
        row["attempt_count"] = len(attempts)
        row["tool_event"] = any(bool(attempt.get("tool_event")) for attempt in attempts)
        row["elapsed_seconds"] = sum(float(attempt.get("elapsed_seconds", 0.0)) for attempt in attempts)
        usage = {
            "input_tokens": 0,
            "cached_input_tokens": 0,
            "output_tokens": 0,
            "reasoning_output_tokens": 0,
        }
        for attempt in attempts:
            events_path = run_dir / f"attempt-{attempt.get('attempt')}" / "events.jsonl"
            if not events_path.exists():
                continue
            for line in events_path.read_text(encoding="utf-8").splitlines():
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                event_usage = event.get("usage") if event.get("type") == "turn.completed" else None
                if not isinstance(event_usage, dict):
                    continue
                for key in usage:
                    usage[key] += int(event_usage.get(key, 0) or 0)
        row.update(usage)
        row.update({k: v for k, v in grade.items() if k != "features"})
        row.update(grade.get("features", {}))
        rows.append(row)
    return rows


def cmd_grade(args: argparse.Namespace) -> int:
    root = Path(args.runs) if args.runs else lib.RUNS / "raw"
    if not root.is_absolute():
        root = lib.REPO / root
    count = 0
    for metadata_path in sorted(root.glob("*/metadata.json")):
        run_dir = metadata_path.parent
        metadata = lib.read_json(metadata_path)
        attempt = metadata.get("successful_attempt")
        if not attempt:
            continue
        final_path = run_dir / f"attempt-{attempt}" / "final.txt"
        if not final_path.exists():
            continue
        task_id = metadata["run"]["task_id"]
        phase = metadata["run"]["phase"]
        if phase.startswith("exp0"):
            task = next(t for t in lib.load_calibration() if t["id"] == task_id)
        elif phase.startswith("probe"):
            kind = "cued" if phase == "probe-cued" else "neutral"
            task = next(t for t in lib.load_probes(kind) if t["id"] == task_id)
        else:
            task = next(t for t in lib.load_authoring() if t["id"] == task_id)
        item = dict(metadata["run"])
        item["task"] = task
        grade_run(run_dir, item, final_path.read_text(encoding="utf-8"))
        count += 1
    print(f"graded {count} runs")
    return 0


def summary_by_arm_condition(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(str(row.get("arm")), str(row.get("condition")))].append(row)
    out: list[dict[str, Any]] = []
    for (arm, condition), group in sorted(grouped.items()):
        included = [r for r in group if not r.get("excluded")]
        attacks = [float(r["attack_share"]) for r in included if r.get("attack_share") is not None]
        confidences = [
            float(r["final_answer_confidence"])
            for r in included
            if isinstance(r.get("final_answer_confidence"), (int, float))
        ]
        labels_scores = [
            (bool(r["correct"]), float(r["final_answer_confidence"]))
            for r in included
            if isinstance(r.get("correct"), bool)
            and isinstance(r.get("final_answer_confidence"), (int, float))
        ]
        out.append(
            {
                "arm": arm,
                "condition": condition,
                "scheduled_or_observed": len(group),
                "included": len(included),
                "excluded": len(group) - len(included),
                "probe_exposure_hits": sum(bool(r.get("probe_exposure_hit")) for r in included),
                "parse_rate": lib.mean(1.0 if r.get("parseable") else 0.0 for r in included),
                "strict_clean_rate": lib.mean(1.0 if r.get("strict_clean") else 0.0 for r in included),
                "lint_clean_rate": lib.mean(1.0 if r.get("lint_clean") else 0.0 for r in included),
                "mean_attack_share": lib.mean(attacks),
                "documents_with_attack_rate": lib.mean(
                    1.0 if r.get("has_attack") else 0.0 for r in included
                ),
                "mean_final_confidence": lib.mean(confidences),
                "accuracy": lib.mean(1.0 if r.get("correct") else 0.0 for r in included if "correct" in r),
                "confidence_auroc": lib.auroc(
                    [x[0] for x in labels_scores], [x[1] for x in labels_scores]
                ),
            }
        )
    return out


def rule_s_results(rows: list[dict[str, Any]]) -> dict[str, Any]:
    eligible = [
        r
        for r in rows
        if r.get("phase") == "exp1-thoughtml" and not r.get("excluded") and r.get("parseable")
    ]
    by_task: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in eligible:
        by_task[str(row["task_id"])].append(row)
    same_task: list[float] = []
    undefined = 0
    pairs = 0
    for docs in by_task.values():
        for i in range(len(docs)):
            for j in range(i + 1, len(docs)):
                if docs[i]["arm"] == docs[j]["arm"]:
                    continue
                pairs += 1
                overlap = lib.rule_s_overlap(docs[i], docs[j])
                if overlap["relation_jaccard"] is None:
                    undefined += 1
                else:
                    same_task.append(float(overlap["relation_jaccard"]))
    return {
        "rule": "S-floor",
        "pairs": pairs,
        "undefined_relation_pairs": undefined,
        "mean_relation_jaccard_defined_pairs": lib.mean(same_task),
        "note": "Rule J remains pending its separately frozen judge implementation and kappa gate.",
    }


def pilot_acceptance(rows: list[dict[str, Any]]) -> dict[str, Any]:
    conditions: dict[str, dict[str, Any]] = {}
    for condition in ("B", "F"):
        group = [row for row in rows if row.get("condition") == condition and not row.get("excluded")]
        correct = sum(1 for row in group if row.get("correct") is True)
        incorrect = sum(1 for row in group if row.get("correct") is False)
        conditions[condition] = {
            "included": len(group),
            "correct": correct,
            "incorrect": incorrect,
            "correct_window": [15, 24],
            "minimum_incorrect": 6,
            "passed": len(group) == 30 and 15 <= correct <= 24 and incorrect >= 6,
        }
    return {
        "rule": "Each condition must have 15-24 correct and at least 6 incorrect among 30 included runs.",
        "conditions": conditions,
        "passed": all(value["passed"] for value in conditions.values()),
    }


def operational_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    usage_keys = (
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "reasoning_output_tokens",
    )
    return {
        "attempts": sum(int(row.get("attempt_count", 0)) for row in rows),
        "completed_first_attempt": sum(int(row.get("attempt_count", 0)) == 1 for row in rows),
        "runs_with_retries": sum(int(row.get("attempt_count", 0)) > 1 for row in rows),
        "tool_event_runs": sum(bool(row.get("tool_event")) for row in rows),
        "elapsed_seconds": round(sum(float(row.get("elapsed_seconds", 0.0)) for row in rows), 3),
        "usage": {key: sum(int(row.get(key, 0)) for row in rows) for key in usage_keys},
    }


def cmd_analyze(args: argparse.Namespace) -> int:
    all_rows = load_grades()
    if args.phase:
        all_rows = [row for row in all_rows if row.get("phase") == args.phase]
    panel_models = {model["slug"] for model in lib.load_models()}
    withdrawn = [row for row in all_rows if row.get("model") not in panel_models]
    rows = all_rows if args.include_withdrawn else [row for row in all_rows if row.get("model") in panel_models]
    included = [r for r in rows if not r.get("excluded")]
    report = {
        "schema_version": 1,
        "generated_at": now_utc(),
        "phase_filter": args.phase,
        "withdrawn_models_in_raw_data": sorted({str(row.get("model")) for row in withdrawn}),
        "withdrawn_runs_omitted": 0 if args.include_withdrawn else len(withdrawn),
        "observed_runs": len(rows),
        "included_runs": len(included),
        "excluded_runs": len(rows) - len(included),
        "operations": operational_summary(rows),
        "by_arm_condition": summary_by_arm_condition(rows),
        "rule_s": rule_s_results(rows),
        "limitations": [
            "This interim standard-library report is descriptive.",
            "Primary clustered tests, Holm correction, power simulation, and Rule J are not claimed complete here.",
        ],
    }
    if args.phase == "exp0-pilot":
        report["pilot_acceptance"] = pilot_acceptance(rows)
    out = Path(args.out) if args.out else lib.RUNS / "analysis" / "summary.json"
    if not out.is_absolute():
        out = lib.REPO / out
    lib.write_json(out, report)
    print(f"wrote {out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    validate = sub.add_parser("validate", help="validate pre-data artifacts")
    validate.set_defaults(func=cmd_validate)

    freeze = sub.add_parser("freeze", help="write or verify a byte-sensitive manifest")
    freeze.add_argument("--candidate", action="store_true", help="write a non-collectable candidate manifest")
    freeze.add_argument("--check", action="store_true", help="compare current bytes to an existing manifest")
    freeze.set_defaults(func=cmd_freeze)

    schedule = sub.add_parser("schedule", help="create a deterministic randomized schedule")
    schedule.add_argument("--phase", required=True, choices=sorted(lib.EXPECTED_PHASE_COUNTS))
    schedule.add_argument("--seed", type=int, default=20260820)
    schedule.add_argument("--out")
    schedule.add_argument("--draft", action="store_true", help="allow candidate/no manifest; cannot collect")
    schedule.set_defaults(func=cmd_schedule)

    run = sub.add_parser("run", help="execute a frozen schedule")
    run.add_argument("--schedule", required=True)
    run.add_argument("--limit", type=int)
    run.add_argument("--timeout", type=int, default=1800)
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--resume", action="store_true")
    run.set_defaults(func=cmd_run)

    grade = sub.add_parser("grade", help="re-extract and re-grade existing raw runs")
    grade.add_argument("--runs")
    grade.set_defaults(func=cmd_grade)

    analyze = sub.add_parser("analyze", help="generate an interim descriptive analysis")
    analyze.add_argument("--out")
    analyze.add_argument("--phase", choices=sorted(lib.EXPECTED_PHASE_COUNTS))
    analyze.add_argument("--include-withdrawn", action="store_true")
    analyze.set_defaults(func=cmd_analyze)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except lib.StudyError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
