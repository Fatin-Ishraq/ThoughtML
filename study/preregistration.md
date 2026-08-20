# Pre-registration: Measuring AI-Authored Reasoning Traces Across Four Vendor Agent Systems

**Author:** Fatin Ishraq
**Pre-registration version:** 1.4
**Date filed:** 2026-08-20 (v1.0) · amended 2026-08-20 (v1.1, v1.2, v1.3, v1.4)
**Status:** Filed before any registered data collection. No registered experimental data exists. A discarded pilot of Experiment 2 has been run; see §13. v1.3 incorporates an external methodological review, and v1.4 restores Experiment 0's sample size for power — both before any registered data collection (§13, entries 8 and 10).

---

## 0. Frozen artifacts

Every number in this study is produced by the artifacts below. They do not change for the duration of data collection. If any must change, that is a protocol deviation and is recorded in §13.

| Artifact | Identifier |
|---|---|
| ThoughtML version | 0.5.0 |
| Pinned commit | `6b323bfaacab44ec0aef19dfa0abfdf98503959e` |
| Grader binary SHA-256 | `99e3afa2222a00f3eb82315e4dd251259b19ecc296769f0e35ce5ed9cd38f5b0` |
| Spec payload SHA-256 | `1a3fd8b8dccf079c2284b59bef6ac1ceb0a84fc7d95240023c7abb6333531e9f` |
| Spec payload size | 718 lines / 39,129 bytes / ~11k tokens |
| Prompt template SHA-256 | recorded in `runs/manifest.json` at first run |
| Control-schema payload SHA-256 (§6, Condition G) | recorded in `runs/manifest.json` before Experiment 1 begins |
| External registration | OSF DOI — recorded here upon filing. **This version (v1.4) is the one to register**, before any registered data collection begins. Versions 1.0–1.3 are self-dated in the public git history (`cdcf74f`, `b8b12e4`, `7951f05`, `fece65d`) and are superseded rather than separately registered; the deviation log below reconstructs the full sequence. |

**Line endings.** The payload is generated with LF line endings (`thoughtml guide --full`, written without CRLF translation). This is load-bearing: the same specification checked out on a platform that translates line endings produces a different SHA-256 for identical content, and §7.1 excludes any run whose payload hash does not match. Anyone reproducing this study must generate the payload with LF endings or the hash check will fail on unchanged content.

**Disclosure.** The spec payload is byte-identical to `crates/thoughtml/llms.txt`, the public specification served by the project website. The document handed to models in this study is the public document verbatim. This is a property of the tool's design — one source, so the printed guide cannot drift from the implementation — and it is why the contamination probe in §9 is mandatory rather than optional.

---

## 1. Summary

ThoughtML is a plain-text language for recording reasoning as a machine-checkable graph: typed claims, evidence relations, agent stances carrying confidence, and a checker that derives argument status and reports internal conflicts. It is designed to be authored by AI agents rather than by hand.

Whether AI agents can and do author such traces well has not been measured. This study is that measurement. It evaluates four first-party vendor agent systems on their ability to author ThoughtML documents, against a generic-schema control that separates properties of the models from properties of the schema, and it evaluates the checker's own detection ability independently of any model.

The study is designed so that its central results are informative regardless of direction. Predictions are stated numerically in §4 before any data exists.

---

## 2. Background and the gap

**The idea is not novel and this study does not claim it is.** Externalizing an argument into nodes and typed attack relations, then computing which claims survive, descends from Dung (1995) and appears in contemporary work on Argumentative LLMs (ArgLLMs, 2023–2026) with several implementations. Prior art is acknowledged throughout.

The gap this study addresses is different: **the author is aware of no standard file format or trace schema for agent reasoning, and of no benchmark measuring whether models can author one.** This is a scoped claim, based on the author's literature review of 2026-08-19; the paper's related-work section will cite the specific surveys, and a counterexample would narrow the contribution rather than void the measurements. ArgLLM work generally constructs argument structures through purpose-built pipelines. The author has found no measurement of what a frontier agent system produces when simply handed a schema and asked to record its reasoning in it.

A second gap concerns confidence. The 2026 literature reports that LLMs verbalize confidence in a narrow high band largely independent of accuracy. What has not been tested is whether **a schema that requires an explicit provenance label on every number** (`measured` / `estimated` / `assumed`) changes the confidence values assigned, or recovers any calibration signal. That manipulation is available in ThoughtML and is the study's most transferable question.

**Sober prior.** Dung-style argumentation is 31 years old with near-zero industry adoption. One commonly cited reason is that no human will hand-author reasoning graphs; rival explanations exist (no downstream consumer for the graphs, contested argumentation semantics) and the adoption question is not settled by this study. The bet motivating ThoughtML is that the hand-authoring constraint stopped binding around 2024, when agents became capable authors. This study tests the bet's first premise — that agents author these graphs *well* — and nothing further.

---

## 3. Research questions

- **RQ1.** Does requiring an explicit provenance basis change the confidence values models assign, relative to free-form authoring — and does it improve the calibration of those values?
- **RQ2.** Do models record attacks on their own reasoning in the trace when authoring under this schema, or only support for it — and is that a property of the schema or of the models?
- **RQ3.** Do independent systems given the same task converge on the same reasoning structure, or only on the same conclusion?
- **RQ4.** What classes of reasoning defect does the checker detect, and which does it provably miss?
- **RQ5.** Does the harness, holding the model fixed, change trace structure?

