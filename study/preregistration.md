# Pre-registration: Measuring AI-Authored Reasoning Traces Across Models in a Fixed Agent Harness

**Author:** Fatin Ishraq
**Protocol version:** 2.6
**Date filed:** 2026-08-20 (v1.0) · amended 2026-08-20 (v1.1–v1.4) · redesigned 2026-08-20 (v2.0) · amended 2026-08-21 (v2.1–v2.5) · **post-pilot task-design amendment 2026-08-21 (v2.6)**
**Status:** The v2.3 protocol was publicly frozen before collection. Version 2.6 was written after 20 GPT/OpenAI cued-probe responses and the complete discarded 60-run Terra pilot, but before any v2.6 pilot, main-experiment, or DeepSeek response. It replaces the expensive development gate with a disjoint 10-task/20-call hard pilot. The project author approved all 10 tasks unchanged on 2026-08-21 before the authoritative freeze and before any v2.6 model response. See §13, entry 21.

**v2.0 is a redesign, not an amendment.** Versions 1.0–1.4 compared four first-party vendor agent systems, in which model and harness were confounded by construction and the study could only disclose the confound rather than remove it. v2.0 holds the harness fixed and varies the model inside it. The unit of analysis, the research questions, and the arms all change. Versions 1.0–1.4 remain in the public git history (`cdcf74f`, `b8b12e4`, `7951f05`, `fece65d`, `22c4882`, `667d7e5`) and are superseded, not deleted. See §13, entry 12.

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
| **Harness** | **Codex CLI 0.144.6, `codex exec --skip-git-repo-check`, non-interactive** |
| **Reasoning effort** | **`high` for the model panel; swept only in the §6 effort experiment** |
| Prompt template SHA-256 | recorded in the versioned frozen manifest before the first run |
| Control-schema payload SHA-256 (Condition G) | recorded in a versioned frozen manifest before Experiment 1 begins |
| Pre-data public timestamp | Annotated Git tag `study-predata-v2.3`; pushed before the first registered call |
| Post-probe sequencing amendment | Annotated Git tag `study-protocol-v2.4`; filed with all 20 existing OpenAI probe records |
| Post-pilot panel amendment | Annotated Git tag `study-protocol-v2.5`; filed with the 60-run pilot and all prior probe records |
| Hard-pilot redesign | v2.6 authoritative manifest frozen after project-author human review |

**Model panel, pinned by slug.** Availability was verified by live invocation on 2026-08-20; `gpt-5.6-sol` required a re-authentication before it resolved, and `gpt-5.1` was rejected under every slug tried.

| Arm | Slug | Contrast it serves |
|---|---|---|
| T | `gpt-5.6-terra` | within-generation variant |
| L | `gpt-5.6-luna` | within-generation variant |
| S | `gpt-5.6-sol` | within-generation variant |
| DF | `deepseek-v4-flash` | between-vendor (lower tier) |
| DP | `deepseek-v4-pro` | between-vendor (upper tier) |

The five GPT-5.4 cued-probe records collected under v2.3–v2.4 are preserved as
withdrawn historical data. They are not part of the current panel, schedules,
sample sizes, or confirmatory analyses; see §13, entry 20.

**Line endings.** The payload is generated with LF line endings (`thoughtml guide --full`, written without CRLF translation). The frozen SHA-256 is ending-sensitive, and §8.3 excludes any run whose payload hash does not match, so a CRLF checkout would exclude every run despite identical content.

**Disclosure.** The spec payload is byte-identical to `crates/thoughtml/llms.txt`, the public specification served by the project website. The document handed to models is the public document verbatim. This is a property of the tool's design — one source, so the printed guide cannot drift from the implementation — and it is why the contamination probe in §9 is mandatory rather than optional.

---

## 1. Summary

ThoughtML is a plain-text language for recording reasoning as a machine-checkable graph: typed claims, evidence relations, agent stances carrying confidence, and a checker that derives argument status and reports internal conflicts. It is designed to be authored by AI agents rather than by hand.

Whether AI agents can and do author such traces well has not been measured. This study is that measurement. Five models are run **inside a single fixed agent harness**, so that scaffolding, prompt delivery, tool policy, and sampling settings are held constant and the model is the only thing that varies. A generic minimal-schema control separates properties of the models from properties of the schema. The checker's own defect-detection ability is measured separately and offline, with no models involved.

The study is designed so that its central results are informative regardless of direction. Predictions are stated numerically in §4 before any data exists.

---

## 2. Background and the gap

**The idea is not novel and this study does not claim it is.** Externalizing an argument into nodes and typed attack relations, then computing which claims survive, descends from Dung (1995) and appears in contemporary work on Argumentative LLMs (ArgLLMs, 2023–2026) with several implementations. Prior art is acknowledged throughout.

The gap this study addresses is different: **the author is aware of no standard file format or trace schema for agent reasoning, and of no benchmark measuring whether models can author one.** This is a scoped claim based on the author's literature review of 2026-08-19; the paper's related-work section will cite the specific surveys, and a counterexample would narrow the contribution rather than void the measurements.

A second gap concerns confidence. The 2026 literature reports that LLMs verbalize confidence in a narrow high band largely independent of accuracy. What has not been tested is whether **a schema that requires an explicit provenance label on every number** (`measured` / `estimated` / `assumed`) changes the confidence values assigned, or recovers any calibration signal. That manipulation is available in ThoughtML and is the study's most transferable question.

**Sober prior.** Dung-style argumentation is 31 years old with near-zero industry adoption. One commonly cited reason is that no human will hand-author reasoning graphs; rival explanations exist (no downstream consumer, contested semantics) and the adoption question is not settled here. The bet motivating ThoughtML is that the hand-authoring constraint stopped binding around 2024. This study tests the bet's first premise — that agents author these graphs *well* — and nothing further.

---

## 3. Research questions

- **RQ1.** Does requiring an explicit provenance basis change the confidence values models assign, and does it improve the calibration of those values?
- **RQ2.** Do models record attacks on their own reasoning in the trace, or only support for it — and is that a property of the schema or of the models?
- **RQ3.** Do independent models given the same task converge on the same reasoning structure, or only on the same conclusion?
- **RQ4.** What classes of reasoning defect does the checker detect, and which does it provably miss?
- **RQ5 (new in v2.0).** Does trace quality vary with **inference-time reasoning effort**, holding model weights constant?

v1.0–v1.4's RQ5 asked whether the *harness* changes trace structure. That question is unanswerable here because the harness no longer varies — which is the point of the redesign. It is replaced by the reasoning-effort question, which is a strictly cleaner manipulation: identical weights, identical tokenizer, identical training, only compute budget differs.

---

## 4. Hypotheses and predicted values

Predictions were generated before data collection and are recorded here to be scored. All intervals are the author's subjective 80% ranges. Being wrong is an acceptable and informative outcome.

