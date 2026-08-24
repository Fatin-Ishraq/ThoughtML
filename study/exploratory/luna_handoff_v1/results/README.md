# Luna handoff result

## Outcome

After the disclosed semantic correction, ThoughtML and Markdown both achieved:

- 100% mean new-checkpoint accuracy across five stages;
- every required checkpoint correct in the final ledger;
- five usable stages; and
- a valid final format.

The result classification is therefore **no accuracy advantage**. This single
exploratory task does not show that ThoughtML makes the model more accurate.

## What the representations preserved

The final ThoughtML ledger contained five explicit, machine-readable `revises`
links and kept the corrected main branch separate from the counterfactual. Its
base document was strict-valid, but `--lint --strict` was not clean because of
`TML501` modelling warnings. The final Markdown ledger also clearly separated
the branches and contained current and superseded sections.

The defensible qualitative distinction is structured, machine-checkable
revision history—not exclusive possession of revision or branch information.

## Token observation

| Condition | Input | Output | Total |
|---|---:|---:|---:|
| ThoughtML | 74,545 | 14,450 | 88,995 |
| Markdown | 67,088 | 4,328 | 71,416 |

Relative to Markdown, ThoughtML used 11.1% more input tokens, 233.9% more output
tokens, and 24.6% more total tokens. This is an observed cost in one fixed-order
example, not a general efficiency estimate.

## Why the v1 result was wrong

The frozen grader compared checkpoint strings after removing whitespace only.
The ThoughtML ledger represented a posterior as
`[R1=2/9,R2=4/9,R3=1/3]`; the answer key and Markdown ledger represented the
same vector as `[2/9,4/9,1/3]`. The v1 grader treated those as different and
reported 55.3% for ThoughtML versus 100% for Markdown.

Semantic grader v2 normalizes a posterior only when `R1`, `R2`, and `R3` each
label exactly one of three components. Mixed, duplicate, unknown, or incomplete
labels are not normalized. The rule applies identically to expected and observed
values in both conditions. Seven adversarial unit tests cover its acceptance
boundary.

The original report remains unchanged in `analysis-grader-v1.json`. The
corrected report is `analysis-semantic-v2.json`. This is explicitly a post-data
correction and not a preregistered scoring rule.

## Reproduce

From the repository root, restore the archived Luna files if `runs/` is absent,
then execute the versioned analysis:

```powershell
tar -xzf study/data/thoughtml-study-data-v1.tar.gz study/exploratory/luna_handoff_v1/runs
python study/exploratory/luna_handoff_v1/semantic_grader_v2.py
python -m unittest study/exploratory/luna_handoff_v1/test_semantic_grader_v2.py -v
```

The analysis verifies all 63 archived Luna inputs against the study-data index
before grading. It never calls a model and never modifies a raw response.

## Limits

- One task cannot establish a general accuracy or efficiency effect.
- ThoughtML ran before Markdown, so representation and temporal order are
  confounded.
- The post-data normalization is necessary and symmetric, but remains post-data.
- Explicit revision links improve machine readability; their human or agent
  utility requires a separate behavioural experiment.