---

## 4. Hypotheses and predicted values

Predictions were generated before data collection and are recorded here to be scored. All intervals are the author's subjective 80% ranges. Being wrong is an acceptable and informative outcome.

### 4.1 Primary outcomes

Exactly four outcomes are primary. All others are exploratory and no inferential claims will be made from them. Familywise error across the four primaries is controlled with Holm–Bonferroni at α = 0.05; the tests are specified in §8.1.

**H1a (RQ1) — Requiring provenance shifts confidence.**
Mean stance confidence in Condition B (basis-required) will be lower than in Condition F (free-form), on the same tasks, paired within task.
*Predicted difference: 0.03–0.08. Null hypothesis: difference = 0.*

**H1b (RQ1) — Requiring provenance improves calibration.**
AUROC of stance confidence discriminating correct from incorrect answers will be higher in Condition B than in Condition F.
*Predicted difference: 0.02–0.08 (AUROC units). Null hypothesis: difference = 0.* This is the only measurement that can support a "recovers calibration signal" interpretation; H1a without H1b shows only that the label shifts the number.

**H2 (RQ2) — Models rarely attack their own reasoning.**
Attack share = (`opposes` + `undercuts`) / (`supports` + `opposes` + `undercuts`), computed **per document** over the three polarity-carrying relations only, then averaged (mean of per-document ratios). A document with zero polarity-carrying relations contributes no ratio; the count of such documents is reported.
*Predicted: < 0.10. Secondary binary form: fraction of documents containing at least one attack edge, predicted 0.20–0.45.*

**H3 (RQ3) — Structural agreement is low.**
Cross-system relation overlap on identical tasks, as Jaccard over matched (source, relation, target) triples under the matching rule fixed in §7.3.
*Predicted: 0.15–0.30 for relations; 0.30–0.50 for nodes alone.*

**Secondary (not in the Holm family):**
- **H1-lex** — within Condition B, mean confidence attached to numbers labelled `assumed` is lower than those labelled `measured`. Predicted difference: 0.05–0.10. The label and the confidence come from the same forward pass, so a gap here demonstrates lexical consistency, not recovered calibration; it is retained because it was v1.0's H1 and remains scoreable.

**Decision rules, fixed in advance.** The predicted intervals score *prediction accuracy*; they are not confirmation criteria. Confirmation is defined as: **H1a / H1b** — the Holm-adjusted test rejects the null AND the point estimate is positive. **H2** — "attacks rare" is confirmed iff the 95% CI upper bound on attack share is < 0.15. **H3** — "agreement low" is confirmed iff the 95% CI upper bound on relation Jaccard under Rule J is < 0.35. A point estimate of, e.g., 0.14 for H2 therefore has a pre-assigned meaning regardless of which side of the predicted interval it falls on.

### 4.2 Exploratory predictions

Reported descriptively, without significance claims.

| Measure | Predicted |
|---|---|
| Parse rate (document accepted by `thoughtml check`) | 0.85–0.98 |
| `check --strict` clean | 0.40–0.70 |
| `check --lint` clean | 0.20–0.50 |
| `supports` share of polarity-carrying relations | 0.70–0.85 |
| Documents containing a `revises` edge or superseded belief | 0.05–0.15 |
| Stances carrying any basis label, free-form condition | 0.10–0.40 |
| Confidence values in [0.80, 1.00] | 0.70–0.85 |
| Confidence values ≤ 0.34 | < 0.05 |
| AUROC of confidence discriminating correct from incorrect (Condition F) | 0.55–0.65 |
| Mutation catch rate, structural defects | 0.95–1.00 |
| Mutation catch rate, semantic defects | 0.15–0.35 |
| ~~Sessions spontaneously re-reading a `.thml` (Exp 3, arm b)~~ | ~~< 0.20~~ *(experiment removed in v1.2; prediction retained as part of the blind record, untested)* |
| Harness effect on attack share | 0–10 pp |
| Harness effect on `--strict` pass rate | 0–40 pp |

The two harness-effect rows are stated as intervals including zero; v1.0 phrased them as "optimistic ceilings," which was an unfalsifiable bound. They are scored as interval predictions like every other row.

### 4.2b Per-class mutation predictions — NOT BLIND (added in v1.1)

v1.0 predicted mutation catch rates for "structural" and "semantic" defects, but §6 defines *five* classes and did not say which of the other four counted as semantic. It matters: the pilot returned 1.00 for `identity`, far outside the 0.15–0.35 semantic band, so the pooling rule changes the answer. The ambiguity is resolved here with per-class predictions.

**These predictions are not blind.** They were written after seeing pilot data (§13, entry 1) and are therefore weaker evidence than §4.2. **The v1.0 structural/semantic mutation predictions are retired as unscoreable** — the pooled rate they implicitly targeted will not be reported (see below), and the class boundary they assumed was never defined. This table is the operative record for Experiment 2 and is marked non-blind.

