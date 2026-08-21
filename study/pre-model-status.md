# Pre-model status

Updated 2026-08-21. No registered AI-model call has been made.

## Completed offline

- Replaced Experiment 0 with 30 held-out tasks: 6 easy, 12 medium, 12 hard.
- Kept domain and software-task shares within the registered 25% ceilings.
- Added deterministic reference solvers; all 30 answer keys must pass.
- Reworded all 12 Experiment 1 tasks with one neutral ending.
- Removed instructions that directly request counterevidence or counterarguments.
- Corrected run accounting to 60 discarded pilot calls plus 744 main calls.
- Changed prompt transport to stdin for Windows and documented audited tool-call
  exclusion.
- Kept collection blocked behind a non-collectable candidate manifest.
- Human review completed and approved unchanged on 2026-08-21.
- Kept 30 calibration tasks; H1b remains explicitly estimation-first.
- OSF is unavailable, so the pre-data state will be publicly committed and
  tagged on GitHub with that limitation disclosed.

## Required before any model call

1. Rerun every offline check after the final protocol edits.
2. Commit and publicly tag the exact pre-data state.
3. Create the authoritative versioned manifest.
4. Create the collectable cued-probe schedule.
5. Obtain a separate explicit instruction to execute the first call.

Rule J remains a hard Experiment 1 blocker and does not block the contamination
probe or Experiment 0.

## Pilot acceptance rule

The Experiment 0 Terra pilot is for protocol and difficulty validation, never
for selecting a favorable direction. For each F/B condition, the 30 tasks should
yield at least 15 correct and at least 6 incorrect answers. If a condition misses
that window, revise task difficulty, log the pre-main deviation, discard the
pilot, freeze again, and rerun the full pilot. Terra is still rerun in main.

## Remaining effort estimate

- Human review of 42 tasks: completed.
- Corrections plus repeat offline validation: in progress.
- Rule J design when resumed: about 3–5 hours plus manual-rater coordination.
- Model collection and grading after permission: several days because rate
  limits, retries, and the fixed 804-call plan dominate elapsed time.

The goal is informative and reproducible results, not results favorable to
ThoughtML. A null or negative result remains publishable if the benchmark avoids
ceiling effects and the protocol is followed.
