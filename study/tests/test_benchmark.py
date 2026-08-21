from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import studylib as lib  # noqa: E402
import mutations  # noqa: E402
import power  # noqa: E402
import verify_answers  # noqa: E402
import benchmark  # noqa: E402


class ArtifactTests(unittest.TestCase):
    def test_artifacts_have_no_mechanical_errors(self) -> None:
        errors = [m for m in lib.validate_artifacts() if m.level == "error"]
        self.assertEqual(errors, [])

    def test_registered_task_counts_and_split(self) -> None:
        calibration = lib.load_calibration()
        self.assertEqual(len(calibration), 30)
        self.assertEqual(
            {level: sum(t["difficulty"] == level for t in calibration) for level in ("easy", "medium", "hard")},
            {"easy": 6, "medium": 12, "hard": 12},
        )
        authoring = lib.load_authoring()
        self.assertEqual(len(authoring), 12)
        self.assertEqual(sum(t["tension"] for t in authoring), 9)
        self.assertEqual(sum(not t["tension"] for t in authoring), 3)

    def test_every_calibration_key_passes_reference_solver(self) -> None:
        report = verify_answers.verify()
        self.assertEqual(report["task_count"], 30)
        self.assertEqual(report["failed"], 0)

    def test_authoring_prompts_and_instructions_are_neutral(self) -> None:
        suffix = "Decide what should be done. Represent the reasoning and conclusion in the requested format."
        for task in lib.load_authoring():
            self.assertTrue(task["prompt"].endswith(suffix), task["id"])
        joined = "\n".join(
            (lib.PAYLOADS / name).read_text(encoding="utf-8").lower()
            for name in ("thoughtml-instruction.txt", "generic-instruction.txt")
        )
        self.assertNotIn("counterevidence", joined)
        self.assertNotIn("counterargument", joined)

    def test_task_text_stays_inside_registered_bounds(self) -> None:
        for task in lib.load_calibration() + lib.load_authoring():
            with self.subTest(task=task["id"]):
                self.assertGreaterEqual(lib.word_count(task["prompt"]), 80)
                self.assertLessEqual(lib.word_count(task["prompt"]), 200)

    def test_private_keys_never_enter_prompt(self) -> None:
        task = lib.load_calibration()[0]
        model = lib.load_models()[0]
        item = lib._run_item(
            phase="exp0-main",
            task=task,
            model=model,
            condition="F",
            sample=1,
            effort="high",
        )
        prompt = lib.prompt_for(item)
        self.assertNotIn(task["rationale"], prompt)
        self.assertNotIn('"answer"', prompt)

    def test_basis_condition_adds_only_registered_requirement(self) -> None:
        task = lib.load_calibration()[0]
        model = lib.load_models()[0]
        common = dict(phase="exp0-main", task=task, model=model, sample=1, effort="high")
        f_prompt = lib.prompt_for(lib._run_item(condition="F", **common))
        b_prompt = lib.prompt_for(lib._run_item(condition="B", **common))
        basis = (lib.PAYLOADS / "basis-required.txt").read_text(encoding="utf-8").rstrip()
        self.assertEqual(b_prompt.replace(f"\n\n{basis}", "", 1), f_prompt)

    def test_generic_control_does_not_receive_thoughtml_spec(self) -> None:
        task = lib.load_authoring()[0]
        model = lib.load_models()[0]
        item = lib._run_item(
            phase="exp1-generic", task=task, model=model, condition="G", sample=1, effort="high"
        )
        prompt = lib.prompt_for(item)
        self.assertNotIn("ThoughtML — a guide", prompt)
        self.assertIn("Generic schema", prompt)


class ScheduleTests(unittest.TestCase):
    def test_rule_j_blocks_only_experiment_1(self) -> None:
        self.assertEqual(benchmark.phase_protocol_issues("probe-cued"), [])
        self.assertEqual(benchmark.phase_protocol_issues("exp0-pilot"), [])
        self.assertTrue(benchmark.phase_protocol_issues("exp1-thoughtml"))
        self.assertTrue(benchmark.phase_protocol_issues("exp1-generic"))

    def test_every_phase_has_registered_count(self) -> None:
        for phase, count in lib.EXPECTED_PHASE_COUNTS.items():
            with self.subTest(phase=phase):
                schedule = lib.build_schedule(phase, 20260820)
                self.assertEqual(schedule["count"], count)
                self.assertEqual(len({x["run_id"] for x in schedule["items"]}), count)

    def test_schedule_is_deterministic(self) -> None:
        a = lib.build_schedule("exp1-thoughtml", 123)
        b = lib.build_schedule("exp1-thoughtml", 123)
        self.assertEqual([x["run_id"] for x in a["items"]], [x["run_id"] for x in b["items"]])

    def test_gpt_arms_precede_deepseek_arms(self) -> None:
        for phase in ("probe-cued", "probe-neutral", "exp0-main", "exp1-thoughtml", "exp1-generic"):
            schedule = lib.build_schedule(phase, 20260821)
            vendors = [item["vendor"] for item in schedule["items"]]
            self.assertEqual(vendors, sorted(vendors, key={"openai": 0, "deepseek": 1}.get))
            if "deepseek" in vendors:
                self.assertEqual(vendors[0], "openai")

    def test_thoughtml_prompt_exceeds_windows_argument_budget(self) -> None:
        schedule = lib.build_schedule("exp0-pilot", 1)
        self.assertGreater(schedule["items"][0]["prompt_bytes"], 32767)