| Class | Predicted (registered run) |
|---|---|
| structural | 0.90–1.00 |
| relational-semantic | 0.10–0.25 |
| — of which link-direction reversal specifically | 0.00–0.10 |
| numeric, default flags | 0.05–0.20 |
| numeric, under `--strict-provenance` | 0.60–0.85 |
| enumeration | 0.70–1.00 |
| identity | 0.80–1.00 |
| restraint false-positive rate | 0.00–0.05 |

The pooled all-defect rate is **not** predicted and will not be reported: with an unequal number of mutants per operator it is an artifact of generation counts rather than a property of the checker.

### 4.3 Outcomes that would surprise the author

Recorded now so that a bolder claim, if warranted, is not a post-hoc reconstruction — and so that a failure has a pre-registered shape rather than a negotiated one.

**Upside surprises:** Confidence AUROC > 0.75 in either condition. Attack share > 0.20. Relation overlap > 0.60 under Rule J. Any of these would motivate a pre-registered follow-up and a framing change; per §8.2, none would be reported as a confirmed finding of this study.

**Downside surprises:** Parse rate < 0.70. Restraint false-positive rate > 0.10. Attack share in the generic-schema control *higher* than under ThoughtML (the schema suppresses self-critique).

---

## 5. Units of analysis and design

### 5.1 The unit is a deployed agent system, not a model

The four arms are **first-party vendor agent systems**, each running that vendor's own flagship model in default configuration. The inclusion criterion is first-party flagship agent systems; within that criterion, the four arms are also the systems accessible to the author on consumer plans. Both facts are stated: it is a principled criterion *and* a convenience sample within it.

| Arm | System | Vendor |
|---|---|---|
| A | Claude Code | Anthropic |
| B | Codex | OpenAI |
| C | Antigravity | Google |
| D | DeepSeek agent harness | DeepSeek |

Access is via consumer subscription plans, not API plans, for arms A–C. Arm D is available both through the vendor harness and through the raw API.

**Model and harness are therefore confounded in the primary comparison, by design and by constraint.** This study does not claim to isolate model capability. The unit of analysis is the system as deployed, which is also the unit end users actually encounter.

### 5.2 Partial decomposition

Two slices recover part of the lost inference without claiming an isolation that was not achieved:

1. **Model fixed, harness varies — funded.** Arm D only, run through both the vendor harness and the bare API (allocation in §6). This is the *only* cell in the design capable of separating harness effect from model effect, and it is the reason arm D is load-bearing rather than a token open-weights entry.
2. **The diagonal.** All four systems as shipped. The ecologically valid comparison and the headline table.

A third slice — harness fixed, model varies within each arm — was described in v1.0–v1.2 but carries no funded runs after the v1.2 scope reduction. It moves to future work rather than remaining as an unfunded promise.

### 5.3 Reproducibility asymmetry

Arm D is the only arm with open weights. Arms A–C are silently updated and eventually retired. In the terms defined in §12.2: arm D and Experiment 2 are *reproducible from artifacts*; arms A–C are reported as dated observations within a stated collection window — neither reproducible nor guaranteed replicable after vendor retirement. Where the analysis permits, results are anchored to arm D.

---

## 6. Experiments

**Scope, fixed before any registered data collection.** The study was reduced from the v1.0 design primarily **for cost**: this is a solo study on consumer subscription plans, and Experiment 3 was the most expensive in wall-clock (≈30 multi-session agentic runs) and the least powered. A secondary consideration: §11 already stated that this study does not establish that recorded reasoning improves task outcomes, so the cut removes a claim the paper was not going to make. Experiment 3 moves to future work. v1.3 then adds two funded elements from external review: a generic-schema control condition and the RQ5 delivery-mode contrast.

| Experiment | v1.0 | v1.3 |
|---|---|---|
| Exp 0 | 30 tasks × 2 conditions × 4 systems = 240 | 30 × 2 × 4 = **240** (restored in v1.4 for power) |
| Exp 1, ThoughtML condition | 20 tasks × 4 systems × 3 samples = 240 | 12 × 4 × 2 = **96** |
| Exp 1, Condition G (generic-schema control) | — | 12 × 4 × 1 = **48** |
| RQ5: arm-D delivery contrast | — | 12 × 2 × 1 = **24** |
| Exp 2 | offline, no model calls | unchanged |
| Exp 3 | ≈30 sessions | **removed** |
| Contamination probe (§9.2) | 5 × 4 = 20 | 10 × 4 = **40** |
| Registered model calls (probe excluded) | ~480 | **~408** |
| Tasks to author | 53 | **42** |

The cost is width: H1's confidence intervals widen, and H3 rests on 12 tasks. All four systems are retained, since the four-vendor comparison is the study's distinguishing feature and cutting an arm would cost more than cutting tasks.

**Minimum detectable effects (approximate, analytic, pre-data).** Simulation-based power calculations will be included in the analysis code before main collection (§8.5); these analytic approximations are recorded now so the scope decision is made with eyes open. At the Holm-worst adjusted α (0.05/4) and 80% power:

