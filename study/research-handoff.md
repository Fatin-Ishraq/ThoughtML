# Research handoff contract

This file defines what the experiment operator hands to the paper author. It is
not a results narrative and must not be manually edited to manufacture a cleaner
story.

## Required archive

1. Pre-registration and every append-only deviation.
2. Frozen manifest, task files, prompts, schemas, model panel, grader, runner,
   mutation operators, Rule J artifacts, and analysis code.
3. Deterministic schedules and seeds.
4. Every raw prompt, JSONL event transcript, stderr stream, and final response,
   including retries, failures, exclusions, and unparseable outputs.
5. Mechanical extraction records and grades.
6. Manual Rule J validation labels from both raters, disagreement resolution,
   and κ calculations.
7. Generated analysis JSON, tables, figures, and command log.

## Run-level data dictionary

| Field | Meaning |
|---|---|
| `run_id` | Stable phase/task/arm/condition/sample/effort identifier. |
| `phase` | Probe, pilot, or registered experiment phase. |
| `task_id` | Frozen task identifier. |
| `arm`, `model` | Registered model arm and exact requested slug. |
| `condition` | F, B, ThoughtML, G, or probe. |
| `reasoning_effort` | Explicit per-call effort. |
| `prompt_sha256` | Hash of the exact UTF-8 bytes sent through stdin. |
| `attempts` | Complete retry history, never just the successful attempt. |
| `excluded` | Whether one of §8.3's exclusive rules applied. |
| `exclusion_reasons` | Mechanical reasons; quality is never a reason. |
| `extraction.path` | Full, single fence, longest fence, or unparseable. |
| `parseable` | Accepted by the relevant parser. |
| `strict_clean` | ThoughtML base validation has zero errors/warnings. |
| `lint_clean` | Base validation plus modeling lints is clean. |
| `strict_provenance_clean` | Every authored number states a basis. |
| `attack_share` | Per-document attack/polarity ratio; undefined at zero denominator. |
| `final_answer_confidence` | Confidence on the required final-answer node. |
| `correct` | Experiment 0 selected option matches the frozen key. |

## Writing constraints

- Lead with the registered primary outcomes, including null and adverse results.
- Report estimates and confidence intervals even when tests do not reject.
- Keep Experiment 1 model authoring and Experiment 2 checker detection separate.
- Never turn syntactic validity into a claim of true or faithful reasoning.
- Describe GPT results as dated observations and preserve the collection window.
- Report Rule S as a floor and Rule J only if its κ gate passes.
- State every undefined relation-overlap pair count.
- Do not pool the discarded mutation pilots or an Experiment 0 pilot whose role
  has not been resolved.
- Reproduce every number from the archive; transcribe none by hand.
