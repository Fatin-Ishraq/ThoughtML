# v2.6 hard-pilot human review

**Status:** approved unchanged by the project author before any v2.6 model call.

Review these files together:

- `study/tasks/calibration-pilot-v2.6.json`
- `study/pilot-answer-verification-v2.6.json`

The reviewer must not use model outputs. For each task, check that there is one
defensible answer, the rationale and deterministic solver agree, all facts are
self-contained, distractors are plausible but unambiguously wrong, and the task
is materially harder than the discarded v2.4 corpus.

| Task | Unique answer | Key/rationale | Self-contained | Distractors | Hard enough | Notes |
|---|---|---|---|---|---|---|
| pilot-cal-001 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-002 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-003 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-004 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-005 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-006 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-007 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-008 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-009 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |
| pilot-cal-010 | [x] | [x] | [x] | [x] | [x] | Approved unchanged |

Whole-set checks:

- [x] Exactly 10 pilot-only tasks; none appears in `calibration.json`.
- [x] No domain exceeds 25%; no more than 25% are software-related.
- [x] Correct options are reasonably balanced and not exposed by wording.
- [x] The 20-call gate is scientifically neutral: each condition must have
      5–8 correct and at least 2 incorrect among 10 included runs.
- [x] Failure means revise and run another discarded development round; it does
      not permit selecting favorable tasks for the main result.

Reviewer: Fatin Ishraq (project author)  Date: 2026-08-21

Decision: [x] approve unchanged  [ ] revise before authoritative freeze

Approval provenance: explicit user approval in the Codex study task, recorded
before authoritative freezing and before any v2.6 pilot model response.