| Primary | Approximate MDE at v1.3 n | Against the prediction |
|---|---|---|
| H1a (30 paired tasks, Wilcoxon) | standardized d_z ≈ 0.61 → ≈ 0.05–0.07 raw if the between-task SD of the B−F contrast is 0.08–0.12 | Overlaps the upper part of the predicted 0.03–0.08. **H1a remains underpowered for effects below ≈0.05** and will be reported as an estimate with CI, not a rejection, in that region. |
| H1b (AUROC contrast, ~30 correct/incorrect splits per condition) | ≈ 0.12–0.16 AUROC units | Still exceeds the predicted 0.02–0.08: **H1b remains estimation-first even at 30 tasks.** A confirmed rejection would itself be an upside surprise. This is stated plainly rather than resolved, because resolving it would cost more runs than the study has. |
| H2 (12 task clusters, ~144 documents) | CI half-width ≈ 0.05–0.08 on the share | Can reject H0 ≥ 0.15 if the true share is ≤ ~0.07; adequate for the predicted < 0.10. |
| H3 (12 tasks × 6 system-pairs) | bootstrap CI half-width ≈ 0.06–0.10 | Adequate to separate the predicted 0.15–0.30 from the 0.35 decision bound in most of the range. |

### Experiment 0 — Confidence calibration and the basis manipulation

**Purpose:** RQ1. Tests H1a, H1b; H1-lex secondary.

**Design:** 30 tasks with unambiguous ground-truth answers × 2 prompt conditions × 4 systems. (v1.2 cut this to 20; v1.4 restored it — see the MDE table above and §13 entry 10.)

- **Condition F (free-form):** the standard prompt template.
- **Condition B (basis-required):** identical, plus one added instruction requiring a `measured` / `estimated` / `assumed` label on every number.

Condition B exists because the basis field is opt-in in ThoughtML (`TML401` fires only under `--strict-provenance`), so a free-form-only design risks having too few labelled numbers to test the basis hypotheses at all. Condition B guarantees the manipulation is present; condition F measures the spontaneous rate.

**Pilot:** arm D only, 30 × 2 = 60 runs. Extension to arms A–C is contingent on the pilot completing without protocol failure, **not** on the direction of results.

**Measures:** stance confidence by condition and by basis label; accuracy against ground truth; AUROC of confidence discriminating correct from incorrect, per condition; distribution of confidence values.

### Experiment 1 — The authoring benchmark, with a schema control

**Purpose:** RQ2, RQ3, RQ5. Tests H2 and H3, and attributes them.

**Design:** 12 reasoning tasks × 4 systems × 2 samples under the ThoughtML condition (96 runs), plus:

- **Condition G (generic-schema control), 12 × 4 × 1 = 48 runs.** The same tasks and systems, but the payload is a deliberately minimal generic schema instead of the ThoughtML spec: a bare JSON structure with `claims[]` (id, text, confidence), `relations[]` (from, type ∈ {supports, opposes}, to). Its exact text is frozen and hashed in the manifest before Experiment 1 begins. Condition G is what allows H2 and H3 results to be read as "property of models under any schema" versus "property of ThoughtML": attack share and cross-system overlap are computed identically on the control output. It also serves as the benchmark baseline for §14.
- **RQ5 delivery contrast, arm D only, 12 × 2 × 1 = 24 runs.** The same 12 tasks under the ThoughtML condition, delivered once through the vendor harness and once through the raw API, one sample each. This funds RQ5 with an explicit allocation rather than leaving it a promise.

**Task composition:** the 12 tasks comprise **9 with genuine tension and 3 deliberate no-tension manipulation checks** (§7.2). The manipulation check is directional only at 3 vs. 9 tasks and is reported as such. H3 is computed over all 12 tasks.

**Single-shot, no tool access.** If a system can run `thoughtml check` and repair its own output, the measurement becomes one of tool-loop competence rather than authoring competence. Tool access is a separate, later question. Absence of tool calls is verified per run from the transcript, not assumed from a flag.

**Measures:** parse rate; `check` / `--strict` / `--lint` pass rates; diagnostic code frequencies (TML101–TML502); relation type distribution; attack share (both conditions); posture distribution; presence of `revises` edges; conflict kinds reported by `--audit` (`confidence-vs-status`, `definition-divergence`); cross-system node and relation overlap (both conditions).

### Experiment 2 — Mutation testing of the checker

**Purpose:** RQ4. Requires zero model calls; fully offline and deterministic.

Extends `crates/thoughtml/tests/falsification.rs`, which already separates **detection** (does a known defect fire), **restraint** (does a sound document stay quiet), and **blind spots** (which real errors are asserted as misses on purpose).

**Corpus — fixed in v1.3.** The registered run executes on a **fresh clean corpus authored after the v1.1 threshold change and disjoint from `examples/`**. Disclosure: the `TML501` enumeration threshold was tuned on `examples/` (deviation 2), so an enumeration catch rate measured on `examples/` would be train-test leakage and is not admissible. The `examples/` corpus may be reported as a secondary, explicitly-contaminated comparison, never as the headline figure.

**Design:** programmatically mutate the corpus; measure catch rate, precision, and recall per mutation class.

| Mutation class | Example |
|---|---|
| Structural | dangling id reference, broken inheritance chain, malformed link |
| Relational-semantic | flip `supports` → `undercuts`; swap link source and target |
| Numeric | invert a confidence; strip a basis label; move `weight` onto a `leads-to` |
| Enumeration | replace `part-of` with `supports` (the documented confidence-inflation error) |
| Identity | split one node across two ids; merge two distinct claims under one id |