### 4.1 Primary outcomes

Exactly four outcomes are primary; familywise error is controlled with Holm–Bonferroni at α = 0.05, and the tests are specified in §8.1.

**H1a (RQ1) — Requiring provenance shifts confidence.**
Mean stance confidence in Condition B (basis-required) will be lower than in Condition F (free-form), on the same tasks, paired within task.
*Predicted difference: 0.03–0.08. Null: difference = 0.*

**H1b (RQ1) — Requiring provenance improves calibration.**
AUROC of stance confidence discriminating correct from incorrect answers will be higher in Condition B than Condition F.
*Predicted difference: 0.02–0.08 AUROC units. Null: difference = 0.* This is the only measurement that can support a "recovers calibration signal" interpretation; H1a without H1b shows only that the label shifts the number.

**H2 (RQ2) — Models rarely attack their own reasoning.**
Attack share = (`opposes` + `undercuts`) / (`supports` + `opposes` + `undercuts`), computed **per document** over the three polarity-carrying relations only, then averaged (mean of per-document ratios). A document with zero polarity-carrying relations contributes no ratio; the count of such documents is reported.
*Predicted: < 0.10. Secondary binary form: fraction of documents containing at least one attack edge, predicted 0.20–0.45.*

**H3 (RQ3) — Structural agreement is low.**
Cross-**model** relation overlap on identical tasks, as Jaccard over matched (source, relation, target) triples under the matching rule fixed in §7.3. Computed within the fixed harness, so any disagreement is attributable to the model rather than to scaffolding differences — a strictly cleaner test than v1.4's cross-system version.
*Predicted: 0.15–0.30 for relations; 0.30–0.50 for nodes alone.*

**Secondary (outside the Holm family):**
- **H1-lex** — within Condition B, mean confidence attached to numbers labelled `assumed` is lower than those labelled `measured`. Predicted 0.05–0.10. Label and confidence come from the same forward pass, so a gap shows lexical consistency, not recovered calibration.
- **H5 (RQ5) — Reasoning effort improves trace quality.** On one model, `check --strict` clean rate and attack share both increase monotonically from `low` to `xhigh`. Predicted: strict-clean rises 10–30 pp across the sweep; attack share rises 0–8 pp. Exploratory in status but pre-registered in direction, because it is the study's only fully unconfounded manipulation.

**Decision rules, fixed in advance.** The predicted intervals score *prediction accuracy*; they are not confirmation criteria. **H1a / H1b** — the Holm-adjusted test rejects the null AND the point estimate is positive. **H2** — confirmed iff the 95% CI upper bound on attack share is < 0.15. **H3** — confirmed iff the 95% CI upper bound on relation Jaccard under Rule J is < 0.35. A point estimate of 0.14 for H2 therefore has a pre-assigned meaning regardless of which side of the predicted interval it falls on.

### 4.2 Exploratory predictions

Reported descriptively, without significance claims. Retained unaltered from v1.0 where still applicable, as the blind pre-data record.

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
| ~~Sessions spontaneously re-reading a `.thml`~~ | ~~< 0.20~~ *(Exp 3 removed in v1.2; retained in the blind record, untested)* |
| ~~Harness effect on attack share~~ | ~~0–10 pp~~ *(unanswerable in v2.0; harness is fixed)* |
| ~~Harness effect on `--strict` pass rate~~ | ~~0–40 pp~~ *(same)* |
| **Between-vendor gap in `--strict` clean rate (GPT vs DeepSeek)** | **0–25 pp** |
| **Within-generation spread across Terra / Luna / Sol** | **0–10 pp** |

The last two correspond to the two retained contrasts in §5.2. The within-generation prediction is deliberately near zero: if Terra, Luna and Sol are lateral variants rather than a capability ladder, they should behave alike, and a large spread would be the surprise. The former between-generation prediction was withdrawn with the GPT-5.4 arm in v2.5 and is not tested.

### 4.2b Per-class mutation predictions — NOT BLIND (added in v1.1)

These were written after seeing pilot data (§13, entry 1) and are weaker evidence than §4.2. **The v1.0 structural/semantic mutation predictions are retired as unscoreable** — the pooled rate they targeted will not be reported, and the class boundary they assumed was never defined. This table is the operative record for Experiment 2 and is marked non-blind.

| Class | Predicted |
|---|---|
| structural | 0.90–1.00 |
| relational-semantic | 0.10–0.25 |
| — of which link-direction reversal specifically | 0.00–0.10 |
| numeric, default flags | 0.05–0.20 |
| numeric, under `--strict-provenance` | 0.60–0.85 |
| enumeration | 0.70–1.00 |
| identity | 0.80–1.00 |
| restraint false-positive rate | 0.00–0.05 |

The pooled all-defect rate is **not** predicted and will not be reported: with unequal mutants per operator it is an artifact of generation counts, not a property of the checker.

### 4.3 Outcomes that would surprise the author

**Upside:** Confidence AUROC > 0.75 in either condition. Attack share > 0.20. Relation overlap > 0.60 under Rule J. Monotone reasoning-effort improvement exceeding 30 pp. Per §8.2, none would be reported as a confirmed finding of this study; each would motivate a pre-registered follow-up and a framing change.

**Downside:** Parse rate < 0.70. Restraint false-positive rate > 0.10. Attack share in the generic-schema control *higher* than under ThoughtML — i.e. the schema suppresses self-critique. Within-generation spread (Terra/Luna/Sol) exceeding the between-vendor gap, which would mean the panel's contrasts do not mean what §5.2 claims.

---

## 5. Units of analysis and design

### 5.1 The unit is a model within a fixed harness

All five arms run through **Codex CLI 0.144.6**, non-interactively, with identical invocation, identical prompt payload, identical reasoning effort (`high`), and a single-shot policy in which tool calls are forbidden and audited. Scaffolding, system prompt, prompt delivery, and sampling policy are therefore constant across arms, and **the model is the only thing that varies.**

This is the central improvement over v1.0–v1.4, which compared four different vendor harnesses and could only disclose the resulting model×harness confound in a limitations section. That confound is now removed by construction rather than apologised for.

**What is gained:** any difference between arms is attributable to the model. **What is given up:** ecological breadth. Results describe models *as invoked through Codex*, not as deployed in their own vendors' products, and not as raw API endpoints. Codex contributes its own system prompt and scaffolding to every call; that contribution is constant and therefore not a confound, but it is present, and §12 states it.

### 5.2 Two retained contrasts

The panel is not a capability ladder and is not described as one. It supports two distinct comparisons:

1. **Within-generation variants** — Terra / Luna / Sol, all `gpt-5.6`. Whether sibling variants of one generation author comparably. Expected near-null; a large spread would indicate the variants differ in ways relevant to structured authoring.
2. **Between-vendor** — GPT vs DeepSeek-v4 (Flash and Pro). Whether any finding is OpenAI-specific. DeepSeek additionally contributes a within-vendor tier contrast (Flash vs Pro).

