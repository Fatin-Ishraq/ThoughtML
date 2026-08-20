# Pre-registration: Measuring AI-Authored Reasoning Traces Across Four Vendor Agent Systems

**Author:** Fatin Ishraq
**Pre-registration version:** 1.1
**Date filed:** 2026-08-20 (v1.0) · amended 2026-08-20 (v1.1)
**Status:** Filed before any registered data collection. No registered experimental data exists. A discarded pilot of Experiment 2 has been run; see §13.

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

**Line endings.** The payload is generated with LF line endings (`thoughtml guide --full`, written without CRLF translation). This is load-bearing: the same specification checked out on a platform that translates line endings produces a different SHA-256 for identical content, and §7.1 excludes any run whose payload hash does not match. Anyone reproducing this study must generate the payload with LF endings or the hash check will fail on unchanged content.

**Disclosure.** The spec payload is byte-identical to `crates/thoughtml/llms.txt`, the public specification served by the project website. The document handed to models in this study is the public document verbatim. This is a property of the tool's design — one source, so the printed guide cannot drift from the implementation — and it is why the contamination probe in §9 is mandatory rather than optional.

---

## 1. Summary

ThoughtML is a plain-text language for recording reasoning as a machine-checkable graph: typed claims, evidence relations, agent stances carrying confidence, and a checker that derives argument status and reports internal conflicts. It is designed to be authored by AI agents rather than by hand.

Whether AI agents can and do author such traces well has not been measured. This study is that measurement. It evaluates four first-party vendor agent systems on their ability to author ThoughtML documents, and it evaluates the checker's own detection ability independently of any model.

The study is designed so that its central results are informative regardless of direction. Predictions are stated numerically in §4 before any data exists.

---

## 2. Background and the gap

**The idea is not novel and this study does not claim it is.** Externalizing an argument into nodes and typed attack relations, then computing which claims survive, descends from Dung (1995) and appears in contemporary work on Argumentative LLMs (ArgLLMs, 2023–2026) with several implementations. Prior art is acknowledged throughout.

The gap identified by recent surveys, and the one this study addresses, is different: **no standard file format or trace schema for agent reasoning exists, and no benchmark measures whether models can author one.** ArgLLM work generally constructs argument structures through purpose-built pipelines. Nobody has measured what a frontier agent system produces when simply handed a schema and asked to record its reasoning in it.

A second gap concerns confidence. The 2026 literature reports that LLMs verbalize confidence in a narrow high band largely independent of accuracy. What has not been tested is whether **a schema that requires an explicit provenance label on every number** (`measured` / `estimated` / `assumed`) recovers any of that lost signal. That manipulation is available in ThoughtML and is the study's most transferable question.

**Sober prior.** Dung-style argumentation is 31 years old with near-zero industry adoption. The stated reason has been that no human will hand-author reasoning graphs. The bet motivating ThoughtML is that this constraint stopped binding around 2024, when agents became capable authors. This study tests the bet's first premise — that agents author these graphs *well* — and nothing further.

---

## 3. Research questions

- **RQ1.** Does requiring an explicit provenance basis change the confidence values models assign, relative to free-form authoring?
- **RQ2.** Do models record attacks on their own reasoning, or only support for it?
- **RQ3.** Do independent systems given the same task converge on the same reasoning structure, or only on the same conclusion?
- **RQ4.** What classes of reasoning defect does the checker detect, and which does it provably miss?
- **RQ5.** Does the harness, holding the model roughly fixed, change trace structure?

---

## 4. Hypotheses and predicted values

Predictions were generated before data collection and are recorded here to be scored. All intervals are the author's subjective 80% ranges. Being wrong is an acceptable and informative outcome.

### 4.1 Primary outcomes

Exactly three outcomes are primary. All others are exploratory and no inferential claims will be made from them. Familywise error across the three primaries is controlled with Holm–Bonferroni at α = 0.05.

**H1 (RQ1) — Provenance basis shifts confidence.**
Mean stance confidence attached to numbers labelled `assumed` will be lower than that attached to numbers labelled `measured`.
*Predicted difference: 0.05–0.10. Null hypothesis: difference = 0.*

**H2 (RQ2) — Models rarely attack their own reasoning.**
Attack share = (`opposes` + `undercuts`) / (`supports` + `opposes` + `undercuts`), computed per document over the three polarity-carrying relations only.
*Predicted: < 0.10. Secondary binary form: fraction of documents containing at least one attack edge, predicted 0.20–0.45.*