**Restraint control:** an equal number of *semantics-preserving* mutations (whitespace, node ordering, consistently applied id renaming). The restraint false-positive rate is reported per operator, against the §4.2b predicted rate of 0.00–0.05. (v1.0 said these "must produce no new diagnostics," which contradicted predicting a nonzero rate; the prediction stands and the absolute requirement is withdrawn.) A catch rate without a false-positive rate is not interpretable.

This experiment tests the **tool**. Experiment 1 tests the **model**. They are reported separately and are never combined into a single quality figure.

### Experiment 3 — REMOVED in v1.2; recorded for the deviation log

The cold-session utility test (whether a recorded trace changes downstream behaviour across a hard context break, in three arms: no trace / trace on disk / trace plus a minimal MCP `recall` tool) was removed for cost in v1.2 and moves to future work. Its design is preserved in the v1.0–v1.1 git history (`cdcf74f`). No downstream-utility claim is made anywhere in this study (§11), and the §4.2 prediction associated with it is retained in the blind record but untested.

---

## 7. Materials and operational definitions

### 7.1 Prompt payload

A single frozen template, hash recorded in §0, identical across all systems and all runs within an experiment. Assembled as: instruction block + full spec payload + one task (Condition G substitutes the control-schema payload). The payload hash is logged per run and verified at analysis time; any run whose logged hash differs from the frozen hash is excluded under §8.3.

### 7.2 Task construction rules

Fixed before authoring the task sets.

1. **Held out.** No task may derive from, paraphrase, or structurally resemble any document in `examples/`, the documentation, or the spec's worked examples.
2. **Genuine tension** (Exp 1, 9 of 12 tasks). Every tension task must admit at least two positions a competent reasoner could defend. This is a precondition for H2 to be interpretable: if tasks have obvious answers, a low attack share measures the task set, not the model.
3. **Domain spread.** No more than 25% of tasks from any single domain, and no more than 25% software-related.
4. **Ground truth** (Exp 0 only). A single defensible answer verifiable independently of the model's reasoning.
5. **Length bounded.** 80–200 words, to hold prompt length roughly constant.

**Manipulation check for H2.** Three of Experiment 1's 12 tasks are deliberately constructed *without* genuine tension (obvious answers). If attack share is equally low on tension and no-tension tasks, task design is not driving H2 and the low rate is a property of the systems. If attack share is measurably higher on tension tasks, systems are responsive to task structure and the overall rate is meaningful. At 3 vs. 9 tasks this check is directional only, and is reported as such, whichever way it resolves.

### 7.3 Cross-document node matching — fixed before data

**Rule S is a floor, not a co-equal rule (revised in v1.2).** A pre-data check compared a document against a structurally identical copy with every node renamed — same six links, same graph. Rule S scored **0.00** node overlap, and relation overlap was undefined because no nodes matched. Rule S therefore measures naming convention, not structure, and would have driven H3 to ~0 for every pair regardless of whether the models actually agreed. Reported alone it would have produced the false finding that "the schema underdetermines the trace." It is retained only as a lower bound.

- **Rule S (floor).** Two nodes match iff their normalized ids are equal. Normalization: lowercase, strip punctuation, collapse separators to a single hyphen. Reported as a lower bound on agreement, never as the headline figure.
- **Rule J (judge) — primary.** A model reads both documents and labels node correspondences. Fixed before data: the judge is the DeepSeek API at temperature 0, **run three times per document pair with majority labels used and self-agreement reported**. Temperature 0 on a served mixture-of-experts API is approximately deterministic, not exactly so — hence the triplicate. What the open weights do guarantee is *local reproducibility*: anyone can re-run the judging step against the pinned weights. The judge sees both documents in full; it is not asked whether the reasoning is *good*, only whether two nodes denote the same claim.
- **Undefined case.** If zero nodes match under a rule, relation overlap is undefined and is reported as such — never as 0.00. The count of undefined pairs is reported per rule.
- **Adjudication and validation.** On a random subsample of 20 document pairs, node correspondence is manually labelled **blind to the automatic results** by two raters: the author, and one external rater (to be recruited; the collaborating researcher is the intended candidate). Cohen's κ is reported for author-vs-external, author-vs-Rule-J, and external-vs-Rule-J. **Rule J is admissible as the primary matcher only if its κ against the manual labels exceeds 0.70** — the "substantial agreement" floor of Landis & Koch (1977); below that, H3 is reported as inconclusive rather than rescued with a different rule. If no external rater can be recruited, the single-rater limitation is reported and κ author-vs-Rule-J stands alone, explicitly flagged as weaker.

**Disclosed circularity.** The judge is a language model evaluating whether language-model-authored traces agree, and it is also arm D of the study. Shared failure modes could inflate measured agreement. The κ validation above is the check on this and is reported whatever it shows.

### 7.4 Output extraction rule — fixed before data

The prompt requests the document with no commentary. Where a response deviates, extraction proceeds in this fixed order, applied mechanically and never case-by-case:

1. If the response parses as ThoughtML in full (Condition G: as JSON), use it whole.
2. Otherwise, if exactly one fenced code block is present, use its contents.
3. Otherwise, if more than one fenced block is present, use the longest.
4. Otherwise, record the run as **unparseable**. Unparseable is a **result**, not an exclusion.

The extraction path taken is logged per run and its distribution is reported.

---

## 8. Analysis plan

