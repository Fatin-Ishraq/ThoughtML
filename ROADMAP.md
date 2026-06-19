# ThoughtML — Roadmap & Handoff (v0.2 → v1)

> **Purpose of this file.** A self-contained briefing so a *fresh agent with no
> prior context* can continue ThoughtML. It supersedes the older
> `.claude/plans/ethereal-beaming-sutton.md`. Read §1–§2 before touching code,
> §3 for what already exists, §4 for what to build next.

---

## 1. The project in one screen

**ThoughtML** is a plain-text language for representing *reasoning* as a readable
graph — the goal is "tell a story you can read straight from the graph." You
write foci, questions, links, and stances; the parser normalizes them to a
canonical object model; a playground renders them as an interactive graph and an
**evaluation layer** computes facts *over* the reasoning (confidence, argument
status, …).

**Repo layout**
```
tools/thoughtml-parser-rs/   Rust reference parser (lib + CLI bin behind `cli` feature)
tools/thoughtml-wasm/        wasm-bindgen wrapper around the parser (single `parse(src)`)
tools/thoughtml-web/         Vite + TS playground (CodeMirror editor + Cytoscape graph)
project_plan.md              The v0 language SPEC (sections referenced as §N below)
ROADMAP.md                   ← this file
.claude/                     plans + auto-memory (not part of the product)
install.cmd                  setup helper
```

**Pipeline (spec §16)**
```
source text
  → lines (classify) / lex (values)        src/lines.rs, src/lex.rs
  → surface AST (parser)                   src/surface.rs, src/parser.rs, src/vocab.rs
  → canonical objects (desugar)            src/desugar.rs, src/canonical.rs, src/ids.rs
  → validation                             src/validate.rs
  → derived facts (the evaluation layer)   src/derive.rs
  → canonical JSON
```
The wasm `parse` runs the *exact same* pipeline as the CLI, so the browser and
CLI can never drift.

---

## 2. Architecture & conventions (read before coding)

**Core primitives (spec §4):** `focus`, `question`, `link`, `stance`, `scope`,
`act`. A **readable action surface** (postures: `noticed, considers, suspects,
infers, asks, holds, chooses, rejects, revises, remembers, doubts, accepts`)
desugars to the canonical core. Relations: `supports, opposes, undercuts,
answers, causes, enables, prevents, depends-on, blocks, revises, rejects`.

**Two load-bearing patterns — follow these for every new feature:**

1. **Opt-in derived fields.** Anything the engine *computes* (not authored) is:
   - a new optional field on the canonical struct with
     `#[serde(skip_serializing_if = "Option::is_none")]` (so docs without it
     serialize byte-identically — keeps examples strict-clean),
   - gated behind an `Options` flag (default **off**) so the **CLI default
     output stays stable**,
   - a CLI flag turns it on (`--acts`, `--derived`, `--status`),
   - the **wasm `parse` turns the display-relevant ones ON** so the playground
     always shows them. See `tools/thoughtml-wasm/src/lib.rs`.

2. **The evaluation-layer guardrail.** Computed values are **always kept
   separate from authored ones** — never overwrite what the author said. E.g.
   `derived_confidence` lives beside (not replacing) authored `confidence`; the
   detail panel shows them as two bars. Preserve this for every future
   derivation (sensitivity, EV, formula results).

**Build & verify discipline (run every change):**
```bash
# parser unit + integration tests (must stay green)
cargo test --manifest-path tools/thoughtml-parser-rs/Cargo.toml

# run the CLI (note: bin is behind the `cli` feature)
cargo run --features cli --manifest-path tools/thoughtml-parser-rs/Cargo.toml -- \
    [--derived --status --acts --strict --compact] <file.thml>

# rebuild wasm — MUST use the rustup toolchain, NOT a standalone MSVC rust:
#   prepend $env:USERPROFILE\.cargo\bin to PATH, then:
npm --prefix tools/thoughtml-web run wasm

# typecheck + bundle the web app
npm --prefix tools/thoughtml-web run build
# dev server (HMR):  npm --prefix tools/thoughtml-web run dev
```

**The strict-clean invariant (the formal regression guard).** Every bundled
example in `tools/thoughtml-parser-rs/examples/*.thml` must parse with **zero
errors AND zero warnings**. Enforced by the test
`bundled_examples_are_strict_clean`. When you add a feature/example, keep this
green — it is the canary for accidental behavior changes.

**The visual grammar (playground), so new UI stays coherent:**
- **Node colour = type** (focus/question/link/stance/scope/agent); **node shape
  = focus kind** (observation→round-rect, hypothesis→hexagon, decision→diamond,
  …); see `buildStyle` in `graph.ts`.
