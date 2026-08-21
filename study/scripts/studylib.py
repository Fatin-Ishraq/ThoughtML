"""Standard-library core for the ThoughtML pre-registered benchmark."""

from __future__ import annotations

import hashlib
import json
import math
import random
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence


STUDY = Path(__file__).resolve().parents[1]
REPO = STUDY.parent
TASKS = STUDY / "tasks"
PAYLOADS = STUDY / "payloads"
CONFIG = STUDY / "config"
SCHEMAS = STUDY / "schemas"
RUNS = STUDY / "runs"
SPEC = REPO / "crates" / "thoughtml" / "llms.txt"

RELATIONS = {
    "supports",
    "opposes",
    "undercuts",
    "causes",
    "enables",
    "prevents",
    "depends-on",
    "blocks",
    "answers",
    "revises",
    "leads-to",
    "option-of",
    "part-of",
    "candidate-for",
}
POLARITY_RELATIONS = {"supports", "opposes", "undercuts"}
POSTURES = {
    "noticed",
    "considers",
    "suspects",
    "infers",
    "asks",
    "holds",
    "chooses",
    "rejects",
    "revises",
    "remembers",
    "doubts",
    "accepts",
}


class StudyError(RuntimeError):
    pass


@dataclass(frozen=True)
class ValidationMessage:
    level: str
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"level": self.level, "code": self.code, "message": self.message}


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise StudyError(f"cannot read JSON {path}: {exc}") from exc


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w]+(?:[’'-][\w]+)*\b", text, flags=re.UNICODE))


def normalized_id(value: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def load_models() -> list[dict[str, Any]]:
    data = read_json(CONFIG / "models.json")
    return list(data["models"])


def load_calibration() -> list[dict[str, Any]]:
    return list(read_json(TASKS / "calibration.json")["tasks"])


def load_calibration_pilot() -> list[dict[str, Any]]:
    return list(read_json(TASKS / "calibration-pilot-v2.6.json")["tasks"])


def load_authoring() -> list[dict[str, Any]]:
    return list(read_json(TASKS / "authoring.json")["tasks"])


def load_probes(kind: str) -> list[dict[str, Any]]:
    if kind not in {"cued", "neutral"}:
        raise StudyError(f"unknown probe kind: {kind}")
    return list(read_json(TASKS / "contamination.json")[kind])


def _validate_task_common(
    task: dict[str, Any], expected_prefix: str, min_words: int, max_words: int
) -> list[ValidationMessage]:
    out: list[ValidationMessage] = []
    task_id = str(task.get("id", ""))
    if not re.fullmatch(rf"{re.escape(expected_prefix)}-\d{{3}}", task_id):
        out.append(ValidationMessage("error", "TASK_ID", f"invalid task id {task_id!r}"))
    prompt = task.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        out.append(ValidationMessage("error", "TASK_PROMPT", f"{task_id}: missing prompt"))
    else:
        count = word_count(prompt)
        if not min_words <= count <= max_words:
            out.append(
                ValidationMessage(
                    "error",
                    "TASK_LENGTH",
                    f"{task_id}: {count} words, expected {min_words}..{max_words}",
                )
            )
    if not isinstance(task.get("domain"), str) or not task["domain"]:
        out.append(ValidationMessage("error", "TASK_DOMAIN", f"{task_id}: missing domain"))
    if not isinstance(task.get("software_related"), bool):
        out.append(
            ValidationMessage("error", "TASK_SOFTWARE", f"{task_id}: software_related is not bool")
        )
    return out


def _domain_messages(tasks: Sequence[dict[str, Any]], label: str) -> list[ValidationMessage]:
    out: list[ValidationMessage] = []
    n = len(tasks)
    domains = Counter(str(t.get("domain")) for t in tasks)
    for domain, count in sorted(domains.items()):
        if n and count / n > 0.25:
            out.append(
                ValidationMessage(
                    "error",
                    "DOMAIN_SHARE",
                    f"{label}: domain {domain!r} is {count}/{n} (>25%)",
                )
            )
    software = sum(bool(t.get("software_related")) for t in tasks)
    if n and software / n > 0.25:
        out.append(
            ValidationMessage(
                "error", "SOFTWARE_SHARE", f"{label}: software tasks are {software}/{n} (>25%)"
            )
        )
    return out


def validate_artifacts() -> list[ValidationMessage]:
    out: list[ValidationMessage] = []
    calibration = load_calibration()
    calibration_pilot = load_calibration_pilot()
    authoring = load_authoring()
    models = load_models()

    if len(calibration) != 30:
        out.append(
            ValidationMessage("error", "CAL_COUNT", f"calibration has {len(calibration)} tasks, expected 30")
        )
    if len(calibration_pilot) != 10:
        out.append(
            ValidationMessage(
                "error",
                "PILOT_CAL_COUNT",
                f"v2.6 pilot calibration has {len(calibration_pilot)} tasks, expected 10",
            )
        )
    if len(authoring) != 12:
        out.append(
            ValidationMessage("error", "AUTH_COUNT", f"authoring has {len(authoring)} tasks, expected 12")
        )
    if len(models) != 5:
        out.append(ValidationMessage("error", "MODEL_COUNT", f"model panel has {len(models)}, expected 5"))

    seen: set[str] = set()
    difficulties: Counter[str] = Counter()
    for task in calibration:
        out.extend(_validate_task_common(task, "cal", 80, 200))
        task_id = str(task.get("id"))
        if task_id in seen:
            out.append(ValidationMessage("error", "DUPLICATE_ID", task_id))
        seen.add(task_id)
        if task.get("answer") not in {"A", "B", "C", "D"}:
            out.append(ValidationMessage("error", "ANSWER_KEY", f"{task_id}: invalid answer"))
        if not isinstance(task.get("rationale"), str) or not task["rationale"].strip():
            out.append(ValidationMessage("error", "RATIONALE", f"{task_id}: missing rationale"))
        difficulty = str(task.get("difficulty", ""))
        difficulties[difficulty] += 1
        if difficulty not in {"easy", "medium", "hard"}:
            out.append(ValidationMessage("error", "DIFFICULTY", f"{task_id}: invalid difficulty"))
        verification = task.get("verification")
        if not isinstance(verification, dict) or not isinstance(verification.get("solver"), str):
            out.append(ValidationMessage("error", "VERIFICATION", f"{task_id}: missing solver"))
        prompt = str(task.get("prompt", ""))
        for option in "ABCD":
            if not re.search(rf"(?m)^{option}\.\s+\S", prompt):
                out.append(
                    ValidationMessage("error", "OPTIONS", f"{task_id}: missing option {option}")
                )

    for task in authoring:
        out.extend(_validate_task_common(task, "auth", 80, 200))
        task_id = str(task.get("id"))
        if task_id in seen:
            out.append(ValidationMessage("error", "DUPLICATE_ID", task_id))
        seen.add(task_id)
        if not isinstance(task.get("tension"), bool):
            out.append(ValidationMessage("error", "TENSION", f"{task_id}: tension is not bool"))
        positions = task.get("acceptable_positions")
        if not isinstance(positions, list) or not positions:
            out.append(ValidationMessage("error", "POSITIONS", f"{task_id}: no positions"))
        if not isinstance(task.get("construction_note"), str):
            out.append(ValidationMessage("error", "CONSTRUCTION_NOTE", f"{task_id}: missing note"))

    tension = sum(bool(t.get("tension")) for t in authoring)
    if tension != 9:
        out.append(ValidationMessage("error", "TENSION_SPLIT", f"got {tension} tension tasks, expected 9"))
    if len(authoring) - tension != 3:
        out.append(
            ValidationMessage("error", "NO_TENSION_SPLIT", f"got {len(authoring)-tension}, expected 3")
        )

    expected_difficulties = Counter({"easy": 6, "medium": 12, "hard": 12})
    if difficulties != expected_difficulties:
        out.append(
            ValidationMessage(
                "error",
                "DIFFICULTY_SPLIT",
                f"got {dict(difficulties)}, expected {dict(expected_difficulties)}",
            )
        )

    for task in calibration_pilot:
        out.extend(_validate_task_common(task, "pilot-cal", 80, 200))
        task_id = str(task.get("id"))
        if task_id in seen:
            out.append(ValidationMessage("error", "DUPLICATE_ID", task_id))
        seen.add(task_id)
        if task.get("answer") not in {"A", "B", "C", "D"}:
            out.append(ValidationMessage("error", "ANSWER_KEY", f"{task_id}: invalid answer"))
        if task.get("difficulty") != "hard":
            out.append(
                ValidationMessage("error", "PILOT_DIFFICULTY", f"{task_id}: expected hard")
            )
        if not isinstance(task.get("rationale"), str) or not task["rationale"].strip():
            out.append(ValidationMessage("error", "RATIONALE", f"{task_id}: missing rationale"))
        verification = task.get("verification")
        if not isinstance(verification, dict) or not isinstance(verification.get("solver"), str):
            out.append(ValidationMessage("error", "VERIFICATION", f"{task_id}: missing solver"))
        prompt = str(task.get("prompt", ""))
        for option in "ABCD":
            if not re.search(rf"(?m)^{option}\.\s+\S", prompt):
                out.append(
                    ValidationMessage("error", "OPTIONS", f"{task_id}: missing option {option}")
                )

    neutral_suffix = "Decide what should be done. Represent the reasoning and conclusion in the requested format."
    for task in authoring:
        if not str(task.get("prompt", "")).endswith(neutral_suffix):
            out.append(
                ValidationMessage(
                    "error", "AUTHORING_SUFFIX", f"{task.get('id')}: non-neutral task ending"
                )
            )

    biased_terms = ("counterevidence", "counterargument", "opposing the conclusion")
    for path in (PAYLOADS / "thoughtml-instruction.txt", PAYLOADS / "generic-instruction.txt"):
        lowered = path.read_text(encoding="utf-8").lower()
        for term in biased_terms:
            if term in lowered:
                out.append(
                    ValidationMessage(
                        "error", "BIASED_INSTRUCTION", f"{path.name}: contains {term!r}"
                    )
                )

    review = (TASKS / "reviewer-checklist.md").read_text(encoding="utf-8")
    if "Decision: [x] approve unchanged  [ ] revise before freeze" not in review:
        out.append(
            ValidationMessage(
                "error", "HUMAN_REVIEW", "human review is not unambiguously approved"
            )
        )
    attestation = (TASKS / "human-review-attestation.md").read_text(encoding="utf-8")
    if "Decision: approved unchanged for the pre-data freeze" not in attestation:
        out.append(
            ValidationMessage(
                "error", "HUMAN_ATTESTATION", "human-review attestation is incomplete"
            )
        )

    out.extend(_domain_messages(calibration, "calibration"))
    out.extend(_domain_messages(calibration_pilot, "v2.6 pilot calibration"))
    out.extend(_domain_messages(authoring, "authoring"))

    probe_data = read_json(TASKS / "contamination.json")
    for kind in ("cued", "neutral"):
        probes = probe_data.get(kind, [])
        if len(probes) != 5:
            out.append(
                ValidationMessage("error", "PROBE_COUNT", f"{kind} probe has {len(probes)}, expected 5")
            )
        for task in probes:
            if not re.fullmatch(rf"probe-{kind}-\d{{3}}", str(task.get("id", ""))):
                out.append(ValidationMessage("error", "PROBE_ID", str(task.get("id"))))
            if not str(task.get("prompt", "")).strip():
                out.append(ValidationMessage("error", "PROBE_PROMPT", str(task.get("id"))))

    arms = [str(m.get("arm")) for m in models]
    slugs = [str(m.get("slug")) for m in models]
    if len(arms) != len(set(arms)) or len(slugs) != len(set(slugs)):
        out.append(ValidationMessage("error", "MODEL_DUPLICATE", "model arms/slugs must be unique"))

    benchmark = read_json(CONFIG / "benchmark.json")
    if benchmark.get("preregistration_version") != "2.6":
        out.append(
            ValidationMessage(
                "error", "PREREG_VERSION", "benchmark config is not pinned to protocol v2.6"
            )
        )
    collection_order = benchmark.get("collection_order", {})
    if collection_order.get("strategy") != "global_provider_blocks":
        out.append(
            ValidationMessage(
                "error", "COLLECTION_STRATEGY", "collection order must use global provider blocks"
            )
        )
    if collection_order.get("provider_blocks") != ["openai", "deepseek"]:
        out.append(
            ValidationMessage(
                "error", "COLLECTION_ORDER", "collection order must place GPT/OpenAI before DeepSeek"
            )
        )
    pilot_config = benchmark.get("exp0_pilot_v2_6", {})
    expected_pilot_config = {
        "phase": "exp0-pilot-v2.6",
        "model": "gpt-5.6-terra",
        "task_count": 10,
        "conditions": ["F", "B"],
        "included_per_condition": 10,
        "correct_min": 5,
        "correct_max": 8,
        "minimum_incorrect": 2,
        "main_task_reuse": "forbidden",
    }
    if pilot_config != expected_pilot_config:
        out.append(
            ValidationMessage(
                "error", "PILOT_CONFIG", "v2.6 pilot gate/configuration does not match protocol"
            )
        )
    if sha256_file(SPEC) != benchmark.get("spec_sha256"):
        out.append(ValidationMessage("error", "SPEC_HASH", "llms.txt does not match frozen hash"))

    registered_text = [
        PAYLOADS / "thoughtml-instruction.txt",
        PAYLOADS / "basis-required.txt",
        PAYLOADS / "generic-instruction.txt",
        PAYLOADS / "probe-instruction.txt",
        PAYLOADS / "control-schema.txt",
        SPEC,
    ]
    for path in registered_text:
        data = path.read_bytes()
        if b"\r\n" in data:
            out.append(ValidationMessage("error", "CRLF", f"{path.relative_to(REPO)} contains CRLF"))
        if not data.endswith(b"\n"):
            out.append(
                ValidationMessage("warning", "FINAL_NEWLINE", f"{path.relative_to(REPO)} lacks final LF")
            )

    if "[OPEN]" in (STUDY / "protocol-issues.md").read_text(encoding="utf-8"):
        out.append(
            ValidationMessage(
                "warning",
                "OPEN_PROTOCOL_ISSUES",
                "protocol-issues.md contains unresolved pre-data decisions; collection must not start",
            )
        )
    if "[EXP0 BLOCKER]" in (STUDY / "protocol-issues.md").read_text(encoding="utf-8"):
        out.append(
            ValidationMessage(
                "warning",
                "EXP0_PROTOCOL_BLOCKER",
                "Calibration corpus revision remains unresolved; Experiment 0 collection is blocked",
            )
        )
    if "[EXP0 PILOT BLOCKER]" in (STUDY / "protocol-issues.md").read_text(encoding="utf-8"):
        out.append(
            ValidationMessage(
                "warning",
                "EXP0_PILOT_PROTOCOL_BLOCKER",
                "The v2.6 pilot awaits independent human review; collection is blocked",
            )
        )
    if "[EXP1 BLOCKER]" in (STUDY / "protocol-issues.md").read_text(encoding="utf-8"):
        out.append(
            ValidationMessage(
                "warning",
                "EXP1_PROTOCOL_BLOCKER",
                "Rule J remains unresolved; Experiment 1 collection is blocked",
            )
        )
    return out


def registered_files() -> list[Path]:
    paths = [
        STUDY / "preregistration.md",
        STUDY / "protocol-issues.md",
        CONFIG / "benchmark.json",
        CONFIG / "models.json",
        TASKS / "calibration.json",
        TASKS / "calibration-pilot-v2.6.json",
        TASKS / "authoring.json",
        TASKS / "contamination.json",
        PAYLOADS / "thoughtml-instruction.txt",
        PAYLOADS / "basis-required.txt",
        PAYLOADS / "generic-instruction.txt",
        PAYLOADS / "probe-instruction.txt",
        PAYLOADS / "control-schema.txt",
        SCHEMAS / "generic-response.schema.json",
        STUDY / "power-analysis.json",
        STUDY / "sample-size-estimation.json",
        STUDY / "h1b-boundary-estimation.json",
        STUDY / "answer-verification.json",
        STUDY / "pilot-answer-verification-v2.6.json",
        TASKS / "reviewer-checklist.md",
        TASKS / "pilot-v2.6-review.md",
        TASKS / "human-review-attestation.md",
        SPEC,
    ]
    rule_j = STUDY / "rule-j"
    if rule_j.exists():
        paths.extend(sorted(path for path in rule_j.iterdir() if path.is_file()))
    paths.extend(sorted((STUDY / "scripts").glob("*.py")))
    paths.extend(sorted((STUDY / "mutation-corpus" / "registered-clean").glob("*.thml")))
    return sorted(paths, key=lambda p: p.as_posix())


def file_record(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    return {
        "path": path.relative_to(REPO).as_posix(),
        "sha256": sha256_bytes(data),
        "bytes": len(data),
        "lines": data.count(b"\n"),
        "line_endings": "crlf" if b"\r\n" in data else "lf",
    }


def prompt_for(item: dict[str, Any]) -> str:
    condition = item["condition"]
    task = item["task"]
    if condition == "probe":
        instruction = (PAYLOADS / "probe-instruction.txt").read_text(encoding="utf-8")
        return f"{instruction.rstrip()}\n\n# Task\n\n{task['prompt'].strip()}\n"

    if condition in {"F", "B", "thoughtml"}:
        instruction = (PAYLOADS / "thoughtml-instruction.txt").read_text(encoding="utf-8").rstrip()
        if condition == "B":
            basis = (PAYLOADS / "basis-required.txt").read_text(encoding="utf-8").rstrip()
            instruction = f"{instruction}\n\n{basis}"
        payload = SPEC.read_text(encoding="utf-8").rstrip()
        return f"{instruction}\n\n# ThoughtML specification\n\n{payload}\n\n# Task\n\n{task['prompt'].strip()}\n"

    if condition == "G":
        instruction = (PAYLOADS / "generic-instruction.txt").read_text(encoding="utf-8").rstrip()
        payload = (PAYLOADS / "control-schema.txt").read_text(encoding="utf-8").rstrip()
        return f"{instruction}\n\n# Generic schema\n\n{payload}\n\n# Task\n\n{task['prompt'].strip()}\n"
    raise StudyError(f"unknown condition: {condition}")


def _run_item(
    *,
    phase: str,
    task: dict[str, Any],
    model: dict[str, Any],
    condition: str,
    sample: int,
    effort: str,
) -> dict[str, Any]:
    item = {
        "phase": phase,
        "task_id": task["id"],
        "task": task,
        "arm": model["arm"],
        "model": model["slug"],
        "vendor": model["vendor"],
        "condition": condition,
        "sample": sample,
        "reasoning_effort": effort,
    }
    item["run_id"] = (
        f"{phase}__{task['id']}__{model['arm']}__{condition}__s{sample}__{effort}"
    ).lower()
    prompt = prompt_for(item)
    item["prompt_sha256"] = sha256_bytes(prompt.encode("utf-8"))
    item["prompt_bytes"] = len(prompt.encode("utf-8"))
    return item


def build_schedule(phase: str, seed: int) -> dict[str, Any]:
    models = load_models()
    base_effort = read_json(CONFIG / "models.json")["harness"]["base_effort"]
    items: list[dict[str, Any]] = []

    if phase in {"probe-cued", "probe-neutral"}:
        kind = phase.removeprefix("probe-")
        for task in load_probes(kind):
            for model in models:
                items.append(
                    _run_item(
                        phase=phase,
                        task=task,
                        model=model,
                        condition="probe",
                        sample=1,
                        effort=base_effort,
                    )
                )
    elif phase == "exp0-pilot":
        terra = next(m for m in models if m["arm"] == "T")
        for task in load_calibration():
            for condition in ("F", "B"):
                items.append(
                    _run_item(
                        phase=phase,
                        task=task,
                        model=terra,
                        condition=condition,
                        sample=1,
                        effort=base_effort,
                    )
                )
    elif phase == "exp0-pilot-v2.6":
        terra = next(m for m in models if m["arm"] == "T")
        for task in load_calibration_pilot():
            for condition in ("F", "B"):
                items.append(
                    _run_item(
                        phase=phase,
                        task=task,
                        model=terra,
                        condition=condition,
                        sample=1,
                        effort=base_effort,
                    )
                )
    elif phase == "exp0-main":
        for task in load_calibration():
            for model in models:
                for condition in ("F", "B"):
                    items.append(
                        _run_item(
                            phase=phase,
                            task=task,
                            model=model,
                            condition=condition,
                            sample=1,
                            effort=base_effort,
                        )
                    )
    elif phase == "exp1-thoughtml":
        for task in load_authoring():
            for model in models:
                for sample in (1, 2, 3):
                    items.append(
                        _run_item(
                            phase=phase,
                            task=task,
                            model=model,
                            condition="thoughtml",
                            sample=sample,
                            effort=base_effort,
                        )
                    )
    elif phase == "exp1-generic":
        for task in load_authoring():
            for model in models:
                items.append(
                    _run_item(
                        phase=phase,
                        task=task,
                        model=model,
                        condition="G",
                        sample=1,
                        effort=base_effort,
                    )
                )
    elif phase == "exp5":
        terra = next(m for m in models if m["arm"] == "T")
        efforts = read_json(CONFIG / "models.json")["effort_sweep"]
        for task in load_authoring():
            for effort in efforts:
                for sample in (1, 2):
                    items.append(
                        _run_item(
                            phase=phase,
                            task=task,
                            model=terra,
                            condition="thoughtml",
                            sample=sample,
                            effort=effort,
                        )
                    )
    else:
        raise StudyError(f"unknown phase {phase!r}")

    random.Random(seed).shuffle(items)
    collection_order = read_json(CONFIG / "benchmark.json")["collection_order"]
    order = collection_order["provider_blocks"]
    priority = {vendor: index for index, vendor in enumerate(order)}
    unknown = sorted({item["vendor"] for item in items if item["vendor"] not in priority})
    if unknown:
        raise StudyError(f"vendors missing from collection-order policy: {unknown}")
    items.sort(key=lambda item: priority[item["vendor"]])
    return {
        "schema_version": 1,
        "phase": phase,
        "seed": seed,
        "order_policy": {
            "strategy": collection_order["strategy"],
            "provider_blocks": order,
            "scope": collection_order["scope"],
            "within_provider": collection_order["within_provider"],
        },
        "count": len(items),
        "items": items,
    }


EXPECTED_PHASE_COUNTS = {
    "probe-cued": 25,
    "probe-neutral": 25,
    "exp0-pilot": 60,
    "exp0-pilot-v2.6": 20,
    "exp0-main": 300,
    "exp1-thoughtml": 180,
    "exp1-generic": 60,
    "exp5": 96,
}


FENCE_RE = re.compile(r"```(?:[A-Za-z0-9_+.-]+)?\s*\n(.*?)```", re.DOTALL)


def extract_candidate(response: str, full_is_valid: bool) -> tuple[str | None, str]:
    if full_is_valid:
        return response, "full"
    blocks = FENCE_RE.findall(response)
    if len(blocks) == 1:
        return blocks[0].strip() + "\n", "single-fence"
    if len(blocks) > 1:
        longest = max(blocks, key=len)
        return longest.strip() + "\n", "longest-fence"
    return None, "unparseable"


def validate_generic(value: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return ["top level is not an object"]
    if set(value) != {"claims", "relations"}:
        errors.append("top-level keys must be exactly claims and relations")
    claims = value.get("claims")
    relations = value.get("relations")
    if not isinstance(claims, list) or not claims:
        errors.append("claims must be a non-empty array")
        claims = []
    if not isinstance(relations, list):
        errors.append("relations must be an array")
        relations = []

    ids: list[str] = []
    for i, claim in enumerate(claims):
        if not isinstance(claim, dict) or set(claim) != {"id", "text", "confidence"}:
            errors.append(f"claims[{i}] has wrong shape")
            continue
        claim_id = claim.get("id")
        if not isinstance(claim_id, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", claim_id):
            errors.append(f"claims[{i}].id is invalid")
        else:
            ids.append(claim_id)
        if not isinstance(claim.get("text"), str) or not claim["text"].strip():
            errors.append(f"claims[{i}].text is invalid")
        conf = claim.get("confidence")
        if isinstance(conf, bool) or not isinstance(conf, (int, float)) or not 0 <= conf <= 1:
            errors.append(f"claims[{i}].confidence is outside 0..1")
    if len(ids) != len(set(ids)):
        errors.append("claim ids are not unique")
    if "final-answer" not in ids:
        errors.append("final-answer claim is missing")
    id_set = set(ids)
    for i, relation in enumerate(relations):
        if not isinstance(relation, dict) or set(relation) != {"from", "type", "to"}:
            errors.append(f"relations[{i}] has wrong shape")
            continue
        if relation.get("type") not in {"supports", "opposes"}:
            errors.append(f"relations[{i}].type is invalid")
        if relation.get("from") not in id_set or relation.get("to") not in id_set:
            errors.append(f"relations[{i}] has unresolved endpoint")
    return errors


def generic_features(value: dict[str, Any]) -> dict[str, Any]:
    claims = value.get("claims", [])
    relations = value.get("relations", [])
    counts = Counter(r.get("type") for r in relations if isinstance(r, dict))
    polarity = counts["supports"] + counts["opposes"]
    final = next((c for c in claims if c.get("id") == "final-answer"), {})
    return {
        "node_ids": [str(c.get("id")) for c in claims if isinstance(c, dict)],
        "relations": [
            {"from": r.get("from"), "relation": r.get("type"), "to": r.get("to")}
            for r in relations
            if isinstance(r, dict)
        ],
        "relation_counts": dict(counts),
        "attack_share": counts["opposes"] / polarity if polarity else None,
        "has_attack": counts["opposes"] > 0,
        "final_answer_text": final.get("text"),
        "final_answer_confidence": final.get("confidence"),
        "confidences": [c.get("confidence") for c in claims if isinstance(c, dict)],
    }


def parse_thoughtml_text_features(text: str) -> dict[str, Any]:
    node_ids: list[str] = []
    relations: list[dict[str, str]] = []
    relation_counts: Counter[str] = Counter()
    bases = Counter(re.findall(r"\b(measured|estimated|assumed)\b", text))
    postures = Counter()

    header_re = re.compile(
        r"(?m)^(?:focus|claim|observation|hypothesis|option|decision|outcome|goal|assumption|memory|action|question)\s+([a-z0-9][a-z0-9-]*)\b"
    )
    node_ids.extend(header_re.findall(text))

    link_re = re.compile(
        r"(?m)^link\s+([a-z0-9][a-z0-9-]*)\s+(" + "|".join(map(re.escape, sorted(RELATIONS, key=len, reverse=True))) + r")\s+([a-z0-9][a-z0-9-]*)\b"
    )
    for source, relation, target in link_re.findall(text):
        relations.append({"from": source, "relation": relation, "to": target})
        relation_counts[relation] += 1

    bundle_re = re.compile(
        r"(?m)^(" + "|".join(map(re.escape, sorted(RELATIONS, key=len, reverse=True))) + r")\s+([a-z0-9][a-z0-9-]*)\s*\n((?:[ \t]+[a-z0-9][a-z0-9-]*\s*\n?)+)"
    )
    for relation, target, body in bundle_re.findall(text):
        for source in re.findall(r"(?m)^[ \t]+([a-z0-9][a-z0-9-]*)\s*$", body):
            relations.append({"from": source, "relation": relation, "to": target})
            relation_counts[relation] += 1

    posture_re = re.compile(
        r"(?m)^[a-z0-9][a-z0-9-]*\s+(" + "|".join(sorted(POSTURES)) + r")\s+[a-z0-9][a-z0-9-]*\b"
    )
    postures.update(posture_re.findall(text))

    final_body = None
    final_match = re.search(
        r"(?ms)^claim\s+final-answer\s*\n(?:[ \t]+(?:kind\s+claim\s*\n)?)?[ \t]+([^\n]+)",
        text,
    )
    if final_match:
        final_body = final_match.group(1).strip()
    final_confidence = None
    conf_match = re.search(
        r"(?ms)^model\s+holds\s+final-answer\s*\n(?:[ \t]+.*\n)*?[ \t]+confidence\s+([01](?:\.\d+)?)\b",
        text,
    )
    if conf_match:
        final_confidence = float(conf_match.group(1))

    numeric = re.compile(r"(?m)^[ \t]+(?:confidence|weight|probability|quantity)\s+([^\n]+)$")
    number_fields = numeric.findall(text)
    missing_basis = [
        v for v in number_fields if not re.search(r"\b(?:measured|estimated|assumed)\b", v)
    ]
    polarity = sum(relation_counts[r] for r in POLARITY_RELATIONS)
    attacks = relation_counts["opposes"] + relation_counts["undercuts"]
    return {
        "node_ids": node_ids,
        "relations": relations,
        "relation_counts": dict(relation_counts),
        "attack_share": attacks / polarity if polarity else None,
        "has_attack": attacks > 0,
        "basis_counts": dict(bases),
        "posture_counts": dict(postures),
        "number_field_count": len(number_fields),
        "number_fields_missing_basis": len(missing_basis),
        "final_answer_text": final_body,
        "final_answer_confidence": final_confidence,
    }


def canonical_thoughtml_features(model: dict[str, Any]) -> dict[str, Any]:
    objects = model.get("objects", []) if isinstance(model, dict) else []
    foci = [o for o in objects if isinstance(o, dict) and o.get("type") == "focus"]
    links = [o for o in objects if isinstance(o, dict) and o.get("type") == "link"]
    stances = [o for o in objects if isinstance(o, dict) and o.get("type") == "stance"]
    relation_counts = Counter(str(o.get("relation")) for o in links)
    polarity = sum(relation_counts[r] for r in POLARITY_RELATIONS)
    attacks = relation_counts["opposes"] + relation_counts["undercuts"]
    final_focus = next((o for o in foci if o.get("id") == "final-answer"), {})
    final_stance = next(
        (o for o in stances if o.get("agent") == "model" and o.get("target") == "final-answer"),
        {},
    )
    confidence = final_stance.get("confidence")
    if isinstance(confidence, dict):
        confidence = confidence.get("value")
    bases = Counter(str(o.get("basis")) for o in objects if o.get("basis"))
    confidences: list[float] = []
    for stance in stances:
        value = stance.get("confidence")
        if isinstance(value, dict) and isinstance(value.get("value"), (int, float)):
            confidences.append(float(value["value"]))
    return {
        "node_ids": [str(o.get("id")) for o in foci],
        "relations": [
            {"from": o.get("from"), "relation": o.get("relation"), "to": o.get("to")}
            for o in links
        ],
        "relation_counts": dict(relation_counts),
        "attack_share": attacks / polarity if polarity else None,
        "has_attack": attacks > 0,
        "basis_counts": dict(bases),
        "posture_counts": dict(Counter(str(o.get("posture")) for o in stances)),
        "confidences": confidences,
        "final_answer_text": final_focus.get("body"),
        "final_answer_confidence": confidence,
        "audit_conflicts": list((model.get("audit") or {}).get("conflicts", [])),
    }


def selected_option(final_answer_text: str | None) -> str | None:
    if not final_answer_text:
        return None
    match = re.fullmatch(r"The answer is ([A-D])\.", final_answer_text.strip())
    return match.group(1) if match else None


def contains_tool_event(jsonl_text: str) -> tuple[bool, list[str]]:
    hits: list[str] = []
    suspicious = {
        "command_execution",
        "mcp_tool_call",
        "web_search",
        "file_search",
        "computer_call",
        "tool_call",
        "function_call",
    }

    def walk(value: Any) -> Iterator[str]:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"type", "kind", "item_type"} and isinstance(child, str):
                    yield child
                yield from walk(child)
        elif isinstance(value, list):
            for child in value:
                yield from walk(child)

    for line_no, line in enumerate(jsonl_text.splitlines(), 1):
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        for value in walk(event):
            low = value.lower()
            if low in suspicious or any(token in low for token in ("tool_call", "command_execution")):
                hits.append(f"line {line_no}: {value}")
    return bool(hits), hits


def auroc(labels: Sequence[bool], scores: Sequence[float]) -> float | None:
    if len(labels) != len(scores) or not labels:
        return None
    positives = sum(labels)
    negatives = len(labels) - positives
    if positives == 0 or negatives == 0:
        return None
    wins = 0.0
    for i, (li, si) in enumerate(zip(labels, scores)):
        if not li:
            continue
        for lj, sj in zip(labels, scores):
            if lj:
                continue
            wins += 1.0 if si > sj else 0.5 if si == sj else 0.0
    return wins / (positives * negatives)


def mean(values: Iterable[float]) -> float | None:
    materialized = list(values)
    return sum(materialized) / len(materialized) if materialized else None


def jaccard(left: set[Any], right: set[Any]) -> float | None:
    union = left | right
    return len(left & right) / len(union) if union else None


def rule_s_overlap(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    a_ids = {normalized_id(x) for x in a.get("node_ids", [])}
    b_ids = {normalized_id(x) for x in b.get("node_ids", [])}
    matches = a_ids & b_ids

    def triples(doc: dict[str, Any]) -> set[tuple[str, str, str]]:
        out: set[tuple[str, str, str]] = set()
        for edge in doc.get("relations", []):
            source = normalized_id(str(edge.get("from", "")))
            target = normalized_id(str(edge.get("to", "")))
            relation = str(edge.get("relation", edge.get("type", "")))
            if source in matches and target in matches:
                out.add((source, relation, target))
        return out

    relation = None if not matches else jaccard(triples(a), triples(b))
    return {
        "matched_nodes": len(matches),
        "node_jaccard": jaccard(a_ids, b_ids),
        "relation_jaccard": relation,
        "relation_undefined": not matches,
    }


def bootstrap_ci(
    values: Sequence[float], *, seed: int, samples: int = 2000, alpha: float = 0.05
) -> tuple[float, float] | None:
    if not values:
        return None
    rng = random.Random(seed)
    n = len(values)
    estimates = sorted(sum(rng.choice(values) for _ in range(n)) / n for _ in range(samples))
    low_index = max(0, int((alpha / 2) * samples))
    high_index = min(samples - 1, int((1 - alpha / 2) * samples) - 1)
    return estimates[low_index], estimates[high_index]


def group_by(items: Iterable[dict[str, Any]], *keys: str) -> dict[tuple[Any, ...], list[dict[str, Any]]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        grouped[tuple(item.get(k) for k in keys)].append(item)
    return dict(grouped)