### 8.1 Primary tests

Every hypothesis names its clustering unit; observations within a cluster are never treated as independent.

| Hypothesis | Test | Clustering unit | Effect size |
|---|---|---|---|
| H1a | Wilcoxon signed-rank on the B−F contrast, one value per (task × system) aggregated to task level before testing | task | median difference, bootstrap 95% CI |
| H1b | Paired comparison of per-condition AUROC, cluster bootstrap over tasks | task | ΔAUROC with bootstrap 95% CI |
| H2 | One-sided test of H0: attack share ≥ 0.15, via cluster bootstrap resampling **tasks** (never documents) | task | proportion with CI |
| H3 | **Permutation null**: relation Jaccard for same-task cross-system pairs vs. cross-task pairs; H0 is that same-task overlap equals cross-task overlap. Computed under Rule S and Rule J separately | task | Jaccard with CI, per rule |

These four tests produce p-values against explicit nulls; Holm–Bonferroni applies across them at familywise α = 0.05. Non-parametric throughout — pass-rate and proportion data at this sample size will not be assumed normal. For H3, the 6 pairwise system comparisons per task share documents; per-pair CIs come from the task-level bootstrap.

### 8.2 Exploratory analyses

All measures in §4.2 are reported descriptively with confidence intervals and **without** significance claims. Any pattern discovered in exploratory analysis may motivate a future pre-registered study; it will not be reported as a finding of this one.

### 8.3 Exclusion rules — fixed before data

A run is excluded if and only if:

1. The system returned an error or an empty response;
2. Transcript audit reveals injected context beyond the frozen payload (project memory, `CLAUDE.md`, skills, custom instructions, retrieved documents);
3. Tool calls occurred in a condition specifying no tool access;
4. The logged payload hash does not match the frozen hash.

Every exclusion is logged with its reason, and total exclusions are reported per arm.

A run is **never** excluded for producing unparseable, low-quality, short, or unexpected output. Such runs are data.

### 8.4 Stopping and sequencing

Sample sizes are fixed in advance per experiment. There is no interim peeking followed by extension.

Sequence: contamination probe → pilot (arm D, Exp 0) → **protocol revision window** → frozen protocol → main collection. The pilot exists to break the protocol; its data is **not pooled with the main run, and it informed the protocol revisions logged in §13** — the revisions are the pilot's purpose, not a contamination of it. Any protocol change after the main run begins is a deviation under §13.

Run order is randomized across systems, so a mid-study vendor model update is unlikely to align with any single arm's block, and randomization converts drift into noise in expectation rather than bias.

### 8.5 Reproduction requirement

Every figure and number in the resulting paper regenerates from the raw logs by a single command. No number is transcribed by hand at any point. Simulation-based power calculations for the four primaries are included in the analysis code and run before main collection; the §6 MDE table records the pre-data analytic approximations they replace.

---

## 9. Contamination controls and probe

### 9.1 Environment hygiene

Every run executes in a fresh scratch directory outside the project repository, with project memory, `CLAUDE.md`, skills, and custom settings disabled. Configuration flags are **not trusted**; each run's transcript is audited for injected context, and failure of that audit triggers exclusion under §8.3(2).

This control exists because the author's own environment contains project memory files summarizing ThoughtML's design and philosophy. Their presence in one arm and not others would produce asymmetric contamination biasing directly toward the study's hypotheses.

### 9.2 Zero-shot probe

Before any public documentation is updated, each system is asked to author a ThoughtML document **with no specification supplied**, across **10 prompts per system**. Scored for: any output; parseable output; use of correct relation names; use of the twelve postures.

**Decision rule, fixed in advance:** if a system produces parseable ThoughtML using at least one correct core relation name in **≥ 2 of 10** zero-shot prompts, that arm is flagged as contaminated and its results are reported separately from the headline table rather than pooled. At n=10 the probe detects only gross exposure; it cannot rule out subtler differential familiarity, and §12.4 says so.

This measures prior exposure through training data. Given that the study payload is the public specification verbatim (§0), memorization is a live threat and is measured rather than assumed absent. The probe is reported whatever it shows.

---

## 10. What each result would mean

Stated in advance so that interpretation is not authored after seeing direction. Interpretations are scoped to *agent systems authoring under this schema and prompt*; Condition G is what licenses any wider reading.

| Result | Interpretation |
|---|---|
| H1a confirmed, H1b confirmed | Schema-level provenance requirements shift verbalized confidence **and** recover calibration signal that prompting alone does not. Transferable beyond ThoughtML; the study's strongest positive claim. |
| H1a confirmed, H1b null | Provenance labels shift the numbers without improving their meaning — a compliance effect, not a calibration effect. No calibration claim is made. |
| H1a null | Verbalized confidence is insensitive even to explicit provenance labelling. Confidence should be demoted to optional metadata and the structural checks led instead. A clean, publishable negative. |
| H2 confirmed, control similar | Agents did not record self-attacks under either schema — consistent with, but not sufficient for, the claim that self-audit is insufficient; supports external critique and multi-agent review as the mechanism. |
| H2 confirmed, control higher | The ThoughtML schema *suppresses* recorded self-critique relative to a minimal schema — a finding against the format, reported as such. |
| H2 refuted (attacks common) | Agents record self-critique more than assumed under this schema and prompt. Weakens the multi-agent argument; strengthens single-agent trace utility. |
| H3 low overlap, control similar | Trace divergence is a property of model reasoning, not of ThoughtML's vocabulary. The standardization concern generalizes. |
| H3 low overlap, control higher | ThoughtML's larger vocabulary underdetermines the trace relative to a minimal schema: same reasoning, different graphs. A genuine problem for standardization claims, reported as such rather than minimized. |
| H3 high overlap | The schema constrains authors toward convergent structure — meaningful evidence for its viability as a standard. |
| Exp 2 low semantic catch | The checker validates form, not truth. Already asserted in `falsification.rs`; the experiment quantifies it. |
| **Failure condition** | **If parse rate < 0.85 AND relation overlap < 0.15 under Rule J AND AUROC ≤ 0.55 in both conditions: the schema neither constrains structure nor recovers signal, and the format claim fails as authored. This combination is stated in advance as the result that counts against the project, and it would be reported under that name.** |