- **Edge = relation**, encoded by arrowhead + colour + line via `REL_STYLE` in
  `graph.ts`: support→green arrow, attack(undercuts/opposes/rejects)→red tee,
  causes→teal triangle, enables→open chevron, depends-on→dashed, revises→mauve
  diamond, answers→amber. Edge thickness = `weight`.
- **Lens control** (top-left segmented `Type / Evidence / Argument`) recolours
  the whole graph and shows an on-canvas key. New overlays should become a lens,
  not another toolbar toggle.
- **Concept glyphs** for postures/kinds/severities live in `icons.ts` (`GLYPHS`,
  helper `glyph(name)`); used in the detail panel, chips, header, diagnostics.

---

## 3. Status — what is SHIPPED (v0.2)

Test count: **68 parser tests**, all green; 7 strict-clean examples
(`ai-and-jobs` [default], `incident-742`, `multi-agent-debate`,
`decision-record`, `agent-memory`, `estimate-revised`, `canonical-core`).

**Tier-1 (legibility):** prose `body` on links; `note` (posture-independent
rationale on stances); semantic lints — contradiction, cycle, orphan (§10.1).

**The 9-phase computational track — Phases 1–5 done:**

| # | Phase | What it added | Key bits |
|---|-------|---------------|----------|
| 1 | Typed reasoning | focus `kind` (inferred from posture or explicit `kind` field); `about` → `Question.asks_about`; opt-in `Act` provenance | §4.1, §12.3; `--acts` |
| 2 | Graded relations | link `weight` 0..1 via `weight` field or `strongly`/`weakly` adverb | §4.3 |
| 3 | Temporal & revision | `superseded_by` (via `revises` relation/posture, both kept); document `timeline`; `valid-during`/revision-time lints; **as-of slider** in playground | §8.8, §10.2, §13.1; `src/derive.rs` |
| 4 | Derived confidence | `derived_confidence` = `logistic(2·Σ polarity·weight·believedness)` over supports/opposes/undercuts, topological, transitive, separate from authored | §10.3; `--derived`; opt-in |
| 5 | Argument status | grounded Dung acceptance `in`/`out`/`undecided` over attacks (undercuts/opposes/rejects) | §10.4; `--status`; opt-in |

On the `ai-and-jobs` example the two evaluations corroborate: the displacement
hypothesis is `in` and ≈0.94; the "technology creates jobs" rebuttal is `out`
and ≈0.22 (multi-hop).

**UI overhaul (parallel stream, done):**
- **A** relation-aware links (arrowheads/colour/line per relation) + a real
  visual-key legend (Node types + Links sections).
- **B** icon system (posture/kind/severity glyphs across detail panel, chips,
  header, diagnostics).
- **C** unified **Lens** control (Type/Evidence/Argument) + on-canvas key,
  replacing the scattered heat/status toggles.
- **D** iconic detail header (kind/posture glyph in the badge).

**`Options` flags today:** `emit_acts`, `derive_confidence`, `argument_status`.
**`derive.rs` passes:** `compute_supersession`, `compute_timeline`,
`compute_confidence`, `compute_status` (+ `time_key`, `logistic`, helpers).

---

## 4. The remaining plan (build in this order)

Each phase is a complete vertical slice: **parser → wasm → web → spec (§) →
tests + keep examples strict-clean.** Format below mirrors the original plan.

### Phase 6 — What-if & sensitivity  *(inferential; interactive)*
**Goal.** Make the evaluation interactive: "suppose this node were false →" and
surface the **load-bearing evidence** (the input whose removal moves a
conclusion most).
**Changes.**
1. Refactor `derive.rs::compute_confidence` into a **pure** function
   `propagate(objects, overrides: Map<id,f64>) -> Map<id,f64>` where `overrides`
   force a node's believedness. Current behaviour = `propagate(objects, {})`.
   (Memory note already flags this refactor.)
2. **Counterfactual:** recompute confidence *and* status with a node forced
   to 0/1 or removed; expose the deltas.
3. **Sensitivity:** for each evidence source of a target, recompute with that
   source suppressed and record |Δ|; the max is "load-bearing."
4. **Playground:** click a node → "suppose true/false" → animate every
   downstream `derived_confidence`/`argument_status` change; badge the
   load-bearing input ("swings X by 0.3").
**Where to compute.** Either add a wasm entry `whatIf(overridesJson)`, or port
the (small) propagation formula to TS for instant, round-trip-free interaction.
Recommend TS for the live slider; keep Rust as source of truth + a CLI report.
**Files.** `derive.rs` (extract pure fn), maybe `wasm/lib.rs` (`whatIf`), web:
new `sensitivity.ts` + `main.ts`/`detail.ts`/`graph.ts` wiring.
**Deps.** Phase 4 + 5. **Risk.** medium (interactive recompute; Rust-vs-TS call).