class ExtractionAndGradeTests(unittest.TestCase):
    def test_extraction_rule(self) -> None:
        self.assertEqual(lib.extract_candidate("whole", True), ("whole", "full"))
        self.assertEqual(
            lib.extract_candidate("before\n```thml\nclaim x\n```\nafter", False),
            ("claim x\n", "single-fence"),
        )
        candidate, path = lib.extract_candidate("```thml\nx\n```\n```thml\nlonger\n```", False)
        self.assertEqual((candidate, path), ("longer\n", "longest-fence"))
        self.assertEqual(lib.extract_candidate("not fenced", False), (None, "unparseable"))

    def test_generic_schema_validation_and_features(self) -> None:
        value = {
            "claims": [
                {"id": "reason", "text": "A reason.", "confidence": 0.7},
                {"id": "risk", "text": "A risk.", "confidence": 0.6},
                {"id": "final-answer", "text": "Proceed cautiously.", "confidence": 0.65},
            ],
            "relations": [
                {"from": "reason", "type": "supports", "to": "final-answer"},
                {"from": "risk", "type": "opposes", "to": "final-answer"},
            ],
        }
        self.assertEqual(lib.validate_generic(value), [])
        features = lib.generic_features(value)
        self.assertEqual(features["attack_share"], 0.5)
        self.assertTrue(features["has_attack"])
        self.assertEqual(features["final_answer_confidence"], 0.65)

    def test_thoughtml_text_features(self) -> None:
        source = """claim final-answer
  The answer is C.

observation reason
  The calculation supports C.

observation concern
  A possible objection.

link reason supports final-answer
link concern opposes final-answer

model holds final-answer
  confidence 0.8 estimated
"""
        features = lib.parse_thoughtml_text_features(source)
        self.assertEqual(features["final_answer_text"], "The answer is C.")
        self.assertEqual(features["final_answer_confidence"], 0.8)
        self.assertEqual(features["attack_share"], 0.5)
        self.assertEqual(features["number_fields_missing_basis"], 0)
        self.assertEqual(lib.selected_option(features["final_answer_text"]), "C")

    def test_tool_event_audit(self) -> None:
        clean = json.dumps({"type": "message", "text": "done"})
        dirty = "\n".join(
            [clean, json.dumps({"type": "item.started", "item": {"type": "command_execution"}})]
        )
        self.assertFalse(lib.contains_tool_event(clean)[0])
        self.assertTrue(lib.contains_tool_event(dirty)[0])


class MetricTests(unittest.TestCase):
    def test_auroc(self) -> None:
        self.assertEqual(lib.auroc([True, False], [0.9, 0.1]), 1.0)
        self.assertEqual(lib.auroc([True, False], [0.5, 0.5]), 0.5)
        self.assertIsNone(lib.auroc([True, True], [0.9, 0.8]))

    def test_rule_s_undefined_when_no_nodes_match(self) -> None:
        a = {"node_ids": ["alpha"], "relations": []}
        b = {"node_ids": ["beta"], "relations": []}
        result = lib.rule_s_overlap(a, b)
        self.assertTrue(result["relation_undefined"])
        self.assertIsNone(result["relation_jaccard"])

    def test_fast_auroc_matches_core_metric(self) -> None:
        rows = [(True, 0.9), (False, 0.2), (True, 0.7), (False, 0.4)]
        self.assertEqual(
            power.fast_auroc(rows),
            lib.auroc([row[0] for row in rows], [row[1] for row in rows]),
        )


class MutationTests(unittest.TestCase):
    def test_operator_registry_covers_every_registered_class_and_restraint(self) -> None:
        classes = {mutation.mutation_class for mutation, _ in mutations.OPERATORS}
        self.assertEqual(
            classes,
            {"structural", "relational-semantic", "numeric", "enumeration", "identity", "restraint"},
        )
        names = [mutation.operator for mutation, _ in mutations.OPERATORS]
        self.assertEqual(len(names), len(set(names)))

    def test_registered_corpus_is_separate_from_development(self) -> None:
        registered = mutations.corpus_files(False, False)
        development = mutations.corpus_files(False, True)
        self.assertTrue(registered)
        self.assertTrue(development)
        self.assertTrue(set(registered).isdisjoint(development))


if __name__ == "__main__":
    unittest.main()