**The author's own expectation, recorded in advance:** the most likely overall picture is that models author syntactically valid but structurally shallow traces dominated by `supports`, that confidence carries little signal, that independent systems disagree on structure, and that the generic-schema control behaves similarly on all three. That is a critical result about the state of AI-authored reasoning traces. It is the expected outcome, it is publishable, and it does not constitute a failure of the study.

---

## 11. What this study does not claim

- It does not claim the idea of externalized argument graphs is novel.
- It does not claim ThoughtML is superior to any alternative. The generic-schema control exists for *attribution* (is a result a property of models or of the schema?), not as a competitive evaluation against another format.
- It does not measure whether anyone wants such a format. Correctness is self-testable; desirability is not, and no experiment here addresses it.
- It does not isolate model capability from harness scaffolding, except in the single funded arm-D cell described in §5.2.
- It makes no downstream-utility claim. Experiment 3, which would have provided directional evidence, was removed in v1.2; the question moves to future work in full.

---

## 12. Threats to validity

1. **Model/harness confounding.** Accepted by design and constraint; partially decomposed in the funded §5.2 cell; never claimed away.
2. **No temperature or seed control (arms A–C).** Consumer subscription access. Terms used precisely: *reproducible* = same artifacts, same results — this holds only for arm D (open weights, API determinism approximated per §7.3) and Experiment 2 (offline). *Replicable* = new data, same finding — plausible but not guaranteed for arms A–C, and impossible after vendor retirement. Arms A–C are therefore reported as dated observations with collection window and any available version strings recorded per run.
3. **Vendor model drift mid-study.** Mitigated by randomized run order and a short collection window; cannot be eliminated.
4. **Contamination.** The payload is the public specification verbatim. Measured in §9.2 with a pre-registered decision rule; the probe detects gross exposure only.
5. **Grader authored by the study author.** Experiment 2 tests the grader **against author-designed defects; it bounds but does not eliminate author-grader circularity.** Mitigations: `falsification.rs` asserts known blind spots deliberately; restraint is reported alongside detection; and, contingent on recruiting the §7.3 external rater, that rater contributes 5–10 adversarial mutants authored blind to the checker's implementation. Not eliminated.
6. **Task design could induce or suppress the H2 result.** Mitigated by the construction rules in §7.2 and the manipulation check, which is directional only at 3 vs. 9 tasks.
7. **Rater dependence.** The κ validation in §7.3 rests on two raters at best, one of whom is the author. A failed recruitment leaves a single-rater design, which is reported as such.
8. **Possibly reduced Antigravity arm.** If that system exposes no scriptable interface, its arm carries fewer tasks with more samples each. Reported explicitly rather than run thin and presented as equivalent.
9. **Prompt sensitivity.** One template per condition. The degree to which results depend on the specific wording is unmeasured; RQ2's phrasing and §10's interpretations are scoped to "under this schema and prompt" for exactly this reason. A template ablation is future work.
10. **Author interest in the outcome.** The author designed ThoughtML and has a direct stake in a favourable result. This pre-registration, the advance predictions in §4, the decision rules in §4.1, the fixed matching rule in §7.3, the fixed exclusion rules in §8.3, the failure condition in §10, and the deviation log in §13 exist specifically to constrain that interest. They are stated here so a reader can check whether they were honoured.

---

## 13. Deviation log

Append-only. Every departure from this document after filing is recorded here with its date, its reason, and whether it occurred before or after the relevant data was seen. Entries are never edited or removed; corrections to an earlier entry are made by appending a new one.