### Phase 7 — Quantities & units  *(representational; the value domain)*
**Goal.** The first half of the "actual math/coding" leap: typed numeric values
with units and interval/Fermi uncertainty.
**Changes.**
- Extend the value model (`lex.rs::Value`) with `Quantity { value, unit }` and
  `Interval { lo, hi, unit? }`. Surface: `value $2M`, `magnitude 40%`,
  `cost 50 usd`, `impact 10k..100k jobs`.
- A focus may carry a quantity/interval; serialize in canonical.
- Interval arithmetic helpers (add/mul) for later propagation.
- `validate.rs`: basic unit-consistency checks (warn on mismatched units).
- Web: detail shows quantity/interval; optional node badge.
**Files.** `lex.rs`, `parser.rs`, `desugar.rs`, `canonical.rs`, `validate.rs`,
`parse.ts`, `detail.ts`.
**Deps.** none (orthogonal to confidence). **Risk.** medium (new value types
ripple through lex/serialize; keep default output stable).

### Phase 8 — Formulas (`= expr`)  *(the executable leap)*
**Goal.** A focus whose value is *computed* from other nodes — the document
becomes runnable, a spreadsheet-of-reasoning.
**Changes.**
- Surface: a formula body/field, e.g. `focus runway` / `  = cash / monthly-burn`.
- New `src/expr.rs`: tokenize → parse → AST for refs (focus ids), numbers,
  quantities (Phase 7), `+ - * / ( )`, and a few functions (`min/max/sum`).
- An evaluation pass (in `derive.rs` or a new `eval.rs`): topological order over
  formula dependencies; **cycle detection → error**; unit propagation/checking.
- Canonical: focus gains `formula` (source string) + computed `value`.
- Web: detail shows formula + result; recompute on edit; optionally show value
  on the node.
**Files.** new `src/expr.rs`, `canonical.rs`, `desugar.rs`, `derive.rs`/`eval.rs`,
`validate.rs`, web (`detail.ts`, `graph.ts`).
**Deps.** Phase 7. **Risk.** **high** — first real sub-language (parsing, cycles,
unit algebra). Land the evaluator with heavy tests before the UI.

### Phase 9 — Decision EV  *(inferential; decision instrument)*
**Goal.** Rank options by expected value; flag dominated options.
**Changes.**
- Model: a decision/question with `option` foci; each option links to outcome
  foci carrying a probability (authored/derived confidence) and a value
  (quantity, Phase 7). `EV(option) = Σ P(outcome)·value(outcome)`.
- Derive: compute EV per option, rank; detect dominated options (worse on all
  axes).
- Web: a decision panel — options sorted by EV with bars; dominated greyed.
**Files.** `derive.rs` (EV pass), `canonical.rs` (option ev), web (decision view).
**Deps.** Phase 7 (values) + Phase 4 (probabilities). **Risk.** medium (modeling
the outcome/value linkage cleanly).

### Phase S — Structure & modularity  *(the original Phase 5; orthogonal)*
**Goal.** Scale-up: nested scopes + inheritance, imports/namespaces, profiles.
**Changes.** populate `Scope.includes` (nesting via `in scope-id` or indentation);
`use <doc>` / `import <ns> from <path>` with namespaced ids `ns:id` + cross-import
resolution; `profile <name>` declaring extra postures/relations so strict
validation accepts domain vocab. Playground gets a virtual import map.
**Files.** `vocab.rs`, `surface.rs`/`parser.rs`, `desugar.rs`, `validate.rs`,
web import-map UI. **Deps.** none. **Risk.** **high** — first cross-document
resolution; give it its own milestone.

### Formal capstone
- Freeze the spec (bump to **v0.3** with all new §sections + CHANGELOG).
- `thoughtml fmt`: a stable canonical pretty-printer for the surface syntax.
- **Golden conformance fixtures**: commit canonical JSON + diagnostics per
  example; a test diffs re-parse vs fixture (extends `integration_tests.rs`,
  hand-rolled compare, no new crate).

---

## 5. Continuous formal track (every phase)
- Keep `bundled_examples_are_strict_clean` green.
- Keep the spec versioned (the `v0.1`/`v0.2` tags + §17 CHANGELOG in
  `project_plan.md`).
- Add tests for every new behaviour; add a showcase example when a feature is
  best seen end-to-end (e.g. `estimate-revised.thml` for temporal).

---

## 6. File map (where things live)