Because the harness is fixed, the between-vendor contrast is cleaner than anything available in v1.4, where each vendor's model was inseparable from its own agent product.

### 5.3 Reproducibility

The GPT arms are closed-weight, silently updated, and eventually retired; they are reported as dated observations with the collection window and any available version string recorded per run. The DeepSeek arms are the study's reproducibility anchor. Experiment 2 is fully offline and reproducible from artifacts. In the terms defined in §12.2, the study is reproducible for Experiment 2 and the DeepSeek arms, and replicable-at-best for the GPT arms.

---

## 6. Experiments

**Scope.** Collection is free for the GPT arms (consumer subscription) and metered but inexpensive for the DeepSeek arms (prepaid credits). Cost therefore no longer constrains sample size; **subscription rate limits do**, and collection is expected to span several days. That is the binding constraint, and §12 records the risk it creates.

| Experiment | Design | Runs |
|---|---|---|
| Exp 0 — discarded v2.4 pilot | 30 tasks × 2 conditions × Terra only; never pooled | **60** |
| Exp 0 — v2.6 hard development pilot | 10 disjoint tasks × 2 conditions × Terra only; never pooled or reused | **20** |
| Exp 0 — calibration | 30 ground-truth tasks × 2 conditions × 5 models | **300** |
| Exp 1 — authoring | 12 reasoning tasks × 5 models × 3 samples | **180** |
| Exp 1 — Condition G control | 12 tasks × 5 models × 1 sample | **60** |
| Exp 5 — reasoning-effort sweep | 12 tasks × 4 efforts × `gpt-5.6-terra` × 2 samples | **96** |
| Exp 2 — mutation testing | offline, no model calls | — |
| **Main registered model calls** | | **636** |
| **Total calls including both discarded Exp 0 pilots** | | **716** |
| Contamination probe (§9.2) | 5 cued prompts × 5 models | 25 |
| **Final benchmark tasks** | 30 replacement ground-truth + 12 reasoning (9 tension + 3 no-tension) | **42** |
| **Additional pilot-only tasks** | permanently excluded from the final benchmark | **10** |

Three samples per cell in Experiment 1 (up from two in v1.4) because cost no longer binds. Experiment 0 remains at 30 tasks, restored in v1.4 for power.

**Minimum detectable effects (analytic, pre-data).** Simulation-based power calculations are included in the analysis code and run before main collection (§8.5).

| Primary | Approximate MDE | Against the prediction |
|---|---|---|
| H1a (30 paired tasks, Wilcoxon) | d_z ≈ 0.61 → ≈ 0.05–0.07 raw | Covers the upper part of the predicted 0.03–0.08. **Underpowered below ≈0.05**, and reported as an estimate with CI in that region, not a rejection. |
| H1b (AUROC contrast, ~30 splits/condition) | ≈ 0.12–0.16 AUROC units | Exceeds the predicted 0.02–0.08: **H1b remains estimation-first.** A confirmed rejection would itself be an upside surprise. Stated rather than resolved, because resolving it would cost more tasks than the study has. |
| H2 (12 task clusters, ~180 documents) | CI half-width ≈ 0.05–0.08 | Can reject H0 ≥ 0.15 if the true share is ≤ ~0.07; adequate for the predicted < 0.10. |
| H3 (12 tasks × 10 model pairs) | bootstrap CI half-width ≈ 0.05–0.09 | Adequate to separate the predicted 0.15–0.30 from the 0.35 decision bound across most of the range. The five-model panel yields 10 pairs per task. |

**H1b task-count sensitivity, run before any registered model response.** A
Monte Carlo grid using the registered task-cluster bootstrap estimated roughly
29% power at 30 tasks for a +0.08 AUROC contrast. Higher-precision boundary runs
estimated 68% at 120 tasks, 79% at 150, and 87% at 180. Expanding to 180 would
require 150 additional independently reviewed tasks and 2,100 additional model
calls, while still targeting only the optimistic top of the predicted range.
The study therefore retains 30 tasks and the already-declared
**estimation-first** interpretation for H1b rather than presenting it as
adequately powered.

### Experiment 0 — Confidence calibration and the basis manipulation

**Purpose:** RQ1. Tests H1a, H1b; H1-lex secondary.

30 tasks with unambiguous ground-truth answers × 2 prompt conditions × 5 models.

- **Condition F (free-form):** the standard prompt template.
- **Condition B (basis-required):** identical, plus one added instruction requiring a `measured` / `estimated` / `assumed` label on every number.

Condition B exists because the basis field is opt-in (`TML401` fires only under `--strict-provenance`), so a free-form-only design risks too few labelled numbers to test the basis hypotheses at all. Condition B guarantees the manipulation is present; Condition F measures the spontaneous rate.

**Discarded v2.4 pilot:** one arm only (`gpt-5.6-terra`), 30 × 2 = 60 runs. It is additional to the 636-call main collection and is never pooled. It failed the registered ceiling gate (27/30 correct in B; 30/30 in F) and remains preserved as development data.

**Replacement v2.6 hard pilot:** 10 newly authored, pilot-only tasks × the same two conditions × Terra = 20 calls. All 20 calls are completed before inspecting the gate; there is no decision after the first condition or a partial batch. Each condition passes only with 5–8 correct and at least 2 incorrect among all 10 included runs. The complete round fails if either condition falls outside that window. These 10 tasks are never reused in Experiment 0 main, even if the gate passes.

If the hard pilot passes, a separate 30-task main corpus is authored from the validated difficulty recipe, deterministically verified, independently reviewed, and frozen in a new disclosed amendment before any main call. If it fails, the round remains discarded and a new disjoint development set is required; individual favorable tasks are never selected into the main corpus. The existing v2.4 `calibration.json` is not admissible for main collection. Experiment 0 main remains blocked until its replacement corpus exists and the hard pilot has passed.

### Experiment 1 — The authoring benchmark, with a schema control

**Purpose:** RQ2, RQ3. Tests H2 and H3.

12 reasoning tasks × 5 models × 3 samples under the ThoughtML condition, plus **Condition G**: the same tasks and models with a deliberately minimal generic schema in place of the ThoughtML spec — a bare JSON structure with `claims[]` (id, text, confidence) and `relations[]` (from, type ∈ {supports, opposes}, to). Its exact text is frozen and hashed before Experiment 1 begins.

Condition G is what allows H2 and H3 to be read as "property of models under any schema" versus "property of ThoughtML": attack share and cross-model overlap are computed identically on control output. It also serves as the benchmark baseline for §14.

**Task composition:** 9 tasks with genuine tension and 3 deliberate no-tension manipulation checks (§7.2). The check is directional only at 3 vs. 9 and is reported as such. H3 is computed over all 12.