**H3 (RQ3) — Structural agreement is low.**
Cross-system relation overlap on identical tasks, as Jaccard over matched (source, relation, target) triples under the matching rule fixed in §7.3.
*Predicted: 0.15–0.30 for relations; 0.30–0.50 for nodes alone.*

### 4.2 Exploratory predictions

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
| AUROC of confidence discriminating correct from incorrect | 0.55–0.65 |
| Mutation catch rate, structural defects | 0.95–1.00 |
| Mutation catch rate, semantic defects | 0.15–0.35 |
| Sessions spontaneously re-reading a `.thml` (Exp 3, arm b) | < 0.20 |
| Harness effect on attack share (optimistic ceiling) | ~10 pp |
| Harness effect on `--strict` pass rate (optimistic ceiling) | 30–40 pp |

### 4.2b Per-class mutation predictions — NOT BLIND (added in v1.1)

v1.0 predicted mutation catch rates for "structural" and "semantic" defects, but §6 defines *five* classes and did not say which of the other four counted as semantic. It matters: the pilot returned 1.00 for `identity`, far outside the 0.15–0.35 semantic band, so the pooling rule changes the answer. The ambiguity is resolved here with per-class predictions.

**These predictions are not blind.** They were written after seeing pilot data (§13, entry 1) and are therefore weaker evidence than §4.2. The v1.0 predictions in §4.2 stand unaltered as the blind, pre-data record and are the ones that should be scored as predictions. These are stated so the registered run still has a written target, not to replace them.

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

Recorded now so that a bolder claim, if warranted, is not a post-hoc reconstruction. Confidence AUROC > 0.75. Attack share > 0.20. Relation overlap > 0.60. Any of these would constitute a substantially stronger positive result than predicted and would change the paper's framing.

---

## 5. Units of analysis and design

### 5.1 The unit is a deployed agent system, not a model

The four arms are **first-party vendor agent systems**, each running that vendor's own flagship model in default configuration. This is the inclusion criterion; it is not a convenience sample.

| Arm | System | Vendor |
|---|---|---|
| A | Claude Code | Anthropic |
| B | Codex | OpenAI |
| C | Antigravity | Google |
| D | DeepSeek agent harness | DeepSeek |

Access is via consumer subscription plans, not API plans, for arms A–C. Arm D is available both through the vendor harness and through the raw API.

**Model and harness are therefore confounded in the primary comparison, by design and by constraint.** This study does not claim to isolate model capability. The unit of analysis is the system as deployed, which is also the unit end users actually encounter.

### 5.2 Partial decomposition

Three slices recover most of the lost inference without claiming an isolation that was not achieved:

1. **Harness fixed, model varies.** Within each arm, vary the selectable model where the system permits it. Isolates model effect with scaffolding held constant.
2. **Model fixed, harness varies.** Arm D only, run through both the vendor harness and the bare API. This is the *only* cell in the design capable of separating harness effect from model effect, and it is the reason arm D is load-bearing rather than a token open-weights entry.
3. **The diagonal.** All four systems as shipped. The ecologically valid comparison and the headline table.

### 5.3 Reproducibility asymmetry

Arm D is the only arm with open weights and therefore the only arm a reader can replicate exactly after publication. Arms A–C are silently updated and eventually retired. Where the analysis permits, results are anchored to arm D and the other arms are reported as contemporaneous observations within a stated collection window.

---

## 6. Experiments

### Experiment 0 — Confidence calibration and the basis manipulation

**Purpose:** RQ1. Tests H1.

**Design:** 30 tasks with unambiguous ground-truth answers × 2 prompt conditions × systems.

- **Condition F (free-form):** the standard prompt template.
- **Condition B (basis-required):** identical, plus one added instruction requiring a `measured` / `estimated` / `assumed` label on every number.

Condition B exists because the basis field is opt-in in ThoughtML (`TML401` fires only under `--strict-provenance`), so a free-form-only design risks having too few labelled numbers to test H1 at all. Condition B guarantees the manipulation is present; condition F measures the spontaneous rate.

**Pilot:** arm D only, 30 × 2 = 60 runs. Extension to arms A–C is contingent on the pilot completing without protocol failure, **not** on the direction of results.

**Measures:** stance confidence by basis label; accuracy against ground truth; AUROC of confidence discriminating correct from incorrect; distribution of confidence values.

### Experiment 1 — The authoring benchmark

**Purpose:** RQ2, RQ3, RQ5. Tests H2 and H3.

**Design:** 20 reasoning tasks × 4 systems × 3 samples = 240 runs.

**Single-shot, no tool access.** If a system can run `thoughtml check` and repair its own output, the measurement becomes one of tool-loop competence rather than authoring competence. Tool access is a separate, later question. Absence of tool calls is verified per run from the transcript, not assumed from a flag.