**Parser (`tools/thoughtml-parser-rs/src/`)**
- `lib.rs` — `parse_str` / `parse_str_with(src, Options)`, pipeline wiring.
- `vocab.rs` — keywords, POSTURES, RELATIONS, KINDS, FIELDS, adverbs.
- `lex.rs` — `Value` enum + lexical helpers (numbers, ranges, time, uri…).
- `lines.rs` / `parser.rs` / `surface.rs` — source → surface AST.
- `desugar.rs` — surface AST → canonical objects (focus dedup/merge, until→blocks,
  posture→stance, weight routing, etc.). **NOTE:** construction sites have
  varied indentation (the `infers` link is nested in a `for`) — a blanket
  `replace_all` for adding a struct field will MISS the deeper-indented site;
  always grep-count after.
- `canonical.rs` — the object model (`Focus/Question/Link/Stance/Scope/Act`,
  `Canonical{ objects, timeline }`).
- `validate.rs` — cross-record resolution + semantic lints.
- `derive.rs` — the evaluation layer (supersession, timeline, confidence, status).
- `ids.rs` — deterministic id generation (`from-relation-to`, `agent-posture-target`,
  `-2` suffix on collision).
- `integration_tests.rs` — end-to-end + per-phase tests + the strict-clean guard.
- `main.rs` — CLI (clap, behind `cli` feature).

**Web (`tools/thoughtml-web/src/`)**
- `parse.ts` — TS mirror of the canonical types + wasm adapter + `parseTime`,
  `assertedAt`, `formatValue`.
- `graph.ts` — Cytoscape projection: `buildElements`, `buildStyle`, `REL_STYLE`/
  `relationCategory`, overlays (`applyAsOf`, `setHeat`, `setStatus`).
- `detail.ts` — node detail panel (facts, bars, chips, glyphs).
- `main.ts` — app shell: pipeline, lens control, legend, as-of slider, examples.
- `icons.ts` — `ICONS` (toolbar) + `GLYPHS` (postures/kinds/severities) + `glyph()`.
- `editor.ts` — CodeMirror highlight (mirrors vocab) + lint gutter + theming.
- `diagnostics.ts` — diagnostics list rows.
- `examples.ts` — bundled example sources (mirror `parser-rs/examples/*.thml`).
- `styles.css` — "graphite mono" design tokens (dark + light) + all components.
- `index.html` — DOM shell (clusters, drawer, panes).

---

## 7. Gotchas / lessons learned
- **wasm builds:** use the **rustup** toolchain (`$env:USERPROFILE\.cargo\bin`
  on PATH), not a standalone MSVC rust, or `wasm-pack` picks the wrong toolchain.
- **Adding a field to canonical structs:** update *every* construction site in
  `desugar.rs` (focus + 4 link sites + question + stance). The `infers` link is
  indented deeper — `replace_all` on a 12-space block won't hit the 16-space one.
  Grep-count the field afterward.
- **Examples masking edits in the playground:** the app persists source to
  `localStorage['thoughtml:src']`; after editing `examples.ts`, run
  `localStorage.clear()` + reload (or click the example pill) before verifying.
- **Screenshots time out** on this app's Vite HMR websocket. Verify via
  `preview_eval` (introspect Cytoscape `window.thoughtmlGraph`, computed styles,
  parse JSON) and have the user confirm aesthetics visually.
- **Kind merge semantics (Phase 1):** an explicit `kind` field is authoritative
  + sticky; a posture-inferred kind is provisional and a later posture refines
  it silently; only two *explicit* kinds that disagree warn. (A naive
  first-wins+warn rule breaks `decision-record`'s `considers`→`chooses`.)
- **Opt-in keeps golden output stable**, but the **wasm turns derivations ON** —
  so playground JSON intentionally differs from `thoughtml` CLI default output.

---

## 8. Per-phase execution rhythm (the loop)
1. Design the canonical/spec shape; add the `Options` flag (default off).
2. Parser: model + desugar + derive/validate; CLI flag; **wasm enables it**.
3. Tests: unit + integration; keep `bundled_examples_are_strict_clean` green.
4. `cargo test` → rebuild wasm (rustup) → `npm run build`.
5. Web: types in `parse.ts`, graph/detail rendering, a lens if it's an overlay.
6. Verify in the playground via `preview_eval`; check zero console errors.
7. Spec: add the §section + §17 changelog entry.
8. Add a showcase example if the feature reads best end-to-end.

Ship in order **6 → 7 → 8 → 9**, then **Phase S**, then the **formal capstone**.
Phases 7+8 are the headline "executable document" leap; Phase 8 is the biggest
single lift — land its evaluator with tests before any UI.