**Single-shot, no tool calls permitted.** If a model runs `thoughtml check` and repairs its own output, the measurement becomes one of tool-loop competence rather than authoring competence. Codex CLI exposes a shell surface that cannot be removed by the pinned interface, so the prompt explicitly forbids every tool call. Runs use an empty neutral directory, ephemeral state, ignored user configuration and rules, a read-only sandbox, and approval policy `never`. Absence of tool calls is verified from the transcript; any run containing one is excluded.

### Experiment 5 — Reasoning-effort sweep (new in v2.0)

**Purpose:** RQ5. Tests H5.

12 tasks × 4 reasoning-effort levels (`low`, `medium`, `high`, `xhigh`) × `gpt-5.6-terra` × 2 samples, set per call via `-c model_reasoning_effort=<level>`.

This is the study's **only fully unconfounded manipulation**: identical weights, tokenizer, training data, harness, prompt and temperature; only inference-time compute varies. Every other contrast in the study carries training differences along with capability differences. If trace quality tracks reasoning effort, that is a causal statement about deliberation rather than a correlational one about model choice.

### Experiment 2 — Mutation testing of the checker

**Purpose:** RQ4. Zero model calls; fully offline and deterministic.

Extends `crates/thoughtml/tests/falsification.rs`, which already separates **detection** (does a known defect fire), **restraint** (does a sound document stay quiet), and **blind spots** (which real errors are asserted as misses on purpose).

**Corpus.** The registered run executes on documents **authored by the models in Experiment 1**, plus a fresh clean corpus disjoint from `examples/`. Disclosure: the `TML501` enumeration threshold was tuned on `examples/` (§13, entry 2), so an enumeration catch rate measured on `examples/` would be train-test leakage and is not admissible. `examples/` may be reported as a secondary, explicitly-contaminated comparison, never as the headline.

| Mutation class | Example |
|---|---|
| Structural | dangling id reference, broken inheritance chain, malformed link |
| Relational-semantic | flip `supports` → `undercuts`; swap link source and target |
| Numeric | invert a confidence; strip a basis label; move `weight` onto a `leads-to` |
| Enumeration | replace `part-of` with `supports` (the documented confidence-inflation error) |
| Identity | split one node across two ids; merge two distinct claims under one id |

**Restraint control:** an equal number of *semantics-preserving* mutations (whitespace, node ordering, consistently applied id renaming). The restraint false-positive rate is reported per operator against the §4.2b predicted 0.00–0.05. A catch rate without a false-positive rate is not interpretable.

This experiment tests the **tool**. Experiment 1 tests the **model**. They are reported separately and never combined into a single quality figure.

### Removed

**Experiment 3** (cold-session utility test) was removed for cost in v1.2 and remains removed. Its design is preserved in the v1.0–v1.1 git history (`cdcf74f`). No downstream-utility claim is made anywhere in this study (§11).

---

## 7. Materials and operational definitions

### 7.1 Invocation and payload

Every run is a single non-interactive invocation:

```
codex exec --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --strict-config --sandbox read-only -c approval_policy="never" -m <slug> -c model_reasoning_effort=<level> --json -o <response-path> -
```

executed from an empty neutral working directory outside the ThoughtML repository. The prompt is assembled as instruction block + full spec payload (Condition G substitutes the control-schema payload) + one task, written once to stdin, and stdin is then closed. This avoids the Windows command-line length limit without changing prompt bytes. The complete prompt bytes and SHA-256 are logged per run and verified at analysis time; any run whose hash differs from the frozen schedule is excluded under §8.3.

`model` is deliberately unset in `~/.codex/config.toml` so that every run specifies its slug explicitly and no result depends on whatever the account default happens to be.

### 7.2 Task construction rules

Fixed before authoring the task sets.

1. **Held out.** No task may derive from, paraphrase, or structurally resemble any document in `examples/`, the documentation, or the spec's worked examples.
2. **Genuine tension** (Exp 1, 9 of 12). Every tension task must admit at least two positions a competent reasoner could defend. This is a precondition for H2 to be interpretable: if tasks have obvious answers, a low attack share measures the task set, not the model.
3. **Domain spread.** No more than 25% from any single domain, and no more than 25% software-related.
4. **Ground truth** (Exp 0 only). A single defensible answer verifiable independently of the model's reasoning.
5. **Length bounded.** 80–200 words, to hold prompt length roughly constant.
6. **Calibration difficulty.** The v2.4 6-easy/12-medium/12-hard corpus is retired after its ceiling failure. The v2.6 development set contains 10 pilot-only hard tasks, each with a deterministic reference solver and a human ambiguity/difficulty review. The final 30-task distribution is fixed only after this development gate and is disclosed in the next pre-main amendment; none of the 10 pilot tasks may enter it.
7. **Neutral decision wording.** Every Experiment 1 task ends with the same request to decide what should be done and represent the reasoning and conclusion. Task prompts and condition instructions do not require counterarguments, counterevidence, or opposition links.

**Manipulation check for H2.** Three of Experiment 1's 12 tasks are deliberately constructed *without* genuine tension. If attack share is equally low on tension and no-tension tasks, task design is not driving H2. If it is measurably higher on tension tasks, models are responsive to task structure and the overall rate is meaningful. Directional only at 3 vs. 9; reported whichever way it resolves.

### 7.3 Cross-document node matching — fixed before data

**Rule S is a floor, not a co-equal rule.** A pre-data check compared a document against a structurally identical copy with every node renamed — same six links, same graph. Rule S scored **0.00** node overlap, with relation overlap undefined because no nodes matched. Rule S therefore measures naming convention, not structure, and would have driven H3 to ~0 for every pair regardless of actual agreement. Reported alone it would have produced the false finding that "the schema underdetermines the trace."

- **Rule S (floor).** Two nodes match iff their normalized ids are equal (lowercase, punctuation stripped, separators collapsed to a single hyphen). A lower bound on agreement, never the headline figure.
- **Rule J (judge) — primary.** A model reads both documents and labels node correspondences. The judge is the **DeepSeek API at temperature 0, run three times per pair with majority labels and self-agreement reported.** Temperature 0 on a served mixture-of-experts API is approximately deterministic, not exactly so — hence triplicate. The judge sees both documents in full and is asked only whether two nodes denote the same claim, never whether the reasoning is good.
- **Undefined case.** If zero nodes match under a rule, relation overlap is undefined and reported as such — never as 0.00. The count of undefined pairs is reported per rule.
- **Adjudication and validation.** On a random subsample of 20 document pairs, node correspondence is manually labelled **blind to the automatic results** by two raters: the author, and one external rater (the collaborating researcher is the intended candidate). Cohen's κ is reported for author-vs-external, author-vs-Rule-J, and external-vs-Rule-J. **Rule J is admissible as the primary matcher only if its κ against the manual labels exceeds 0.70** — the "substantial agreement" floor of Landis & Koch (1977). Below that, H3 is reported as inconclusive rather than rescued with a different rule. If no external rater is recruited, the single-rater limitation is reported and κ author-vs-Rule-J stands alone, explicitly flagged as weaker.