**Measures:** parse rate; `check` / `--strict` / `--lint` pass rates; diagnostic code frequencies (TML101–TML502); relation type distribution; attack share; posture distribution; presence of `revises` edges; conflict kinds reported by `--audit` (`confidence-vs-status`, `definition-divergence`); cross-system node and relation overlap.

### Experiment 2 — Mutation testing of the checker

**Purpose:** RQ4. Requires zero model calls; fully offline and deterministic.

Extends `crates/thoughtml/tests/falsification.rs`, which already separates **detection** (does a known defect fire), **restraint** (does a sound document stay quiet), and **blind spots** (which real errors are asserted as misses on purpose).

**Design:** programmatically mutate a corpus of clean documents; measure catch rate, precision, and recall per mutation class.

| Mutation class | Example |
|---|---|
| Structural | dangling id reference, broken inheritance chain, malformed link |
| Relational-semantic | flip `supports` → `undercuts`; swap link source and target |
| Numeric | invert a confidence; strip a basis label; move `weight` onto a `leads-to` |
| Enumeration | replace `part-of` with `supports` (the documented confidence-inflation error) |
| Identity | split one node across two ids; merge two distinct claims under one id |

**Restraint control:** an equal number of *semantics-preserving* mutations (whitespace, node ordering, consistently applied id renaming) which must produce **no** new diagnostics. A catch rate without a false-positive rate is not interpretable.

This experiment tests the **tool**. Experiment 1 tests the **model**. They are reported separately and are never combined into a single quality figure.

### Experiment 3 — The cold-session utility test

**Purpose:** whether a recorded trace changes downstream behaviour. Smallest and most likely to return a null.

**Design:** ~5 task variants × 3 arms × 2 systems ≈ 30 sessions. A small library task with genuine cross-session dependency (recurrence and DST rules), requirements delivered in waves so that a session-1 decision is stressed by a session-3 requirement, with a hard context break between sessions.

- **Arm (a):** no ThoughtML — control.
- **Arm (b):** a `.thml` on disk, no retrieval mechanism.
- **Arm (c):** a `.thml` plus a minimal MCP `recall` tool.

**Pre-registered prediction:** arm (b) ≈ arm (a). The agent will author a competent trace and then not read it, because nothing forces retrieval. If arm (c) exceeds both, the bottleneck is **delivery**, not the language — which is the most useful thing this experiment can establish, and it is obtainable only by running (b) and (c) as separate arms.

**Constraint on arm (c):** the `recall` tool must be deliberately unintelligent — return the whole document, or filter by node id. No ranking or relevance scoring. Smart ranking would confound "did delivery matter" with "was the ranking good," and is a separate study.

**Constraint on comparison:** MCP support differs across vendor systems. Arm (c) is a **within-system** comparison only. Systems lacking MCP support are reported as (a)/(b)-only rather than dropped.

---

## 7. Materials and operational definitions

### 7.1 Prompt payload

A single frozen template, hash recorded in §0, identical across all systems and all runs within an experiment. Assembled as: instruction block + full spec payload + one task. The payload hash is logged per run and verified at analysis time; any run whose logged hash differs from the frozen hash is excluded under §8.3.

### 7.2 Task construction rules

Fixed before authoring the task sets.

1. **Held out.** No task may derive from, paraphrase, or structurally resemble any document in `examples/`, the documentation, or the spec's worked examples.
2. **Genuine tension** (Exp 1). Every task must admit at least two positions a competent reasoner could defend. This is a precondition for H2 to be interpretable: if tasks have obvious answers, a low attack share measures the task set, not the model.
3. **Domain spread.** No more than 25% of tasks from any single domain, and no more than 25% software-related.
4. **Ground truth** (Exp 0 only). A single defensible answer verifiable independently of the model's reasoning.
5. **Length bounded.** 80–200 words, to hold prompt length roughly constant.

**Manipulation check for H2.** Three Exp 1 tasks are deliberately constructed *without* genuine tension (obvious answers). If attack share is equally low on tension and no-tension tasks, task design is not driving H2 and the low rate is a property of the systems. If attack share is measurably higher on tension tasks, systems are responsive to task structure and the overall rate is meaningful. This check is reported whichever way it resolves.

### 7.3 Cross-document node matching — fixed before data

H3 is entirely at the mercy of this rule, so it is fixed now and reported under both variants. `thoughtml diff` compares two versions of the *same* document and assumes shared ids; independent authors will not share ids, so `diff` alone is insufficient and a cross-document matching path must be built.

