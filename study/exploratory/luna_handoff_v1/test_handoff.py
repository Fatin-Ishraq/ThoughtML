from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("luna_handoff", ROOT / "handoff.py")
assert SPEC and SPEC.loader
handoff = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(handoff)


class ReferenceTests(unittest.TestCase):
    def test_independent_solver_matches_frozen_answers(self) -> None:
        stored = json.loads((ROOT / "answers.json").read_text(encoding="utf-8"))["checkpoints"]
        self.assertEqual(handoff.solve_reference(), stored)

    def test_complete_local_validation(self) -> None:
        self.assertEqual(handoff.validate(), [])

    def test_checkpoint_parser_rejects_duplicates(self) -> None:
        values, duplicates = handoff.extract_checkpoints(
            "CHECKPOINT initial.plan = R\nCHECKPOINT initial.plan = P\n"
        )
        self.assertEqual(values["initial.plan"], "R")
        self.assertEqual(duplicates, ["initial.plan"])


class PromptTests(unittest.TestCase):
    def test_stage_one_does_not_leak_future_facts_or_answers(self) -> None:
        prompt = handoff.prompt_for("markdown", 1, "")
        self.assertIn("1/4, 1/2, and 3/8", prompt)
        self.assertNotIn("Plans have", prompt)
        self.assertNotIn("[2/9,4/9,1/3]", prompt)

    def test_stage_three_contains_correction_but_not_future_signal(self) -> None:
        prompt = handoff.prompt_for("thoughtml", 3, "claim inherited\n  Prior ledger.")
        self.assertIn("Replace 1/4 with 3/4", prompt)
        self.assertNotIn("For plan P, P(Z=+", prompt)
        self.assertIn("revised.plan", prompt)

    def test_conditions_have_identical_task_facts(self) -> None:
        thoughtml = handoff.prompt_for("thoughtml", 5, "INHERITED")
        markdown = handoff.prompt_for("markdown", 5, "INHERITED")
        task = json.loads((ROOT / "task.json").read_text(encoding="utf-8"))
        for stage in task["stages"]:
            self.assertIn(stage["reveal"], thoughtml)
            self.assertIn(stage["reveal"], markdown)

    def test_thoughtml_prompt_is_not_more_than_twice_markdown(self) -> None:
        for stage in range(1, 6):
            thoughtml = handoff.prompt_for("thoughtml", stage, "INHERITED")
            markdown = handoff.prompt_for("markdown", stage, "INHERITED")
            self.assertLess(len(thoughtml.encode("utf-8")), 2 * len(markdown.encode("utf-8")))


class ScheduleAndSafetyTests(unittest.TestCase):
    def test_schedule_is_ten_dependency_ordered_luna_calls(self) -> None:
        schedule = handoff.build_schedule(None)
        self.assertEqual(schedule["count"], 10)
        self.assertFalse(schedule["collectable"])
        self.assertEqual([item["condition"] for item in schedule["items"][:5]], ["thoughtml"] * 5)
        self.assertEqual([item["condition"] for item in schedule["items"][5:]], ["markdown"] * 5)
        self.assertTrue(all(item["model"] == "gpt-5.6-luna" for item in schedule["items"]))
        for offset in (0, 5):
            self.assertIsNone(schedule["items"][offset]["prior_run_id"])
            for index in range(offset + 1, offset + 5):
                self.assertEqual(
                    schedule["items"][index]["prior_run_id"], schedule["items"][index - 1]["run_id"]
                )

    def test_calls_are_explicitly_authorized(self) -> None:
        protocol = json.loads((ROOT / "protocol.json").read_text(encoding="utf-8"))
        self.assertIs(protocol["model_calls_authorized"], True)
        self.assertEqual(protocol["authorization"]["instruction"], "call it")


if __name__ == "__main__":
    unittest.main()
