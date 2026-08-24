from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "luna_semantic_grader_v2", ROOT / "semantic_grader_v2.py"
)
assert SPEC and SPEC.loader
grader = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(grader)


class PosteriorNormalizationTests(unittest.TestCase):
    KEY = "initial.posterior"

    def test_labelled_and_unlabelled_vectors_compare_identically(self) -> None:
        labelled = grader.semantic_checkpoint_value(
            self.KEY, "[R1=2/9, R2=4/9, R3=1/3]"
        )
        unlabelled = grader.semantic_checkpoint_value(self.KEY, "[2/9,4/9,1/3]")
        self.assertEqual(labelled, unlabelled)

    def test_complete_labels_define_component_order(self) -> None:
        value = grader.semantic_checkpoint_value(
            self.KEY, "[R3=1/3,R1=2/9,R2=4/9]"
        )
        self.assertEqual(value, "[2/9,4/9,1/3]")

    def test_mixed_labelling_is_not_normalized(self) -> None:
        value = "[R1=2/9,4/9,R3=1/3]"
        self.assertEqual(grader.semantic_checkpoint_value(self.KEY, value), value)

    def test_duplicate_labels_are_not_normalized(self) -> None:
        value = "[R1=2/9,R1=4/9,R3=1/3]"
        self.assertEqual(grader.semantic_checkpoint_value(self.KEY, value), value)

    def test_unknown_labels_are_not_normalized(self) -> None:
        value = "[R1=2/9,R2=4/9,R4=1/3]"
        self.assertEqual(grader.semantic_checkpoint_value(self.KEY, value), value)

    def test_wrong_vector_length_is_not_normalized(self) -> None:
        value = "[R1=2/9,R2=4/9]"
        self.assertEqual(grader.semantic_checkpoint_value(self.KEY, value), value)

    def test_nonposterior_checkpoint_is_untouched(self) -> None:
        value = "[R1=Q,R2=R,R3=S]"
        self.assertEqual(
            grader.semantic_checkpoint_value("initial.admissible", value), value
        )


if __name__ == "__main__":
    unittest.main()