- **Rule S (strict).** Two nodes match iff their normalized ids are equal. Normalization: lowercase, strip punctuation, collapse separators to a single hyphen.
- **Rule L (lenient).** Two nodes match iff Rule S matches, **or** the cosine similarity of their label text under a single pinned embedding model exceeds 0.80. The model identifier and version are recorded in the manifest before data collection.
- **Reporting.** Both rules are reported for every H3 figure. If they differ by more than 15 percentage points, the metric is declared rule-sensitive in the results, not reconciled to whichever is more favourable.
- **Adjudication.** On a random subsample of 20 document pairs, the author manually labels node correspondence **blind to both automatic results**, and Cohen's κ between manual labels and each rule is reported. This is the study's only inter-rater check and its limitation as a single-rater design is acknowledged in §12.

Relation overlap is Jaccard over (matched source, relation, matched target) triples.

### 7.4 Output extraction rule — fixed before data

The prompt requests the document with no commentary. Where a response deviates, extraction proceeds in this fixed order, applied mechanically and never case-by-case:

1. If the response parses as ThoughtML in full, use it whole.
2. Otherwise, if exactly one fenced code block is present, use its contents.
3. Otherwise, if more than one fenced block is present, use the longest.
4. Otherwise, record the run as **unparseable**. Unparseable is a **result**, not an exclusion.

The extraction path taken is logged per run and its distribution is reported.

---

## 8. Analysis plan

### 8.1 Primary tests

| Hypothesis | Test | Effect size |
|---|---|---|
| H1 | Wilcoxon signed-rank, paired within task | median difference, bootstrap 95% CI |
| H2 | Bootstrap 95% CI on the proportion; Kruskal–Wallis across systems | proportion with CI |
| H3 | Bootstrap 95% CI on Jaccard, computed under Rule S and Rule L separately | Jaccard with CI |

Non-parametric throughout. Pass-rate and proportion data at this sample size will not be assumed normal. Holm–Bonferroni across the three primaries.

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

Sequence: contamination probe → pilot (arm D, Exp 0) → **protocol revision window** → frozen protocol → main collection. The pilot exists to break the protocol; its data is discarded and not pooled with the main run. Any protocol change after the main run begins is a deviation under §13.

Run order is randomized across systems so that a mid-study vendor model update cannot align with any single arm's block.

### 8.5 Reproduction requirement

Every figure and number in the resulting paper regenerates from the raw logs by a single command. No number is transcribed by hand at any point.

---

## 9. Contamination controls and probe

### 9.1 Environment hygiene

Every run executes in a fresh scratch directory outside the project repository, with project memory, `CLAUDE.md`, skills, and custom settings disabled. Configuration flags are **not trusted**; each run's transcript is audited for injected context, and failure of that audit triggers exclusion under §8.3(2).

This control exists because the author's own environment contains project memory files summarizing ThoughtML's design and philosophy. Their presence in one arm and not others would produce asymmetric contamination biasing directly toward the study's hypotheses.

### 9.2 Zero-shot probe

Before any public documentation is updated, each system is asked to author a ThoughtML document **with no specification supplied**, across 5 prompts. Scored for: any output; parseable output; use of correct relation names; use of the twelve postures.

This measures prior exposure through training data. Given that the study payload is the public specification verbatim (§0), memorization is a live threat and is measured rather than assumed absent. The probe is reported whatever it shows.

---

## 10. What each result would mean

Stated in advance so that interpretation is not authored after seeing direction.

| Result | Interpretation |
|---|---|
| H1 confirmed | Schema-level provenance requirements recover calibration signal that prompting alone does not. Transferable beyond ThoughtML; the study's strongest positive claim. |
| H1 null | Verbalized confidence is insensitive even to explicit provenance labelling. Confidence should be demoted to optional metadata and the structural checks led instead. A clean, publishable negative. |
| H2 confirmed (attacks rare) | Agents do not spontaneously record objections to their own reasoning. Empirical support for external critique and multi-agent review; self-audit is insufficient. |
| H2 refuted (attacks common) | Agents self-critique more than assumed. Weakens the multi-agent argument; strengthens single-agent trace utility. |
| H3 low overlap | The schema underdetermines the trace: same reasoning, different graphs. A genuine problem for standardization claims, and it must be reported as such rather than minimized. |
| H3 high overlap | The schema constrains authors toward convergent structure — meaningful evidence for its viability as a standard. |
| Exp 2 low semantic catch | The checker validates form, not truth. Already asserted in `falsification.rs`; the experiment quantifies it. |
| Exp 3 null | The bottleneck is delivery, not language. Motivates retrieval infrastructure; does not validate the format's utility. |