**Disclosed circularity.** The judge is a language model evaluating whether language-model-authored traces agree, and it shares a vendor with two of the five arms. Shared failure modes could inflate measured agreement. The κ validation is the check on this and is reported whatever it shows.

### 7.4 Output extraction rule — fixed before data

The prompt requests the document with no commentary. Where a response deviates, extraction proceeds in this fixed order, applied mechanically and never case-by-case:

1. If the response parses as ThoughtML in full (Condition G: as JSON), use it whole.
2. Otherwise, if exactly one fenced code block is present, use its contents.
3. Otherwise, if more than one fenced block is present, use the longest.
4. Otherwise, record the run as **unparseable**. Unparseable is a **result**, not an exclusion.

The extraction path taken is logged per run and its distribution reported.

---

## 8. Analysis plan

### 8.1 Primary tests

Every hypothesis names its clustering unit; observations within a cluster are never treated as independent.

| Hypothesis | Test | Clustering unit | Effect size |
|---|---|---|---|
| H1a | Wilcoxon signed-rank on the B−F contrast, one value per (task × model) aggregated to task level before testing | task | median difference, bootstrap 95% CI |
| H1b | Paired comparison of per-condition AUROC, cluster bootstrap over tasks | task | ΔAUROC, bootstrap 95% CI |
| H2 | One-sided test of H0: attack share ≥ 0.15, cluster bootstrap resampling **tasks** | task | proportion with CI |
| H3 | **Permutation null**: relation Jaccard for same-task cross-model pairs vs. cross-task pairs. Computed under Rule S and Rule J separately | task | Jaccard with CI, per rule |

Four p-values against explicit nulls; Holm–Bonferroni across them at familywise α = 0.05. Non-parametric throughout. For H3, the 10 pairwise model comparisons per task share documents; per-pair CIs come from the task-level bootstrap.

**Contrast analyses (exploratory, §5.2):** within-generation and between-vendor differences are tested with Kruskal–Wallis across arms followed by pre-specified pairwise contrasts, reported with CIs and without familywise claims.

### 8.2 Exploratory analyses

All measures in §4.2 are reported descriptively with confidence intervals and **without** significance claims. Any pattern discovered may motivate a future pre-registered study; it will not be reported as a finding of this one.

### 8.3 Exclusion rules — fixed before data

A run is excluded if and only if:

1. The harness returned an error, an empty response, or a rate-limit failure that did not resolve on the pre-specified retry policy (three retries, exponential backoff);
2. Transcript audit reveals injected context beyond the frozen payload (project memory, agent instruction files, retrieved documents);
3. Tool calls occurred in a condition specifying that no tool calls are permitted;
4. The logged payload hash does not match the frozen hash;
5. The logged model slug or reasoning effort does not match the intended cell.

Every exclusion is logged with its reason and totals reported per arm.

A run is **never** excluded for producing unparseable, low-quality, short, or unexpected output. Such runs are data.

### 8.4 Stopping and sequencing

Main-experiment sample sizes are fixed in advance. Development pilots are always
completed in full and discarded before their gate is applied; there is no
partial-batch peeking, extension, or movement of favorable pilot tasks into the
main corpus.

**Global provider sequence (v2.4).** Collection is divided into two operational
provider blocks so credentials and provider configuration are changed once, not
between phases. The GPT/OpenAI block is completed first: cued probe → discarded
Terra Experiment 0 development pilot → protocol revision window → frozen OpenAI main
collection. The DeepSeek block follows: cued probe (and the neutral half only if
§9.2 triggers) → DeepSeek main collection. Experiment 2 remains offline and may
run independently. No DeepSeek main response is collected before its own probe.

Within each provider and phase, run order remains deterministically randomized
across arms and cells using the frozen schedule seed. The v2.4 amendment changes
only temporal order. It does not change models, tasks, prompts, sample sizes,
grading, hypotheses, inclusion rules, or analysis. It was adopted after 20
OpenAI cued-probe responses had been observed; those responses were all
unparseable, with zero exposure hits, and the amendment was motivated by avoiding
repeated provider reconfiguration rather than by selecting an outcome.

Global provider blocking creates a stronger disclosed temporal-order limitation:
a model or harness update between the OpenAI and DeepSeek blocks could align with
vendor. Dates, versions, collection gaps, and configuration changes are recorded,
and no temporal difference is silently interpreted as a vendor effect.

### 8.5 Reproduction requirement

Every figure and number in the resulting paper regenerates from the raw logs by a single command. No number is transcribed by hand. Simulation-based power calculations for the four primaries are included in the analysis code and run before main collection; the §6 MDE table records the pre-data analytic approximations they replace.

---

## 9. Contamination controls and probe

### 9.1 Environment hygiene

Every run executes in a neutral scratch directory outside the project repository, with no agent instruction files, project memory, or custom settings in scope. Configuration is **not trusted**; each run's transcript is audited for injected context, and failure of that audit triggers exclusion under §8.3(2).

This control exists because the author's own environment contains project memory files summarizing ThoughtML's design. Their presence in one arm and not others would produce asymmetric contamination biasing directly toward the study's hypotheses. Running every arm through one harness from one directory makes this substantially easier to guarantee than the v1.4 design, in which four different products had four different context-loading behaviours.

### 9.2 Zero-shot probe

Before any public documentation is updated, each model is asked to author a ThoughtML document **with no specification supplied**, across the 5 frozen cued prompts, through the same harness as the main experiments. Scored for: any output; parseable output; use of correct core relation names; use of the twelve postures.

**The prompts are frozen in two labelled halves of 5.** **Cued** prompts deliberately shadow the topics of the public `examples/` corpus — the failed loaf, the bridge inspection, the grant panel, the coastal evacuation, the tutoring trial — giving a model that saw the corpus every opportunity to reveal it. **Neutral** prompts share no topic with any public document, so competence there indicates knowledge of the *format* rather than recall of a specific example.

**Staged design.** The 5 cued prompts run first, for every model. Cued prompts are strictly more sensitive to exposure than neutral ones, so if all 5 come back clean the neutral half adds little. The neutral half runs **only for an arm that shows exposure**, where the cued-vs-neutral split distinguishes memorising the corpus from knowing the format.

**Decision rule, fixed in advance:** if a model produces parseable ThoughtML using at least one correct core relation name in **≥ 1 of 5** cued prompts, that arm is flagged as contaminated and reported separately from the headline table. This is more conservative than v1.4's ≥ 2 of 10 rule, so the staged reduction does not weaken the control. At n=5 the probe detects only gross exposure; it cannot rule out subtler differential familiarity, and §12.4 says so.

