# Calibration-task human review checklist

Complete this review before the contamination probe. The reviewer should not see
model outputs and should work from the frozen task file plus the deterministic
answer-verification report.

For every task, record pass/fail and a short note for:

1. Exactly one option is correct.
2. The keyed option and rationale agree.
3. All needed facts are present in the prompt.
4. Wording does not depend on current events or external retrieval.
5. Distractors are plausible but not defensible under a different reasonable
   interpretation.
6. The assigned difficulty is reasonable for the target model panel.
7. No formatting cue reveals the correct option.

Whole-corpus checks:

- 6 easy, 12 medium, and 12 hard tasks.
- At most 25% of tasks are from one domain.
- At most 25% are software-related.
- The pilot target is informative rather than favorable: each condition should
  produce at least 15 correct and at least 6 incorrect answers across 30 tasks.

Reviewer: Fatin Ishraq  Date: 2026-08-21

Decision: [x] approve unchanged  [ ] revise before freeze