**The author's own expectation, recorded in advance:** the most likely overall picture is that models author syntactically valid but structurally shallow traces dominated by `supports`, that confidence carries little signal, that independent systems disagree on structure, and that nothing reads the trace back. That is a critical result about the state of AI-authored reasoning traces. It is the expected outcome, it is publishable, and it does not constitute a failure of the study.

---

## 11. What this study does not claim

- It does not claim the idea of externalized argument graphs is novel.
- It does not claim ThoughtML is superior to any alternative; no competing format is evaluated.
- It does not measure whether anyone wants such a format. Correctness is self-testable; desirability is not, and no experiment here addresses it.
- It does not isolate model capability from harness scaffolding, except in the single arm-D cell described in §5.2.
- It does not establish that recorded reasoning improves task outcomes. Experiment 3 is underpowered for that claim and is reported as directional evidence only.

---

## 12. Threats to validity

1. **Model/harness confounding.** Accepted by design and constraint; partially decomposed in §5.2; never claimed away.
2. **No temperature or seed control.** Consumer subscription access. The study is *replicable*, not *reproducible*; the collection window and any available version strings are recorded per run.
3. **Vendor model drift mid-study.** Mitigated by randomized run order and a short collection window; cannot be eliminated.
4. **Contamination.** The payload is the public specification verbatim. Measured in §9.2, not assumed away.
5. **Grader authored by the study author.** Mitigated by Experiment 2 testing the grader independently, by `falsification.rs` asserting known blind spots deliberately, and by reporting restraint alongside detection. Not eliminated.
6. **Task design could induce or suppress the H2 result.** Mitigated by the construction rules in §7.2 and the explicit manipulation check.
7. **Single rater.** Only the blind subsample in §7.3 provides any inter-rater signal. A genuine limitation of a solo study.
8. **Possibly reduced Antigravity arm.** If that system exposes no scriptable interface, its arm carries fewer tasks with more samples each. Reported explicitly rather than run thin and presented as equivalent.
9. **Prompt sensitivity.** One template. The degree to which results depend on its specific wording is unmeasured and is a candidate for a follow-up ablation.
10. **Author interest in the outcome.** The author designed ThoughtML and has a direct stake in a favourable result. This pre-registration, the advance predictions in §4, the fixed matching rule in §7.3, the fixed exclusion rules in §8.3, and the deviation log in §13 exist specifically to constrain that interest. They are stated here so a reader can check whether they were honoured.

---

## 13. Deviation log

Append-only. Every departure from this document after filing is recorded here with its date, its reason, and whether it occurred before or after the relevant data was seen. Entries are never edited or removed. An empty log is a claim, and a reader is entitled to treat a suspiciously empty one with scepticism.

| # | Date | Section | Deviation | Reason | Data already seen? |
|---|---|---|---|---|---|
| 1 | 2026-08-20 | §6 Exp 2 | Ran a discarded pilot of the mutation suite on the 9 clean `examples/` documents (151 mutants). | To break the harness before it counted. Three harness bugs were found and fixed; three mutation classes had silently produced zero mutants. Pilot data discarded per §8.4 and not pooled. | Pilot only. No registered data. |
| 2 | 2026-08-20 | §0 | Re-pinned commit, binary SHA, and payload SHA. | The pilot showed `TML501` fires at ≥4 `supports`, missing 3-item enumerations — the error §6 of the spec calls "the mistake that breaks the mirror." A threshold sweep (4/3/2) gave 1/2, 2/2, 2/2 catches against 0, 0, 1 false positives on clean documents, so the threshold moved to 3. The spec table documented the old value, and the spec *is* the payload, so both hashes changed. | Pilot only. Changed inside the §8.4 revision window, before any registered run. |
| 3 | 2026-08-20 | §0 | Added the LF line-ending requirement for payload generation. | Payload byte size shifted by exactly its line count, revealing that the frozen hash is platform-dependent. Left unstated, §7.1's hash check would exclude every run on a CRLF checkout despite identical content. | No. |
| 4 | 2026-08-20 | §4.2b | Added per-class mutation predictions, explicitly marked not blind. | v1.0 predicted only "structural" and "semantic" against five defined classes. Resolved into per-class targets; §4.2 retained unaltered as the blind record. | Yes — written after pilot data. Flagged as such in §4.2b. |

---

## 14. Artifact availability

On publication: the pinned commit tagged and archived for a DOI; all task sets; the frozen prompt template and payload; every raw response and transcript; the grading and analysis pipeline; and this pre-registration with its complete deviation log.

Raw responses are released in full, including runs that were excluded and runs that produced unparseable output.
