#!/usr/bin/env python3
"""Deterministic mutation suite for Experiment 2 (checker detection and restraint)."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Sequence

import benchmark as harness
import studylib as lib


@dataclass(frozen=True)
class Mutation:
    operator: str
    mutation_class: str
    description: str
    source: str


Mutator = Callable[[str], str | None]


LINK = re.compile(
    r"(?m)^link\s+(?:(?P<alias>[a-z0-9-]+):\s+)?(?P<from>[a-z0-9-]+)\s+"
    r"(?P<relation>[a-z][a-z-]+)\s+(?P<to>[a-z0-9-]+)(?P<tail>[^\n]*)$"
)
TYPED_HEADER = re.compile(
    r"(?m)^(?:claim|observation|hypothesis|option|decision|outcome|goal|assumption|memory|action)\s+([a-z0-9-]+)\b"
)


def mutate_dangling_target(text: str) -> str | None:
    match = LINK.search(text)
    if not match:
        return None
    start, end = match.span("to")
    return text[:start] + "missing-target" + text[end:]


def mutate_unknown_relation(text: str) -> str | None:
    match = LINK.search(text)
    if not match:
        return None
    start, end = match.span("relation")
    return text[:start] + "supportz" + text[end:]


def mutate_flip_polarity(text: str) -> str | None:
    match = re.search(r"(?m)^link\s+(?:(?:[a-z0-9-]+):\s+)?[a-z0-9-]+\s+(supports|opposes)\s+", text)
    if not match:
        return None
    replacement = "opposes" if match.group(1) == "supports" else "supports"
    start, end = match.span(1)
    return text[:start] + replacement + text[end:]


def mutate_reverse_link(text: str) -> str | None:
    match = LINK.search(text)
    if not match:
        return None
    alias = f"{match.group('alias')}: " if match.group("alias") else ""
    replacement = (
        f"link {alias}{match.group('to')} {match.group('relation')} {match.group('from')}"
        f"{match.group('tail')}"
    )
    return text[: match.start()] + replacement + text[match.end() :]


def mutate_invert_confidence(text: str) -> str | None:
    match = re.search(
        r"(?m)^(?P<prefix>\s*confidence\s+)(?P<value>[01](?:\.\d+)?)(?P<suffix>\s+(?:measured|estimated|assumed)\s*)$",
        text,
    )
    if not match:
        return None
    inverted = 1.0 - float(match.group("value"))
    value = f"{inverted:.6f}".rstrip("0").rstrip(".")
    replacement = f"{match.group('prefix')}{value}{match.group('suffix')}"
    return text[: match.start()] + replacement + text[match.end() :]


def mutate_strip_basis(text: str) -> str | None:
    match = re.search(
        r"(?m)^(\s*(?:confidence|weight|probability|quantity)\s+[^\n]*?)\s+(measured|estimated|assumed)\s*$",
        text,
    )
    if not match:
        return None
    return text[: match.start()] + match.group(1) + text[match.end() :]


def mutate_probability_to_weight(text: str) -> str | None:
    match = re.search(r"(?m)^(\s*)probability(\s+[01](?:\.\d+)?\s+(?:measured|estimated|assumed)\s*)$", text)
    if not match:
        return None
    replacement = f"{match.group(1)}weight{match.group(2)}"
    return text[: match.start()] + replacement + text[match.end() :]


def mutate_enumeration_as_support(text: str) -> str | None:
    match = re.search(r"(?m)^part-of\s+([a-z0-9-]+)\s*\n((?:\s{2,}[a-z0-9-]+\s*\n?){3,})", text)
    if not match:
        return None
    start = match.start()
    return text[:start] + "supports" + text[start + len("part-of") :]


def mutate_split_identity(text: str) -> str | None:
    for match in TYPED_HEADER.finditer(text):
        node_id = match.group(1)
        if len(re.findall(rf"\b{re.escape(node_id)}\b", text)) >= 2:
            start, end = match.span(1)
            return text[:start] + f"{node_id}-split" + text[end:]
    return None


def mutate_merge_identities(text: str) -> str | None:
    ids = TYPED_HEADER.findall(text)
    if len(ids) < 2:
        return None
    first, second = ids[0], ids[1]
    return re.sub(rf"\b{re.escape(second)}\b", first, text)


def mutate_whitespace_only(text: str) -> str | None:
    lines = text.splitlines()
    if len(lines) < 4:
        return None
    return "\n\n" + "\n".join(line.rstrip() + ("  " if line and not line.startswith("  ") else "") for line in lines) + "\n\n"


def mutate_consistent_rename(text: str) -> str | None:
    match = TYPED_HEADER.search(text)
    if not match:
        return None
    old = match.group(1)
    new = f"renamed-{old}"
    return re.sub(rf"\b{re.escape(old)}\b", new, text)


OPERATORS: list[tuple[Mutation, Mutator]] = [
    (Mutation("dangling-target", "structural", "Replace one link target with an undeclared id.", "registered"), mutate_dangling_target),
    (Mutation("unknown-relation", "structural", "Replace one relation with an out-of-vocabulary word.", "registered"), mutate_unknown_relation),
    (Mutation("flip-polarity", "relational-semantic", "Flip one supports/opposes relation.", "registered"), mutate_flip_polarity),
    (Mutation("reverse-link", "relational-semantic", "Reverse one directed link.", "registered"), mutate_reverse_link),
    (Mutation("invert-confidence", "numeric", "Replace one confidence c with 1-c.", "registered"), mutate_invert_confidence),
    (Mutation("strip-basis", "numeric", "Remove one measured/estimated/assumed label.", "registered"), mutate_strip_basis),
    (Mutation("probability-to-weight", "numeric", "Put weight where a leads-to probability belongs.", "registered"), mutate_probability_to_weight),
    (Mutation("part-of-to-supports", "enumeration", "Turn a structural enumeration into evidence.", "registered"), mutate_enumeration_as_support),
    (Mutation("split-identity", "identity", "Rename a declaration without updating its references.", "registered"), mutate_split_identity),
    (Mutation("merge-identities", "identity", "Merge two distinct declared ids.", "registered"), mutate_merge_identities),
    (Mutation("whitespace-only", "restraint", "Change whitespace without changing semantics.", "control"), mutate_whitespace_only),
    (Mutation("consistent-rename", "restraint", "Rename one id and all references consistently.", "control"), mutate_consistent_rename),
]


def diagnostic_signatures(stdout: str) -> set[str]:
    try:
        diagnostics = json.loads(stdout) if stdout.strip() else []
    except json.JSONDecodeError:
        return {"grader-invalid-json"}
    signatures: set[str] = set()
    for diag in diagnostics:
        code = diag.get("code")
        message = re.sub(r"`[^`]+`", "`<id>`", str(diag.get("message", "")))
        signatures.add(str(code or message))
    return signatures


def audit_signatures(stdout: str) -> set[str]:
    try:
        model = json.loads(stdout)
    except json.JSONDecodeError:
        return {"audit-invalid-json"}
    return {str(c.get("kind")) for c in (model.get("audit") or {}).get("conflicts", [])}


def grade_modes(path: Path, grader: Path) -> dict[str, object]:
    default = harness.run_capture([str(grader), "check", str(path), "--json"])
    lint = harness.run_capture([str(grader), "check", str(path), "--json", "--lint"])
    provenance = harness.run_capture([str(grader), "--strict", "--strict-provenance", str(path)])
    audit = harness.run_capture([str(grader), "--compact", "--audit", str(path)])
    return {
        "default": sorted(diagnostic_signatures(default.stdout)),
        "lint": sorted(diagnostic_signatures(lint.stdout)),
        "strict_provenance_failed": provenance.returncode != 0,
        "audit": sorted(audit_signatures(audit.stdout)) if audit.returncode == 0 else ["audit-command-failed"],
        "parse_failed": default.returncode != 0,
    }


def delta_grade(baseline: dict[str, object], mutant: dict[str, object]) -> dict[str, object]:
    default_new = sorted(set(mutant["default"]) - set(baseline["default"]))
    lint_new = sorted(set(mutant["lint"]) - set(baseline["lint"]))
    audit_new = sorted(set(mutant["audit"]) - set(baseline["audit"]))
    provenance_new = bool(mutant["strict_provenance_failed"] and not baseline["strict_provenance_failed"])
    return {
        "new_default_signatures": default_new,
        "new_lint_signatures": lint_new,
        "new_audit_signatures": audit_new,
        "new_strict_provenance_failure": provenance_new,
        "caught_default": bool(default_new),
        "caught_lint": bool(lint_new),
        "caught_audit": bool(audit_new),
        "caught_strict_provenance": provenance_new,
        "caught_any": bool(default_new or lint_new or audit_new or provenance_new),
    }


def corpus_files(include_model_runs: bool, development: bool) -> list[Path]:
    corpus = "development" if development else "registered-clean"
    files = sorted((lib.STUDY / "mutation-corpus" / corpus).glob("*.thml"))
    if include_model_runs:
        files.extend(sorted((lib.RUNS / "raw").glob("*/extracted.thml")))
    return files


def generate(out: Path, include_model_runs: bool, development: bool) -> dict[str, object]:
    grader = harness.thoughtml_binary()
    out.mkdir(parents=True, exist_ok=True)
    mutants_dir = out / "files"
    if mutants_dir.exists():
        shutil.rmtree(mutants_dir)
    mutants_dir.mkdir(parents=True)
    records: list[dict[str, object]] = []
    source_records: list[dict[str, object]] = []

    for source_index, source_path in enumerate(corpus_files(include_model_runs, development), 1):
        text = source_path.read_text(encoding="utf-8")
        baseline = grade_modes(source_path, grader)
        source_id = f"source-{source_index:03d}-{source_path.stem}"
        source_records.append(
            {
                "source_id": source_id,
                "path": source_path.relative_to(lib.REPO).as_posix(),
                "sha256": lib.sha256_file(source_path),
                "baseline": baseline,
            }
        )
        for mutation, operator in OPERATORS:
            mutated = operator(text)
            if mutated is None or mutated == text:
                continue
            mutant_id = f"{source_id}__{mutation.operator}"
            mutant_path = mutants_dir / f"{mutant_id}.thml"
            mutant_path.write_text(mutated, encoding="utf-8", newline="\n")
            mutant_grade = grade_modes(mutant_path, grader)
            delta = delta_grade(baseline, mutant_grade)
            records.append(
                {
                    "mutant_id": mutant_id,
                    "source_id": source_id,
                    "operator": mutation.operator,
                    "class": mutation.mutation_class,
                    "control_or_defect": mutation.source,
                    "description": mutation.description,
                    "path": mutant_path.relative_to(lib.REPO).as_posix(),
                    "sha256": lib.sha256_file(mutant_path),
                    "grade": mutant_grade,
                    "delta": delta,
                }
            )

    by_class: dict[str, dict[str, object]] = {}
    classes = sorted({str(r["class"]) for r in records})
    for mutation_class in classes:
        group = [r for r in records if r["class"] == mutation_class]
        by_class[mutation_class] = {
            "n": len(group),
            "caught_default": sum(bool(r["delta"]["caught_default"]) for r in group),
            "caught_lint": sum(bool(r["delta"]["caught_lint"]) for r in group),
            "caught_strict_provenance": sum(
                bool(r["delta"]["caught_strict_provenance"]) for r in group
            ),
            "caught_audit": sum(bool(r["delta"]["caught_audit"]) for r in group),
            "caught_any": sum(bool(r["delta"]["caught_any"]) for r in group),
        }
    report = {
        "schema_version": 1,
        "generated_at": harness.now_utc(),
        "grader_sha256": lib.sha256_file(grader),
        "operator_source_sha256": lib.sha256_file(Path(__file__)),
        "include_model_runs": include_model_runs,
        "development_pilot": development,
        "sources": source_records,
        "mutants": records,
        "summary_by_class": by_class,
        "pooled_all_defect_rate_reported": False,
    }
    lib.write_json(out / "manifest.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(lib.RUNS / "mutations"))
    parser.add_argument("--include-model-runs", action="store_true")
    parser.add_argument(
        "--development",
        action="store_true",
        help="use the disclosed development corpus; registered corpus otherwise requires a freeze",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.development and not (lib.RUNS / "frozen-manifest.json").exists():
        print("refusing registered mutation run before authoritative freeze", file=sys.stderr)
        return 1
    out = Path(args.out)
    if not out.is_absolute():
        out = lib.REPO / out
    report = generate(out, args.include_model_runs, args.development)
    print(f"wrote {out / 'manifest.json'}")
    for mutation_class, summary in report["summary_by_class"].items():
        print(f"{mutation_class}: {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