---

## 10. What each result would mean

Stated in advance so that interpretation is not authored after seeing direction. Interpretations are scoped to *models authoring under this schema, prompt and harness*; Condition G is what licenses any wider reading.

| Result | Interpretation |
|---|---|
| H1a confirmed, H1b confirmed | Schema-level provenance requirements shift confidence **and** recover calibration signal that prompting alone does not. Transferable beyond ThoughtML; the study's strongest positive claim. |
| H1a confirmed, H1b null | Provenance labels shift the numbers without improving their meaning — a compliance effect, not a calibration effect. No calibration claim is made. |
| H1a null | Verbalized confidence is insensitive even to explicit provenance labelling. Confidence should be demoted to optional metadata and the structural checks led instead. A clean, publishable negative. |
| H2 confirmed, control similar | Models did not record self-attacks under either schema — consistent with, but not sufficient for, the claim that self-audit is insufficient; supports external critique and multi-agent review as the mechanism. |
| H2 confirmed, control higher | The ThoughtML schema *suppresses* recorded self-critique relative to a minimal schema — a finding against the format, reported as such. |
| H2 refuted | Models record self-critique more than assumed under this schema. Weakens the multi-agent argument; strengthens single-agent trace utility. |
| H3 low, control similar | Trace divergence is a property of model reasoning, not of ThoughtML's vocabulary. The standardization concern generalizes. |
| H3 low, control higher | ThoughtML's larger vocabulary underdetermines the trace relative to a minimal schema. A genuine problem for standardization claims, reported as such. |
| H3 high | The schema constrains authors toward convergent structure — meaningful evidence for its viability as a standard. |
| H5 monotone | Trace quality is a function of deliberation, not just of model identity. Causal, since only compute varies — the cleanest claim the study can make. |
| H5 flat | Structured authoring is a capability the model either has or lacks; more thinking does not buy it. Equally informative, and it bounds what prompting-for-more-effort can achieve. |
| Exp 2 low semantic catch | The checker validates form, not truth. Already asserted in `falsification.rs`; the experiment quantifies it. |
| **Failure condition** | **If parse rate < 0.85 AND relation overlap < 0.15 under Rule J AND AUROC ≤ 0.55 in both conditions: the schema neither constrains structure nor recovers signal, and the format claim fails as authored. This combination is stated in advance as the result that counts against the project, and would be reported under that name.** |

**The author's own expectation, recorded in advance:** the most likely picture is that models author syntactically valid but structurally shallow traces dominated by `supports`, that confidence carries little signal, that independent models disagree on structure, and that the generic-schema control behaves similarly on all three. That is a critical result about the state of AI-authored reasoning traces. It is the expected outcome, it is publishable, and it does not constitute a failure of the study.

---

## 11. What this study does not claim

- It does not claim the idea of externalized argument graphs is novel.
- It does not claim ThoughtML is superior to any alternative. The generic-schema control exists for *attribution*, not as a competitive evaluation against another format.
- It does not measure whether anyone wants such a format. Correctness is self-testable; desirability is not, and no experiment here addresses it.
- It does not describe how these models behave in their own vendors' products. Every arm is invoked through one third-party harness, and results are scoped accordingly.
- It does not establish a capability scaling relationship. The panel supports three named contrasts (§5.2), not a curve.
- It makes no downstream-utility claim. Experiment 3 was removed in v1.2; the question moves to future work in full.

---

## 12. Threats to validity

1. **Single harness.** Every result describes models *as invoked through Codex CLI 0.144.6*, including its system prompt and scaffolding. Constant across arms, so not a confound between them, but it bounds external validity: another harness might yield different absolute rates. This replaces v1.4's threat #1 (model/harness confounding), which the redesign eliminates.
2. **Reproducibility.** Terms used precisely: *reproducible* = same artifacts, same results — true for Experiment 2 (offline) and approximated for the DeepSeek arms. *Replicable* = new data, same finding — plausible but not guaranteed for the GPT arms, and impossible after vendor retirement. GPT arms are reported as dated observations.
3. **Vendor model drift mid-study.** Rate limits force collection across several days, which widens the window in which a silent update could land. Mitigated by randomized run order and by recording every run's timestamp; any arm whose runs cluster in time is flagged.
4. **Contamination.** The payload is the public specification verbatim. Measured in §9.2 with a pre-registered decision rule; the probe detects gross exposure only.
5. **Grader authored by the study author.** Experiment 2 tests the grader **against author-designed defects; it bounds but does not eliminate author-grader circularity.** Mitigations: `falsification.rs` asserts known blind spots deliberately; restraint is reported alongside detection; and, contingent on recruiting the §7.3 external rater, that rater contributes 5–10 adversarial mutants authored blind to the checker's implementation.
6. **Task design could induce or suppress H2.** Mitigated by §7.2's construction rules and the manipulation check, which is directional only at 3 vs. 9 tasks.
7. **Rater dependence.** The κ validation rests on two raters at best, one of whom is the author. A failed recruitment leaves a single-rater design, reported as such.
8. **Panel contrasts may not mean what §5.2 claims.** Terra, Luna and Sol are assumed to be lateral variants of one generation; if they in fact differ substantially in capability, the "within-generation" contrast is mislabelled. §4.3 registers a large within-generation spread as a downside surprise precisely so this is caught rather than absorbed.
9. **Prompt sensitivity.** One template per condition. The degree to which results depend on its wording is unmeasured; RQ2's phrasing and §10's interpretations are scoped to "under this schema, prompt and harness" for exactly this reason. A template ablation is future work.
10. **No capability floor is located.** All five arms are competent contemporary models. If all succeed, the study shows that capable models can author ThoughtML without identifying where the format breaks down. Experiment 5's effort sweep partially compensates by degrading deliberation rather than capability.
11. **Author interest in the outcome.** The author designed ThoughtML and has a direct stake in a favourable result. This pre-registration, the advance predictions in §4, the decision rules in §4.1, the fixed matching rule in §7.3, the fixed exclusion rules in §8.3, the failure condition in §10, and the deviation log in §13 exist specifically to constrain that interest. They are stated so a reader can check whether they were honoured.

---

## 13. Deviation log

Append-only. Every departure from this document after filing is recorded with its date, its reason, and whether it occurred before or after the relevant data was seen. Entries are never edited or removed; corrections to an earlier entry are made by appending a new one.