| # | Date | Section | Deviation | Reason | Data already seen? |
|---|---|---|---|---|---|
| 1 | 2026-08-20 | §6 Exp 2 | Ran a discarded pilot of the mutation suite on the 9 clean `examples/` documents (151 mutants). | To break the harness before it counted. Three harness bugs were found and fixed; three mutation classes had silently produced zero mutants. Pilot data not pooled per §8.4. | Pilot only. No registered data. |
| 2 | 2026-08-20 | §0 | Re-pinned commit, binary SHA, and payload SHA. | The pilot showed `TML501` fires at ≥4 `supports`, missing 3-item enumerations — the error §6 of the spec calls "the mistake that breaks the mirror." A threshold sweep (4/3/2) gave 1/2, 2/2, 2/2 catches against 0, 0, 1 false positives on clean documents, so the threshold moved to 3. The spec table documented the old value, and the spec *is* the payload, so both hashes changed. | Pilot only. Changed inside the §8.4 revision window, before any registered run. |
| 3 | 2026-08-20 | §0 | Added the LF line-ending requirement for payload generation. | Payload byte size shifted by exactly its line count, revealing that the frozen hash is platform-dependent. Left unstated, §7.1's hash check would exclude every run on a CRLF checkout despite identical content. | No. |
| 4 | 2026-08-20 | §4.2b | Added per-class mutation predictions, explicitly marked not blind. | v1.0 predicted only "structural" and "semantic" against five defined classes. Resolved into per-class targets; §4.2 retained unaltered as the blind record. | Yes — written after pilot data. Flagged as such in §4.2b. |
| 5 | 2026-08-20 | §7.3 | Demoted Rule S to a lower bound; replaced Rule L (embedding cosine) with Rule J, a temperature-0 model judge; added an undefined-case rule and a κ ≥ 0.70 admissibility gate. | A pre-data check compared a document against a structurally identical copy with every node renamed. Rule S scored 0.00 with relation overlap undefined, proving it measures naming convention rather than structure. Reported alone it would have produced a false H3 finding that the schema underdetermines the trace. | No — no experimental data. The check used the `examples/` corpus and a synthetic rename. |
| 6 | 2026-08-20 | §6 | Reduced scope: Exp 0 to 20 tasks, Exp 1 to 12 tasks × 2 samples, Exp 3 removed entirely. | **Cut for cost**: solo study on consumer subscription plans; Exp 3 was the most expensive and least powered. Secondary consideration: §11 already disclaimed the downstream-utility claim it was meant to support. All four systems retained. | No. Decided before any collection. |
| 7 | 2026-08-20 | §7.3 | Dropped the planned `diff --json` work. | The canonical model already exposes every link as `{from, relation, to}` via `--compact`, so H3's triples need no new tool surface. `diff` was never the blocker; the cross-document matcher was. | No. |
| 8 | 2026-08-20 | throughout (v1.3) | Incorporated an external methodological review: H1 restructured into H1a/H1b with the v1.0 basis-contrast demoted to secondary H1-lex; basis-conditional AUROC promoted to co-primary; generic-schema control condition added to Exp 1 (+48 runs); RQ5 funded with an explicit arm-D allocation (+24 runs); real tests and clustering units specified for all primaries; decision rules and a failure condition added; MDE table added; Exp 2 moved to a fresh corpus disjoint from `examples/`; restraint contradiction resolved; judge changed to triplicate-majority; probe enlarged to 10 prompts/system with a decision rule; multiple wording narrowings (§2, §3, §5.1, §10, §12). | The review identified design flaws (H1 did not test RQ1; no attribution control; Holm applied over hypotheses without tests), statistical gaps (pseudo-replication, no MDE), and instrument-validity issues (threshold train/test leak) — all cheaper to fix before data than after. | No registered data. Pilot data only, already logged in entries 1–4. |
| 10 | 2026-08-20 | §6, Exp 0 | Restored Experiment 0 from 20 tasks to 30, reversing part of the v1.2 cut. Registered calls ~328 → ~408; tasks to author 32 → 42. | The v1.3 MDE table showed both RQ1 primaries underpowered at 20 tasks: H1a powered only for the upper half of its predicted range, H1b estimation-first. An underpowered primary yields an *uninformative* result, which is worse for the paper than a negative one. Exp 0 is the cheapest experiment per run (short ground-truth answers), so power is bought here more cheaply than anywhere else. H1b remains estimation-first even at 30 and the document says so rather than pretending otherwise. | No. Decided before any collection. |
| 9 | 2026-08-20 | §13 entry 2 (addendum) | Disclosure appended to the threshold decision: the sweep contained only **2 enumeration mutants per threshold value**. | The choice of 3 is weakly supported at that n. The registered Exp 2 run tests it on a larger held-out corpus (§6), which is the actual test of the decision. | Pilot only. |

---

## 14. Artifact availability, venue, and anonymization

**Artifacts.** On publication: the pinned commit tagged and archived for a DOI; all task sets; the frozen prompt template, spec payload, and control-schema payload; every raw response and transcript; the grading and analysis pipeline; and this pre-registration with its complete deviation log. Raw responses are released in full, including runs that were excluded and runs that produced unparseable output.

**External registration.** This document is registered on OSF (DOI in §0 upon filing) so that the deviation log's append-only property is anchored to a third-party timestamp rather than to a git history the author controls.

**Venue plan.** Target: NeurIPS Datasets & Benchmarks track, which expects a runnable benchmark plus baselines. The packaging: task sets + grader + harness as the releasable benchmark; **Condition G as the baseline**; arms A–C results framed as the dated leaderboard snapshot; arm D as the reproducible reference entry.

**Anonymization plan, decided now rather than at submission week.** The payload is the public spec of a named repository and §8.5 requires regenerating every number from it. For double-blind review: an anonymized repository mirror (e.g., anonymous.4open.science) serving the pinned commit; the author's name scrubbed from the pre-registration copy included in the submission; the OSF registration cited as an anonymized view. The de-anonymizing history remains intact on the public repository and is linked on acceptance.