| # | Date | Section | Deviation | Reason | Data already seen? |
|---|---|---|---|---|---|
| 1 | 2026-08-20 | §6 Exp 2 | Ran a discarded pilot of the mutation suite on the 9 clean `examples/` documents (151 mutants). | To break the harness before it counted. Three harness bugs found and fixed; three mutation classes had silently produced zero mutants. Not pooled per §8.4. | Pilot only. No registered data. |
| 2 | 2026-08-20 | §0 | Re-pinned commit, binary SHA and payload SHA. | The pilot showed `TML501` fires at ≥4 `supports`, missing 3-item enumerations — the error the spec calls "the mistake that breaks the mirror." A threshold sweep (4/3/2) gave 1/2, 2/2, 2/2 catches against 0, 0, 1 false positives, so the threshold moved to 3. The spec table documented the old value, and the spec *is* the payload, so both hashes changed. | Pilot only. Inside the §8.4 revision window. |
| 3 | 2026-08-20 | §0 | Added the LF line-ending requirement. | Payload byte size shifted by exactly its line count, revealing the frozen hash is platform-dependent. Left unstated, §8.3's hash check would exclude every run on a CRLF checkout despite identical content. | No. |
| 4 | 2026-08-20 | §4.2b | Added per-class mutation predictions, marked not blind. | v1.0 predicted only "structural" and "semantic" against five defined classes. Resolved into per-class targets; §4.2 retained unaltered as the blind record. | Yes — written after pilot data. Flagged in §4.2b. |
| 5 | 2026-08-20 | §7.3 | Demoted Rule S to a lower bound; replaced the embedding-cosine rule with Rule J, a temperature-0 model judge; added an undefined-case rule and a κ ≥ 0.70 admissibility gate. | A pre-data check compared a document against a structurally identical copy with every node renamed. Rule S scored 0.00 with relation overlap undefined, proving it measures naming convention rather than structure. Reported alone it would have produced a false H3 finding. | No. The check used `examples/` and a synthetic rename. |
| 6 | 2026-08-20 | §6 | Reduced scope; Exp 3 removed entirely. | **Cut for cost** under the then-current design: solo study on consumer plans, and Exp 3 was the most expensive and least powered. Secondary: §11 already disclaimed the claim it supported. | No. |
| 7 | 2026-08-20 | §7.3 | Dropped the planned `diff --json` work. | The canonical model already exposes every link as `{from, relation, to}` via `--compact`, so H3's triples need no new tool surface. `diff` was never the blocker; the cross-document matcher was. | No. |
| 8 | 2026-08-20 | throughout (v1.3) | Incorporated an external methodological review: H1 split into H1a/H1b with the original basis contrast demoted to secondary; basis-conditional AUROC promoted to co-primary; generic-schema control added; RQ5 funded; real tests and clustering units specified; decision rules and a failure condition added; MDE table added; Exp 2 moved to a corpus disjoint from `examples/`; restraint contradiction resolved; judge changed to triplicate-majority; probe enlarged with a decision rule; multiple wording narrowings. | The review identified design flaws (H1 did not test RQ1; no attribution control; Holm applied over hypotheses without tests), statistical gaps (pseudo-replication, no MDE), and instrument-validity issues (threshold train/test leak) — all cheaper to fix before data than after. | No registered data. Pilot only, logged in 1–4. |
| 9 | 2026-08-20 | §13 entry 2 (addendum) | Disclosure appended: the threshold sweep contained only **2 enumeration mutants per threshold value**. | The choice of 3 is weakly supported at that n. The registered Exp 2 run tests it on a larger held-out corpus. | Pilot only. |
| 10 | 2026-08-20 | §6, Exp 0 | Restored Experiment 0 from 20 tasks to 30. | The MDE table showed both RQ1 primaries underpowered at 20. An underpowered primary yields an *uninformative* result, worse for the paper than a negative one, and Exp 0 is the cheapest experiment per run. | No. |
| 11 | 2026-08-20 | §9.2 | Split the zero-shot probe prompts into 5 cued and 5 neutral, reported separately. | The first prompt set unintentionally drew 5–6 topics from `examples/`. Corpus-adjacent topics raise sensitivity, which is wanted, but pooling them with neutral prompts would confound topic-cued recall with knowledge of the format. | No. Prompts frozen before any were sent. |
| 12 | 2026-08-20 | **whole document (v2.0)** | **Redesigned the study: one fixed harness (Codex CLI), six models varying inside it, replacing four vendor agent systems. Unit of analysis, arms, RQ5 and several threats all change.** New: three named contrasts (within-generation, between-generation, between-vendor) replacing the vendor-panel framing; Experiment 5, a reasoning-effort sweep, added as the only fully unconfounded manipulation; Exp 1 samples raised 2 → 3; probe moved into the harness and staged to cued-first with a ≥1/5 rule. | Model and harness were confounded by construction in v1.0–v1.4 and could only be disclosed, never removed. Holding the harness fixed removes the study's deepest flaw. The redesign also became free rather than metered, which lifted the sample-size constraint, and fully scriptable, which removes manual-collection error. Availability of every slug was verified by live invocation before pinning. | No registered data. |
| 13 | 2026-08-20 | §0, §5.1 | Recorded that `gpt-5.6-sol` initially failed and resolved only after re-authentication, and that `gpt-5.1` was rejected under every slug tried. | Availability is an empirical property of the account, not a documented one. Recording the failures prevents a later reader assuming the panel was chosen freely rather than constrained by what actually resolved. | No. |
| 14 | 2026-08-21 | §6 Exp 2 | Ran a second discarded implementation pilot of the mutation generator on five newly authored development documents (51 applicable mutants). The documents and complete output are retained under `study/mutation-corpus/development/` and `study/runs/pilot-mutations-20260821/`; neither is admissible in the registered result. A separate `registered-clean/` corpus was authored afterward and the runner blocks it until the protocol is frozen. | To exercise every new operator, baseline-differencing logic, detector mode, and restraint control end to end before freezing the harness. No operator or prediction is tuned to the registered corpus. | Development-pilot results only. No registered data. |
| 15 | 2026-08-21 | §5.1, §6 Exp 0, §7.1–§7.2, §8.3 (v2.1) | Clarified that the 60-call Experiment 0 pilot is discarded and additional to the 744-call main collection; changed prompt transport from a command-line argument to stdin; replaced the unachievable claim of absent tool access with a forbidden-and-audited tool-call policy; stratified calibration tasks as 6 easy, 12 medium, and 12 hard with deterministic answer checks; and made all Experiment 1 task endings and condition instructions neutral about counterevidence. | These are pre-data implementation corrections. The old total was arithmetically inconsistent, the full prompt exceeds the Windows process command-line limit, Codex exposes a shell surface, the former calibration set risked a ceiling, and the former wording directly induced the opposition behavior used by H2. | No registered model calls or responses. |
| 16 | 2026-08-21 | §0, §6, §13–§14 (v2.2) | Recorded the completed human review; retained 30 calibration tasks with H1b estimation-first after a pre-data task-count sensitivity analysis; scoped the unresolved Rule J implementation as an Experiment 1 blocker; and replaced the planned OSF registration with the public annotated Git tag `study-predata-v2.2`. | The author approved the corpus, expanding to 180 tasks would add 150 tasks and 2,100 calls while powering only the optimistic +0.08 effect, Rule J is unnecessary for the probe and Experiment 0, and the author does not yet have an OSF account. Git history supplies a public timestamp but is explicitly acknowledged as weaker than immutable third-party registration. | No registered model calls or responses. |
| 17 | 2026-08-21 | §0, §8.4 (v2.3) | Replaced whole-panel random ordering with provider-blocked ordering: GPT/OpenAI arms first, DeepSeek arms second, with deterministic shuffling inside each block. The prior v2.2 tag remains public but is superseded before data by `study-predata-v2.3`. | The author explicitly chose to begin with ChatGPT models. The first v2.2 randomized item happened to be DeepSeek; it was seen only in a dry run and was never executed. Freezing the operational preference is cleaner than selecting individual runs manually. | No registered model calls or responses. |
| 18 | 2026-08-21 | §0, §8.4 (v2.4) | Extended provider blocking from within each phase to the whole collection: finish all GPT/OpenAI probing, pilot, and main runs before configuring and collecting DeepSeek. Models, tasks, prompts, sample sizes, grading, hypotheses, inclusion rules, and analysis are unchanged. The v2.3 pre-data tag remains the immutable baseline; v2.4 is a separately tagged post-probe amendment. | Repeatedly switching provider credentials and configuration creates avoidable operational error. One provider change is simpler to audit. | **Yes: 20/20 planned OpenAI cued probes existed (5 each for GPT-5.4, Luna, Sol, and Terra); all completed on the first attempt, none was excluded, none used tools, and all were unparseable with zero exposure hits.** No Experiment 0 model pilot, main-experiment response, or DeepSeek response existed. The decision was operational, not outcome-selective. |
| 19 | 2026-08-21 | §6 Exp 0, protocol issue P09 | Completed the full discarded Terra pilot and applied the frozen acceptance rule. B produced 27/30 correct and F 30/30; both failed the required 15–24 correct and ≥6 incorrect window. Across all 60 calls: 59 parseable, 57 strict-clean, zero exclusions, zero tool events, and zero retries. Experiment 0 is blocked pending a harder, independently reviewed corpus and a complete replacement pilot. The mechanically reproducible report is `study/runs/analysis/exp0-pilot-v2.4-summary.json`. | A ceiling-dominated calibration experiment cannot estimate confidence discrimination or a basis effect reliably. The rule and required response were fixed before the pilot. | **Yes: the complete 60-run discarded pilot.** It is retained in full and never pooled with main results. |
| 20 | 2026-08-21 | §0, §4.2, §5–§6, §8 (v2.5) | Withdrew `gpt-5.4` from the panel, removing the exploratory between-generation contrast and reducing the main design from six to five models (744 → 636 main calls). Its five cued-probe records remain as withdrawn historical data and are mechanically omitted from v2.5 schedules and default analyses. | The author judged the arm redundant after consulting an external model index. Artificial Analysis v4.1.1 scores GPT-5.6 Luna xhigh at 50 and GPT-5.4 xhigh at 53; this external similarity was used as a panel-design heuristic, not as evidence about ThoughtML or as an exact match to the study's high-effort setting. | **Yes: 20 OpenAI cued probes and the discarded 60-run Terra pilot existed.** GPT-5.4's own five probe results were all unparseable with zero exposure hits, identical in direction to every retained OpenAI arm; no main or DeepSeek response existed. The decision was not based on a favorable ThoughtML outcome. Source: [Artificial Analysis comparison](https://artificialanalysis.ai/models/comparisons/gpt-5-6-luna-xhigh-vs-gpt-5-4). |
| 21 | 2026-08-21 | §0, §6 Exp 0, §7.2, §8.4 (v2.6) | Added 10 disjoint hard pilot-only tasks and reduced the replacement Terra development pilot from 60 to 20 calls. Registered a 5–8 correct and at least 2 incorrect gate per condition; prohibited partial-batch decisions and reuse of pilot tasks in main; retired the v2.4 calibration corpus from main eligibility. Project author Fatin Ishraq then reviewed and approved all 10 tasks unchanged before authoritative freezing. | The complete v2.4 pilot proved that the old corpus had a ceiling and that a 60-call round is unnecessarily expensive for task-recipe development. A small disjoint pilot can detect another gross ceiling or floor before 300 main calls, while permanent separation prevents outcome-selected tasks entering the final benchmark. | **Yes: the 20 OpenAI probes and discarded 60-run Terra pilot described in entries 18–20.** No v2.6 pilot, main, Experiment 1, Experiment 5, or DeepSeek response existed at approval or freeze time. |

---

## 14. Artifact availability, venue, and anonymization

**Artifacts.** On publication: the pinned commit tagged and archived for a DOI; all task sets; the frozen prompt template, spec payload and control-schema payload; every raw response and transcript; the run harness and analysis pipeline; and this pre-registration with its complete deviation log. Raw responses are released in full, including excluded runs and runs that produced unparseable output.

**Pre-data timestamp and limitation.** The author does not currently have an OSF
account, so this study is not registered on OSF and claims no DOI. Before the
first registered call, the complete pre-data state is pushed publicly under the
annotated Git tag `study-predata-v2.3`. This gives readers a dated, inspectable
baseline, but a repository owner can technically rewrite Git history or move a
tag. It is therefore weaker than immutable third-party registration and is
reported as a limitation, not described as equivalent to OSF.

The later global provider-order change is not described as pre-registered. It is
published under the separate annotated tag `study-protocol-v2.4` together with
the 20 OpenAI probe records that existed when the decision was made.

The completed discarded pilot and five-model panel amendment are published under
the separate annotated tag `study-protocol-v2.5`. Version 2.5 is post-pilot and
is never described as pre-registered; the v2.3 tag remains the pre-data record.

The v2.6 hard-pilot redesign was first prepared as a non-collectable candidate.
After the project author approved all 10 tasks unchanged, it received an
authoritative manifest before any v2.6 pilot response. This is an author review,
not an external-rater review.

**Venue plan.** Target: NeurIPS Datasets & Benchmarks, which expects a runnable benchmark plus baselines. Packaging: task sets + grader + harness as the releasable benchmark; **Condition G as the baseline**; the GPT arms as a dated snapshot; the DeepSeek arms and Experiment 2 as the reproducible reference entries.

**Anonymization plan, decided now rather than at submission week.** The payload is the public spec of a named repository and §8.5 requires regenerating every number from it. For double-blind review: an anonymized repository mirror serving the pinned commit; the author's name scrubbed from the copy included in the submission; and the public pre-data tag disclosed only where venue policy permits. The de-anonymizing history remains intact on the public repository and is linked on acceptance.
