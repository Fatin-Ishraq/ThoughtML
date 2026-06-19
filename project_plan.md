# ThoughtML V0 Draft Specification

Status: draft  
Version: 0.0.1-draft  
Date: 2026-06-09

## 1. Purpose

ThoughtML is a plain-text language for writing reasoning as readable actions
that compile into a graph of foci, questions, links, stances, and scopes.

ThoughtML is designed to represent:

- thoughts before they become claims
- questions and missing knowledge
- relationships between ideas
- evidence and counter-evidence
- uncertainty
- decisions and blockers
- agent memory
- multi-agent disagreement

ThoughtML is not:

- a markdown replacement
- a prose parser
- a JSON alternative
- a graph database dump
- a complete ontology of thought
- a UI or document layout format

## 2. Design Requirements

A valid ThoughtML implementation should preserve these properties:

- Human writable
- Human readable
- Machine parseable
- AI friendly
- Graph native
- Extensible
- Minimal

Structural parsing must not require AI inference. AI tools may operate after
parsing to suggest links, summarize foci, detect contradictions, or explain a
reasoning graph.

## 3. Language Layers

ThoughtML has two layers.

### 3.1 Human Surface

The human surface is the preferred authoring syntax. It uses readable action
headers and indented body text:

```thoughtml
team suspects deploy-change causes metric-shift as deploy-cause
  confidence 0.25..0.70
```

### 3.2 Canonical Core

The canonical core is the normalized interchange model. The surface form above
desugars to:

```thoughtml
focus deploy-change
focus metric-shift
link deploy-cause: deploy-change causes metric-shift
stance team suspects deploy-cause
  confidence 0.25..0.70
```

Implementations must be able to emit the canonical core model.

## 4. Core Primitives

ThoughtML v0 defines five required primitives:

```text
focus
question
link
stance
scope
```

Implementations may also emit:

```text
act
```

for source-preserving authoring events.

### 4.1 Focus

A `focus` is anything under attention. It is not necessarily true, accepted,
complete, or actionable.

Examples:

```thoughtml
focus metric-shift
  Activation metric increased after deployment.
```

Readable action equivalent:

```thoughtml
team noticed metric-shift
  Activation metric increased after deployment.
```

Derived concepts such as claim, observation, idea, option, action, memory, and
risk are represented as foci plus stances and links.

A focus may carry an optional **kind** (v0.2) — its semantic category
(`observation`, `claim`, `decision`, …; see §12.3). The kind is inferred from
the posture that introduces it (`noticed` → observation, `chooses` → decision,
…) or declared explicitly with a `kind` field. An explicit kind is
authoritative; a posture-inferred kind is provisional and a later posture may
refine it (e.g. `considers` then `chooses` promotes an option to a decision).

A focus may also carry an optional **quantity** (v0.2) — a typed numeric measure
such as `200 ms` or `1200 USD`, classified by dimension and normalized where the
unit converts (see §4.7).

A focus (like any belief) may be **superseded** by a later revision (v0.2,
§8.8); both are kept so the reasoning's history stays inspectable.

### 4.2 Question

A `question` is a structured absence in the reasoning graph.

```thoughtml
question cause-of-metric-shift
  What caused metric-shift?
  expects cause
  status open
```

Questions may block decisions, organize candidate answers, or define expected
answer types.

### 4.3 Link

A `link` is a typed relationship between two targets.

```thoughtml
link deploy-cause: deploy-change causes metric-shift
link dashboard-bug undercuts deploy-cause
```

Links may target foci, questions, or other links.

A link may carry an optional **weight** in 0..1 (v0.2) — how strongly the
relation holds — set by a `weight` field or a `strongly` / `weakly` adverb
before the relation (`link a strongly supports b`).

### 4.4 Stance

A `stance` records an agent's posture toward a target.

```thoughtml
stance team suspects deploy-cause
  confidence 0.25..0.70
```

The target may be a focus, question, link, stance, or scope.

### 4.5 Scope

A `scope` defines a context boundary.

```thoughtml
scope incident-742
```

Scopes may represent projects, conversations, simulations, scenarios,
documents, or validity regions.

**Nesting & membership (v0.2).** Records indented under a `scope` header are its
**members**: the scope's `includes` lists the direct children in source order.
A member may be a focus, question, link, stance, or nested sub-scope, so a scope
can hold a whole branch of reasoning and sub-scopes form a tree.

```thoughtml
scope incident-993
  source pagerduty
  observed-at 2026-02-11T09:00Z

  focus latency-spike
    Checkout p99 latency tripled.

  scope mitigation
    observed-at 2026-02-11T09:45Z
    focus rollback
      Roll back the deploy.
```

Nesting is opt-in and detected purely by indentation, so every flat document
parses unchanged. Only a `scope` confers membership; nested headers under any
other record are a warning (they still desugar at the top level).

**Nesting is organization, not visibility.** All ids share one flat namespace and
references resolve **globally** regardless of where they sit — a `link` inside one
scope may freely point at a focus in another (the grand-tour `signals` scope
links to foci its `decision` scope owns). Nesting confers exactly two things:
scope **membership** (`includes`) and **inheritance** of the provenance/temporal
context below. It does *not* sandbox names or restrict what a member may reference.

**Inheritance.** A member inherits its scope's provenance/temporal context —
`asserted-at`, `observed-at`, `source`, `valid-during` — unless it sets its own
(member wins). Inheritance cascades through sub-scopes with the innermost value
taking precedence: above, `rollback` inherits `source pagerduty` from
`incident-993` but `observed-at` from `mitigation`. No other fields inherit.
Inherited values are materialized onto the member, so they feed the document
timeline (§10.2) like any authored timestamp.

### 4.6 Act

An `act` is an optional implementation object that preserves an authored action
before desugaring.

Example conceptual object:

```text
Act(team-suspects-deploy-cause, suspects, [team, deploy-change, causes, metric-shift])
```

`act` is not required for v0 interoperability.

### 4.7 Quantities (v0.2)

A focus may carry a **quantity** — a typed numeric measure — via a `quantity`
field of the form `<number> <unit>` (a fused `200ms` is also accepted):

```thoughtml
focus latency-budget
  The p99 latency SLO we must stay under.
  quantity 200 ms

focus monthly-cost-per-instance
  quantity 1200 USD
```

The desugarer promotes the field to a typed `Quantity { value, unit, dimension,
normalized?, base_unit? }` and classifies the unit into a **dimension**:

- **Physical** dimensions convert: `time` (base `s`) and `information` (base `B`,
  decimal `KB/MB/GB/TB` and binary `KiB/MiB/GiB`), plus `ratio` for `%`. These
  carry a `normalized` value in the dimension's `base_unit`.
- **Currency** is distinct per code — `currency:USD`, `currency:EUR` — and does
  **not** convert (there are no exchange rates in v0.2), so it has no `normalized`.
- A compound `a/b` unit (`req/s`, `MB/s`) is an opaque `rate`; any other bare word
  is a `count:<unit>` (e.g. `count:users`) — comparable only to the same unit.

Quantities are **authored, never derived** — the same separation the evaluation
layers keep (§10.3–§10.5). Normalization makes same-dimension quantities
comparable and is the substrate the **formula** layer (§4.8) computes over. A
malformed `quantity` warns (never errors) and yields no measure. The playground
shows the value + unit on the node and the dimension + normalized value in the
detail panel.

### 4.8 Formulas (v0.2)

A focus may compute its value instead of stating it, with a `= <expr>` line —
the point at which a document becomes **executable**:

```thoughtml
focus monthly-compute
  = cost-per-instance * instances

focus gross-margin
  = (revenue - monthly-total) / revenue
```

The expression is evaluated over other foci's quantities into a separate
**`computed_quantity`** (opt-in; CLI `--formulas`), leaving any authored
`quantity` untouched — computed and authored never conflate. Grammar:

```text
expr    := term (('+' | '-') term)*
term    := unary (('*' | '/') unary)*
unary   := '-' unary | primary
primary := number [unit] | ident '(' expr (',' expr)* ')'   (min / max)
         | ident | '(' expr ')'
```

An `ident` references another focus by id; a bare `number` is dimensionless; a
`number unit` is an inline literal (simple units only — a compound `a/b` literal
collides with the division operator, so model those as a focus). Subtraction must
be space-delimited (`a - b`), since `a-b` is a single kebab-case id.

Evaluation carries a **dimensional signature** (§4.7) through every operation:
`+`/`-` require matching dimensions (after normalization, so `200 ms + 1 s` is
fine); `*`/`/` combine them, so `USD/instance × instance = USD`, the byte
conversions in `USD/GB × GB` cancel, and a ratio of two costs is dimensionless.
The result's display unit is derived from the signature and rendered in a
human-friendly form (`8 GB`, not `8000000000 B`), so a computed value reads like
an authored one.

Formula foci are evaluated in **dependency order** (a formula sees its inputs'
computed values); diagnostics — never errors — report parse failures, unresolved
or quantity-less references, dimension mismatches, and dependency **cycles**.
A formula's references count as graph connections (§10.1 orphan check). This is
the substrate for **decision EV** (§4.9): options × outcomes × probabilities.

### 4.9 Decision EV (v0.2)

Quantities and formulas make a document *compute*; decision EV makes it *choose*.
An **option** focus carries `leads-to` edges to **outcome** foci; each edge states
a `probability`, and each outcome carries a payoff — its computed quantity (§4.8)
if a formula produced one, else its authored quantity (§4.7):

```thoughtml
focus launch-now
  kind option
link launch-now option-of go-to-market

focus blockbuster
  quantity 900000 USD
focus stumble
  quantity -200000 USD

link launch-now leads-to blockbuster
  probability 0.4
link launch-now leads-to stumble
  probability 0.6
```

The option's **expected value** is the probability-weighted sum of its outcomes'
payoffs (`0.4·900000 + 0.6·(−200000) = 240000 USD`), computed with full
dimensional analysis (§4.7) — every outcome of one option must share a dimension.
A `leads-to` edge that omits `probability` falls back to the outcome's derived
confidence (§10.3), so belief can stand in for an explicit likelihood.

A **decision** focus, named by the `option-of` edges that point at it, ranks its
options by expected value and records the highest as the recommended `best`.
Results land in `expected_value` (per option) and `decision` (the ranking) —
opt-in (CLI `--decisions`), derived, and separate from authored values; the
arithmetic is detailed in §10.6.

Each `expected_value` carries a per-outcome breakdown, its probability mass, and
its worst-case `downside`; the decision records the winning `margin`. The kinds
`outcome` / `option` / `decision` are inferred from these edges where unstated
(§12.3), and a what-if (§10.5) recomputes the whole stack — mute an outcome or a
piece of evidence and the expected values re-derive.

## 5. Lexical Rules

### 5.1 Encoding

ThoughtML files must be UTF-8.

### 5.2 Lines

A file is a sequence of lines. A line is one of:

```text
blank
comment
top-level header
indented block line
```

### 5.3 Comments

Comments begin with `#` and continue to the end of the line.

```thoughtml
# This is a comment.
```

Comments are ignored by canonical parsing but should be preserved by tools that
round-trip source files.

### 5.4 Indentation

Indented block lines belong to the preceding top-level header.

V0 requires spaces for indentation. Tabs are invalid.

Implementations should accept two or more spaces for a block line. A file should
use consistent indentation within a block.

### 5.5 Identifiers

Identifiers must use lowercase kebab-case:

```text
[a-z][a-z0-9-]*
```

Examples:

```text
metric-shift
deploy-cause
conversation-2026-06-09
```

### 5.6 Symbols

Symbols use the same lexical form as identifiers:

```text
[a-z][a-z0-9-]*
```

Symbols are used for relations, postures, statuses, and expected answer types.

### 5.7 Values

V0 recognizes these value forms:

```text
text        unkeyed body line or quoted string
symbol      open, cause, high
number      0, 1, 0.72
range       0.25..0.70
unknown     ?
ref         identifier
uri         uri:https://example.invalid/source
time        ISO-8601 date or timestamp
list        comma-separated identifiers or symbols
```

## 6. Record Grammar

This grammar is intentionally simple and line-oriented.

```text
file              := line*
line              := blank | comment | record
record            := top-header block?
block             := (indented-line | nested-record)+
nested-record     := record            ; a record indented under this one (v0.2)

top-header        := scope-header
                   | question-header
                   | action-header
                   | core-header

scope-header      := "scope" id
question-header   := "question" id

core-header       := focus-header
                   | link-header
                   | stance-header

focus-header      := "focus" id
link-header       := "link" link-id? from adverb? relation to
stance-header     := "stance" stance-id? agent posture target
adverb            := "strongly" | "weakly"

link-id           := id ":"
stance-id         := id ":"

action-header     := agent action-form
```

### 6.1 Readable Action Headers

```text
action-form       := noticed-form
                   | considers-form
                   | suspects-form
                   | infers-form
                   | asks-form
                   | holds-form
                   | chooses-form
                   | rejects-form
                   | revises-form
                   | remembers-form
                   | doubts-form
                   | accepts-form

noticed-form      := "noticed" id
considers-form    := "considers" id
suspects-form     := "suspects" id relation id alias?
infers-form       := "infers" id "from" id-list
asks-form         := "asks" id
holds-form        := "holds" id
chooses-form      := "chooses" id
rejects-form      := "rejects" id
revises-form      := "revises" id
remembers-form    := "remembers" id
doubts-form       := "doubts" id
accepts-form      := "accepts" id

alias             := "as" id
id-list           := id ("," id)*
```

## 7. Block Grammar

Block lines are either body text or field phrases.

```text
block-line        := body-line | field-line
```

The first unrecognized indented line is body text. Consecutive body lines are
joined with newline characters.

Known field phrases:

```text
note VALUE
kind SYMBOL
about REF-LIST
weight VALUE
confidence VALUE
because REF
answers REF
expects SYMBOL
status SYMBOL
until REF
until REF STATUS
source VALUE
observed-at TIME
asserted-at TIME
valid-during VALUE
noted-by AGENT
noticed-by AGENT
suspected-by AGENT
chosen-by AGENT
blocked-by REF
undercut-by REF
```

`note` (v0.1) is a free-text annotation. Unlike body text — which for a
focus-creating action attaches to the *focus* — a `note` always attaches to the
record it appears under, and for a readable action header it always attaches to
the resulting *stance*, regardless of posture. This gives focus-creating
postures (`holds`, `chooses`, …) a place to record the rationale of the act
itself, separate from the description of the thing being decided.

`kind` (v0.2) sets a focus's semantic category (§12.3). `about` (v0.2) takes one
or more ids and populates a `question`'s `asks_about` set (§13). `weight` (v0.2)
sets a link's relation strength as a number in 0..1; an explicit `weight` field
overrides a `strongly`/`weakly` adverb (§4.3).

Unknown field-like lines should be preserved as fields and reported as warnings
under strict v0 validation.

## 8. Desugaring Rules

Readable action headers compile into canonical records.

### 8.1 Noticed

Input:

```thoughtml
team noticed metric-shift
  Activation metric increased after deployment.
```

Canonical:

```thoughtml
focus metric-shift
  Activation metric increased after deployment.

stance team noticed metric-shift
```

### 8.2 Suspects

Input:

```thoughtml
team suspects deploy-change causes metric-shift as deploy-cause
  confidence 0.25..0.70
```

Canonical:

```thoughtml
focus deploy-change
focus metric-shift
link deploy-cause: deploy-change causes metric-shift
stance team suspects deploy-cause
  confidence 0.25..0.70
```

If no alias is provided, the parser must generate a stable link id.

### 8.3 Infers

Input:

```thoughtml
assistant infers user-values-standards-thinking from user-prefers-readable-syntax
  confidence 0.65
```

Canonical:

```thoughtml
focus user-values-standards-thinking
link user-prefers-readable-syntax supports user-values-standards-thinking
stance assistant infers user-values-standards-thinking
  confidence 0.65
```

For multiple inputs, the parser creates one `supports` link for each source id.

### 8.4 Holds

Input:

```thoughtml
team holds rollback-decision
  until cause-of-metric-shift answered
```

Canonical:

```thoughtml
focus rollback-decision
stance team holds rollback-decision
link cause-of-metric-shift blocks rollback-decision
```

The `answered` status is preserved as a field on the generated blocking link.

### 8.5 Chooses

Input:

```thoughtml
team chooses investigate-sampling
  Investigate sampling change first.
  because cause-of-metric-shift
```

Canonical:

```thoughtml
focus investigate-sampling
  Investigate sampling change first.

stance team chooses investigate-sampling
  because cause-of-metric-shift
```

### 8.6 Remembers

Input:

```thoughtml
assistant remembers current-front-runner
  Human action syntax should compile into the canonical core.
  confidence 0.80
```

Canonical:

```thoughtml
focus current-front-runner
  Human action syntax should compile into the canonical core.

stance assistant remembers current-front-runner
  confidence 0.80
```

### 8.7 Doubts And Accepts

Input:

```thoughtml
bob doubts deploy-cause
  confidence 0.60
```

Canonical:

```thoughtml
stance bob doubts deploy-cause
  confidence 0.60
```

`accepts` follows the same pattern.

### 8.8 Revises (v0.2)

`revises` expresses **supersession** — a later belief replacing an earlier one.
Nothing is deleted: a revision is a new belief layered over the old, so the
history stays inspectable (and the as-of view, §13, can replay it).

As a **posture**, `agent revises X` records a fresh stance on `X`; the agent's
most recent prior stance on `X` is marked `superseded_by` the new one.

```thoughtml
analyst suspects a causes b as claim
  confidence 0.7
analyst revises claim
  confidence 0.3
```

The `suspects` stance gains `superseded_by: analyst-revises-claim`.

As a **relation**, `new revises old` marks the `old` node `superseded_by: new`.

```thoughtml
link july-14-target revises june-30-target
```

`june-30-target` gains `superseded_by: july-14-target`. `superseded_by` is a
derived field (§10.2), not authored directly.

## 9. Canonical Object Model

A parser must emit or be able to emit the following canonical model.

```text
Focus
  id: ID
  kind?: Symbol         # v0.2: semantic category (§12.3)
  quantity?: Quantity   # v0.2: typed numeric measure (§4.7)
  formula?: Text        # v0.2: authored `= expr` (§4.8)
  computed_quantity?: Quantity  # v0.2: evaluated formula, opt-in (§4.8)
  body?: Text
  fields: Map
  superseded_by?: Ref   # v0.2: set by a revision (§8.8, §10.2)
  derived_confidence?: Number  # v0.2: propagated from evidence (§10.3)
  argument_status?: Symbol     # v0.2: in / out / undecided (§10.4)
  expected_value?: ExpectedValue  # v0.2: option EV + breakdown, opt-in (§10.6)
  decision?: DecisionEV        # v0.2: ranking on a decision focus, opt-in (§10.6)

Quantity                # v0.2 (§4.7)
  value: Number
  unit: Symbol
  dimension: Symbol     # time | information | ratio | currency:CODE | rate | count:UNIT
  normalized?: Number   # value in base_unit, when the unit converts
  base_unit?: Symbol

ExpectedValue           # v0.2 (§10.6): an option's expected-value analysis
  value: Number         # Σ probability · payoff, in `unit`
  unit: Symbol
  dimension: Symbol
  probability_mass: Number  # Σ probability over outcomes (≤ 1 when exhaustive)
  downside: Number      # worst-case outcome payoff
  terms: EvTerm*        # per-outcome contributions

EvTerm                  # v0.2 (§10.6)
  outcome: Ref
  probability: Number
  payoff: Number
  contribution: Number  # probability · payoff

DecisionEV              # v0.2 (§10.6): expected-value analysis on a decision
  ranked: OptionEV*     # options, highest expected value first
  best: Ref             # the recommended (max-EV) option
  margin?: Number       # how decisively `best` beats the runner-up

OptionEV                # v0.2 (§10.6)
  option: Ref
  value: Number
  unit: Symbol
  downside: Number

Question
  id: ID
  body?: Text
  asks_about: Ref*
  expects?: Symbol
  status?: Symbol
  fields: Map
  superseded_by?: Ref   # v0.2

Link
  id: ID
  from: Ref
  relation: Symbol
  to: Ref
  weight?: Number       # v0.2: relation strength in 0..1 (§4.3)
  probability?: Number  # v0.2: outcome likelihood on a leads-to edge (§10.6)
  body?: Text           # v0.1: prose explaining why the relation holds
  fields: Map
  superseded_by?: Ref   # v0.2
  derived_confidence?: Number  # v0.2: propagated from evidence (§10.3)
  leverage?: Number            # v0.2: load-bearing sensitivity (§10.5)
  argument_status?: Symbol     # v0.2: in / out / undecided (§10.4)

Stance
  id: ID
  agent: Ref
  posture: Symbol
  target: Ref
  confidence?: Value
  fields: Map
  superseded_by?: Ref   # v0.2

Scope
  id: ID
  includes?: Ref*
  fields: Map

Act
  id: ID
  agent?: Ref
  verb: Symbol
  args: Value*
  expands_to?: Ref*
  fields: Map
```

The model may also carry a derived document **timeline** (v0.2) — the earliest
and latest timestamps across every `asserted-at` / `observed-at` /
`valid-during` field, as raw source strings:

```text
timeline?: { start: Time, end: Time }
```

## 10. Validation Rules

A v0 parser must validate:

- Top-level headers must match the grammar.
- Tabs in indentation are invalid.
- Explicit references should resolve within the file, import set, or declared
  external namespace.
- `link.from` and `link.to` may target foci, questions, or links.
- `stance.target` may target foci, questions, links, stances, or scopes.
- `question` records should include body text or an `asks-about` style field.
- Unknown top-level record kinds are invalid.
- Unknown fields are preserved and may produce warnings.
- Confidence values must be scalar numbers, ranges, or `?`.
- Range confidence values must be ordered from low to high.
- `valid-during` spans must be ordered from start to end (v0.2).
- A `revises` relation should not be asserted before the node it revises (v0.2).

### 10.1 Semantic Lints (v0.1)

Beyond the structural checks above, a parser should emit warnings (never hard
errors — a draft in progress may legitimately trip them) for these consistency
problems, which require the whole object graph:

- **Contradiction** — one agent holding mutually exclusive postures on the same
  target, e.g. `accepts` together with `rejects`, `accepts` with `doubts`, or
  `holds`/`chooses` with `rejects`.
- **Cycle** — a directed cycle among `causes` / `depends-on` links (a chain that
  depends on itself). The warning should name the cycle path.
- **Orphan** — a `focus` that nothing in the graph connects to: no link touches
  it, no stance targets it, and no field references it. Usually a typo or an
  unfinished thought.

### 10.2 Temporal & Revision (v0.2, derived)

After validation, a parser may compute two derived facts — pure functions of the
canonical model, so default output is unchanged for documents without revisions
or timestamps:

- **Supersession.** Each `revises` relation and `revises` posture sets the
  `superseded_by` field of the belief it replaces (§8.8). Both beliefs are kept.
- **Timeline.** The document's `{ start, end }` span across all `asserted-at` /
  `observed-at` / `valid-during` timestamps (§9).

Timestamps are compared as whole seconds from the Unix epoch, computed with
exact proleptic-Gregorian civil-date math. A trailing zone designator (`Z`,
`±hh`, `±hhmm`, `±hh:mm`) is normalized to UTC — so `…T00:00+05:00` correctly
precedes `…T00:00Z` — while a stamp with no zone is read as written; a less
precise stamp (`2026-06`) sorts at the first instant it could denote. These
facts drive the playground's **as-of view** (§13): a slider that replays the
argument at any instant, hiding assertions not yet made and dimming beliefs
already superseded.

### 10.3 Derived Confidence (v0.2, derived, opt-in)

The reasoning graph can be *evaluated*, not just drawn. A focus or link that is
the target of evidence gets a `derived_confidence` ∈ (0, 1), computed by
propagating belief through the evidence graph. It is **strictly separate** from
authored confidence — the engine reasons *from* what the author stated, never
restating it — and is opt-in so default output is unchanged.

**Evidence** is the relations `supports` (+1), `opposes` (−1), `undercuts` (−1).
For a target *T* with incoming evidence links *eᵢ*:

```text
derived(T) = logistic( G · Σᵢ polarityᵢ · weightᵢ · believedness(sourceᵢ) )
```

- `G` is a fixed gain (2.0), chosen so one strong support ≈ 0.85.
- `weightᵢ` is the link's weight (§4.3), defaulting to 0.5.
- `believedness(s)` is `derived(s)` if it has one (so belief propagates
  transitively through chains), else the mean midpoint of the **non-superseded**
  (§10.2) stances that carry a confidence and target *s*, else 1.0 — an
  unqualified assertion counts as given.
- `logistic(x) = 1 / (1 + e⁻ˣ)` keeps the result bounded and monotonic.

Targets are evaluated in topological order over the evidence graph, so premises
resolve before the claims they back; evidence cycles fall back to a single
best-effort pass. The result is deterministic. The playground contrasts authored
vs. derived as two bars and offers an **evidence-heat** overlay colouring claims
by `derived_confidence`.

### 10.4 Argument Status (v0.2, derived, opt-in)

Where §10.3 asks *how strong*, this asks *does it survive*. Over the **attack**
relations `undercuts` / `opposes` / `rejects` / `mitigates`, the engine computes
the grounded extension of abstract argumentation (Dung 1995) and labels every
claim that takes part in the attack graph:

- **in** (accepted) — every attacker is `out` (vacuously so if it has none);
- **out** (defeated) — at least one attacker is `in`;
- **undecided** — neither holds (e.g. a mutual attack / odd cycle).

`mitigates` is a **defense** (Phase 5 review): there is no separate defense
operator because "defend X" is just "attack X's attacker." So `guard mitigates
risk` with `risk opposes option` makes the guard attack the risk; an accepted
guard defeats the risk, which reinstates the option the risk attacked. An
`undercuts` edge aimed at a *link* defeats that **inference** (§10.3 also weakens
its weight), which a node-targeting `opposes` cannot do.

The labelling is the least fixpoint, so it is unique and deterministic. `supports`
links play no part here — support strength is §10.3's concern; this is purely the
structure of attack and defence. Stored as `argument_status`, opt-in (CLI
`--status`). The playground shows an accepted/defeated/undecided badge and an
overlay outlining nodes by status. The two evaluations corroborate each other: on
the bundled AI-and-jobs argument the displacement hypothesis is both `in` and
derived ≈ 0.94, while the "technology creates jobs" rebuttal is both `out` and
≈ 0.22.

### 10.5 Sensitivity & What-if (v0.2, derived, opt-in)

§10.3 evaluates the graph *as written*; this asks the counterfactual — **what if
an input were different?** Both run on one pure engine: the §10.3 propagation,
refactored to take a set of **overrides** (links/nodes removed from the evidence
and attack graphs) and return the derived confidences. Run it once over the
authored graph for §10.3; run it again over a perturbed graph for what-if.

**Sensitivity** is that counterfactual precomputed for every single edge. Each
evidence link *e* into a target *T* gets a `leverage`:

```text
leverage(e) = derived(T) − derived_without_e(T)
```

— the confidence *T* would lose if *e* alone were removed. A target left with no
evidence falls to the model's neutral point (0.5, since `logistic(0)`). Positive
leverage means *e* props *T* up (a support); negative means it drags *T* down (an
attack); the magnitude is how much the conclusion rests on that one edge. So a
sole support carries its target's full lift, while each of several redundant
supports carries little — removing any one leaves the others. Stored as
`leverage`, opt-in (CLI `--sensitivity`); deterministic, and strictly separate
from authored values.

**What-if** exposes the same override hook interactively. The playground re-parses
through a `parse_what_if(src, { disabled_links, disabled_nodes })` entry point;
disabled nodes/links drop out of both the evidence and the attack graphs, and
`derived_confidence`, `argument_status`, and `leverage` are all recomputed for the
counterfactual. The playground ranks a claim's incoming evidence by leverage
("load-bearing evidence"), offers a **Load** lens that thickens edges by
`|leverage|`, and lets you **mute** a node/link to watch every derived value
recompute against the baseline. Muting reaches the computational layer too: a
muted node drops out of formulas (§4.8) and expected-value sums (§10.6), so a
what-if re-derives confidence, status, leverage, formulas, and EV together.

### 10.6 Decision EV (v0.2, derived, opt-in)

The computational track's capstone. Where §10.3 asks *how strongly is this
believed?* and §4.8 asks *what does this compute to?*, decision EV asks *which
option is best?* — composing the two into an expected-value decision model.

An **option** focus carries `leads-to` edges to **outcome** foci. For an option
*O* whose outcomes *oᵢ* are reached with probability *pᵢ* and pay off *vᵢ*:

```text
EV(O) = Σ pᵢ · vᵢ
```

*pᵢ* is the edge's authored `probability`, or — absent that — the outcome's
`derived_confidence` (§10.3), so belief can stand in for an explicit likelihood.
(An earlier `conditioned-on` bridge — letting *pᵢ* equal a separate *claim's*
derived confidence — was removed in the day-two review as a type error: an
argumentation acceptability-degree is not a decision probability and must not
silently become one. See §17.)

*vᵢ* is the outcome's `computed_quantity` (§4.8) if a formula produced one, else
its authored `quantity` (§4.7), taken in base units with its dimensional
signature; all of one option's payoffs must share a dimension (you cannot average
dollars with milliseconds). The result is stored as the option's `expected_value`.

A malformed decision subgraph is linted (Phase 5 review): a `leads-to` self-loop
(`x leads-to x`), and a **mixed** decision where some options carry outcomes and a
sibling does not — that bare option would be silently dropped from the ranking, so
it warns. (A decision where *no* option has outcomes is a fine pure-choice
decision and is not flagged.)

A **decision** focus is named by the `option-of` edges that target it. Its options
(those with an expected value, all of one dimension) are ranked highest-first into
`decision.ranked`, and the top one recorded as `decision.best` — the recommended
choice. Opt-in (CLI `--decisions`), deterministic, and strictly separate from
authored values. Diagnostics — never errors — report a missing payoff or
probability, a dimension clash between outcomes, or a probability mass above 1.

Beyond the headline value, each `expected_value` keeps a per-outcome **breakdown**
(`probability · payoff`), its **probability mass**, and its worst-case **downside**
— decisions weigh risk, not just the mean — and a decision records the **margin**
by which the winner leads. A what-if (§10.5) reaches here: muting an outcome or an
input re-derives every expected value. The whole computational stack — confidence,
status, leverage, formulas, and EV — comes on with one CLI flag, `--compute`.

The playground shows each option's EV and breakdown, ranks a decision's options
("options by expected value") with the winning margin, and offers a **Decision**
lens that rings the recommended option.

### 10.7 Conflict Report — the Mirror (v0.2, derived, opt-in)

The engines above each produce a reading; this pass turns those readings back on
the author. ThoughtML is a **mirror, not an oracle**: it does not tell you which
option to pick — it tells you where your own stated beliefs disagree with the
structure you wrote, and leaves the resolution to you ("ship the conflict, not the
verdict"). The conflict report is a separate channel from diagnostics (§10.1):
diagnostics judge the document's *form*, conflicts judge its *coherence*. A
document can be diagnostically clean yet full of conflicts — that is the
interesting case, and the point of the tool.

A `conflict` carries a `kind`, a `severity`, the `subjects` it concerns, and a
message stating author-said-X / structure-computes-Y. It never prescribes a fix or
names a winner. v1 ships one type:

- **`confidence-vs-status`** — an authored stance asserts high confidence (≥ 0.66)
  in a node the grounded attack graph (§10.4) marks `out` (defeated), or low
  confidence (≤ 0.34) in one marked `in` (accepted). *"You assert 0.9 in a claim
  your own evidence defeats."*

Stored under a top-level `audit` key; opt-in (CLI `--audit`, on in the playground
and folded into `--compute`). The pass reads `argument_status`, so it ensures that
ran. The `self-audit.thml` example is the canonical demo: zero diagnostics, one
conflict (an agent holding a defeated claim at 0.9). Future conflict types are
designed but unbuilt — provenance-thin (a conclusion resting only on
`assumption`-typed inputs), unresolved-attack-on-load-bearing, and a calibration
ledger scoring the author's own resolved forecasts (§17).

## 11. Generated IDs

When a readable action creates an implicit canonical object, the parser should
generate a deterministic lowercase kebab-case id.

Generated link ids should use:

```text
FROM-RELATION-TO
```

Example:

```thoughtml
team suspects deploy-change causes metric-shift
```

creates:

```text
deploy-change-causes-metric-shift
```

Generated stance ids should use:

```text
AGENT-POSTURE-TARGET
```

Example:

```thoughtml
team noticed metric-shift
```

creates:

```text
team-noticed-metric-shift
```

If the generated id already exists, append a numeric suffix starting at `-2`:

```text
deploy-change-causes-metric-shift
deploy-change-causes-metric-shift-2
deploy-change-causes-metric-shift-3
```

Authors should use explicit aliases when a link needs to be stable across major
edits:

```thoughtml
team suspects deploy-change causes metric-shift as deploy-cause
```

Generated ids are deterministic for a given parse order, but explicit aliases
are preferred for durable public references.

## 12. Standard Vocabulary

### 12.1 Core Postures

```text
noticed
considers
suspects
infers
asks
holds
chooses
rejects
revises
remembers
doubts
accepts
```

### 12.2 Core Relations

```text
supports
opposes
undercuts
answers
causes
enables
prevents
depends-on
blocks
revises
rejects
mitigates
leads-to
option-of
```

A relation outside this vocabulary is preserved but warns under strict
validation — unless a profile (§12.4) declares it. What each relation *computes*
(a custom/profile relation computes nothing — it is structural only):

| relation     | role        | what the engine does with it                                   |
| ------------ | ----------- | -------------------------------------------------------------- |
| `supports`   | evidence    | raises a target's `derived_confidence` (+1, §10.3)             |
| `opposes`    | evidence + attack | lowers confidence (−1) **and** rebuts the target node (§10.4) |
| `undercuts`  | evidence + attack | on a *node*, −1 evidence (as `opposes`); on a *link*, attacks the **inference** — weakens that connection's weight (§10.3) |
| `rejects`    | attack      | defeats a node in the grounded status graph; not evidence (§10.4) |
| `mitigates`  | attack (defense) | `action mitigates risk` attacks the risk, so mitigating a risk that attacks an option restores that option (§10.4) |
| `revises`    | supersession | `new revises old` marks `old` superseded; both are kept (§10.2) |
| `leads-to`   | decision EV | option → outcome, carrying a `probability` (§10.6) |
| `option-of`  | decision EV | option → decision, grouping a decision's options (§10.6)       |
| `causes`, `depends-on` | structural | drawn as edges and checked for cycles (§10.1); not numeric |
| `answers`, `enables`, `prevents`, `blocks` | structural | drawn as edges; no computed weight |

**Rebut vs. undercut** (Pollock's distinction, made operational): `opposes`
attacks a *conclusion* — it says the claim is false. `undercuts` attacks an
*inference* — it says a connection doesn't hold. On a node the two coincide
(both −1 evidence); the difference is that `undercuts` may target a **link** (a
named inference), which `opposes` cannot. **`depends-on`** is structural, not
probabilistic: it reads "is evaluated/constrained against," draws the dependency,
and is cycle-checked — it does not feed any expected value or confidence.

`leads-to` / `option-of` / `mitigates` are v0.2; `mitigates`
and the link-targeting of `undercuts` were promoted/clarified in the Phase 5
review (see §17).

### 12.3 Focus Kinds (v0.2)

```text
observation
claim
hypothesis
option
decision
outcome
goal
memory
assumption
action
```

`action` (Phase 5 review) is a thing one *does* — a plan, intervention, or
mitigation — as distinct from a belief (`claim`/`hypothesis`/`assumption`) or a
result (`outcome`). It is explicit-only; no posture infers it. **Kind reflects
epistemic role, not computedness:** a `= formula` focus carries whatever kind its
role calls for — a computed *outcome* used in a decision is `kind outcome`, while
a computed *intermediate* (e.g. a sub-total) legitimately carries none. So two
`=` foci differing in kind is by design, not an inconsistency.

A focus's `kind` (§4.1) is inferred from the posture that introduces it, or set
explicitly with a `kind` field:

| posture     | inferred kind |
| ----------- | ------------- |
| `noticed`   | observation   |
| `considers` | option        |
| `infers`    | claim         |
| `holds`     | decision      |
| `chooses`   | decision      |
| `remembers` | memory        |

Explicit kinds are authoritative and conflicting explicit kinds warn; inferred
kinds are provisional and a later posture refines them silently. An unknown kind
is preserved and warned. v0.2 (Phase 9) also infers from decision-EV edges: the
`to` of a `leads-to` is an `outcome` and its `from` an `option`; the `to` of an
`option-of` is a `decision` — provisional, so an explicit or posture kind wins.

### 12.4 Profiles (v0.2)

A document may declare a **profile** — a dialect that extends the standard
vocabulary so a domain's own terms validate cleanly:

```thoughtml
profile risk-analysis
  kinds risk, mitigation
  relations mitigates
  fields likelihood
  postures flags
```

Each list line adds to the corresponding core set (§12.1–§12.3, §7). With the
profile above, `kind risk`, `link a mitigates b`, a `likelihood` field, and
`stance ops flags port-strike` all pass strict validation; without it each trips
an "unknown …" lint. Profiles are collected before the rest of the document is
checked, so a declaration may sit anywhere; multiple profiles union their lists.
A profile is authored metadata — it serializes as a `profile` object
(`{ name, kinds, relations, fields, postures }`) and is not a graph node.

A custom posture is usable via the explicit `stance` form
(`stance agent posture target`); the readable action shorthand
(`agent posture target`) stays reserved for the core postures.

### 12.5 Imports & Namespaces (v0.2)

A document may **import** another and reference its objects under a namespace:

```thoughtml
import shared-defs as base

link rollout-plan depends-on base.capacity-budget
```

`import <name> as <ns>` pulls in the document the host resolves for `<name>`:
its objects merge in with every id prefixed `ns.`, referenced as `ns.id`. The
host supplies the source set — the CLI reads `<name>.thml` from the entry's
directory, the playground resolves against its bundled examples, and the library
entry point is `parse_project(entry, sources)`. Imports resolve recursively and
namespaces compose (`outer.inner.id`); an import cycle is reported and broken.
Single-document parsing (`parse_str`) leaves `ns.` references unresolved.

v1 limitations: references inside a `formula` expression are not namespace-
rewritten, and agent names stay global (an imported `team` is the same agent).

## 13. Graph Representation

ThoughtML is graph-native. Canonical objects can be projected to a property
graph.

```text
(:Focus {id})
(:Question {id})
(:Link {id, relation})
(:Stance {id, posture, confidence})
(:Scope {id})
(:Agent {id})

(:Link)-[:FROM]->(:Focus|:Question|:Link)
(:Link)-[:TO]->(:Focus|:Question|:Link)
(:Stance)-[:BY]->(:Agent)
(:Stance)-[:TARGETS]->(:Focus|:Question|:Link|:Stance|:Scope)
(:Question)-[:ASKS_ABOUT]->(:Focus|:Link|:Scope)
(:Scope)-[:INCLUDES]->(:Any)
```

Readable projection:

```text
deploy-change --causes--> metric-shift
team --suspects--> deploy-cause
cause-of-metric-shift --blocks--> rollback-decision
```

### 13.1 As-Of View (v0.2)

Because every belief may carry an assertion time and a derived `superseded_by`
(§10.2), the graph can be replayed over time. The playground exposes an **as-of
slider**: at instant *T* it hides objects asserted after *T* and dims beliefs
already superseded by *T*, so a reader can watch the argument evolve — an earlier
stance fading as a later one revises it.

### 13.2 Lenses & What-if (v0.2)

The same graph re-reads under five **lenses**: *Type* (node colour by kind),
*Evidence* (heat by `derived_confidence`, §10.3), *Argument* (outline by
`argument_status`, §10.4), *Load* (edge width by `|leverage|`, §10.5 — the
load-bearing connections stand out from the inert ones), and *Decision* (ring the
recommended option by expected value, §10.6). Selecting a claim also ranks its
incoming evidence by leverage; selecting a decision ranks its options by EV.

**What-if** (§10.5) turns the static picture interactive: muting a node or link
drops it from the evidence and attack graphs and re-derives the whole argument as
a counterfactual, with each claim showing how its confidence moved from the
baseline. It is the readers' answer to "and if this weren't true?".

## 14. Complete Example

Input:

```thoughtml
scope incident-742

team noticed metric-shift
  Activation metric increased after deployment.
  observed-at 2026-06-09T09:20+06:00

question cause-of-metric-shift
  What caused metric-shift?
  expects cause
  status open

team suspects deploy-change causes metric-shift as deploy-cause
  confidence 0.25..0.70
  answers cause-of-metric-shift

team holds rollback-decision
  Rollback the deployment.
  until cause-of-metric-shift answered
```

Canonical shape:

```text
Scope(incident-742)
Focus(metric-shift)
Question(cause-of-metric-shift)
Focus(deploy-change)
Link(deploy-cause, deploy-change, causes, metric-shift)
Stance(team, noticed, metric-shift)
Stance(team, suspects, deploy-cause)
Focus(rollback-decision)
Stance(team, holds, rollback-decision)
Link(cause-of-metric-shift, blocks, rollback-decision)
```

## 15. Known Limitations

Two areas are intentionally left as future feature work (neither is a
correctness gap):

- non-English readable surfaces
- richer / selectable confidence models (a profile is the natural hook, §12.4)

Resolved since the original draft: the canonical JSON encoding is specified
(§16.1) and pinned by a golden test; temporal comparison is zone-aware (§10.2);
nested scopes and scope inheritance ship (§4.5); profile declarations extend the
vocabulary (§12.4); and imports with namespaces compose documents (§12.5).

## 16. Implementation Guidance

A v0 implementation should expose at least:

- parse source text into a surface AST
- normalize surface AST into canonical objects
- emit canonical JSON
- report diagnostics with source line numbers
- preserve enough source information for round-tripping

Recommended next implementation target:

```text
tools/thoughtml-parser-rs
```

The first parser should prioritize correctness, diagnostics, and stable
canonical output over advanced features.

### 16.1 Canonical JSON encoding

The canonical model serializes to a single JSON object. This shape is the wire
contract — the reference parser pins it with a golden snapshot test, so any
change to it is deliberate:

- **Top level.** `{ "objects": [ … ], "timeline"?: { "start", "end" } }`. The
  `timeline` (§10.2) is present only when the document carries timestamps.
- **Order.** `objects` preserves source order; map-valued data with no inherent
  order (a quantity's unit `signature` / `dimension`) is emitted in sorted key
  order, so output is byte-stable across runs and platforms.
- **Object head.** Every object opens with a lowercase `type` tag — one of
  `scope`, `focus`, `question`, `link`, `stance`, `act`, `profile` — followed by
  its `id` (a `profile` carries a `name` instead).
- **Promoted fields** appear unwrapped, as plain JSON: focus `kind`/`body`;
  question `body`/`expects`/`status`/`asks_about`; link `from`/`relation`/`to`/
  `weight`/`probability`/`body`; stance `agent`/`posture`/`target`/`confidence`.
- **Free-form fields** live under a `fields` object, keyed by the lowercase,
  kebab-case surface name (`observed-at`, `valid-during`, `answers`). Each value
  is kind-tagged — `{ "kind": <k>, "value": <payload> }` — where `<k>` is one of
  `text`, `symbol`, `number`, `range`, `ref`, `uri`, `time`, `list` (a `range`
  payload is `[low, high]`; `unknown` carries no `value`).
- **Absent is omitted.** Optional fields are dropped when empty, never emitted as
  `null` — a bare focus is exactly `{ "type": "focus", "id": … }`.
- **Numbers** use the shortest round-tripping decimal (`0.70` serializes `0.7`).
- **Derived keys extend, never reshape.** `superseded_by` (§10.2) and the opt-in
  computational fields — `derived_confidence`, `argument_status`, `leverage`,
  `computed_quantity`, `expected_value`, `decision` (§10.3–§10.6) — add keys to
  the objects above; they never alter the encoding of authored data.
- **Whitespace.** Pretty-printed with two-space indentation by default; the CLI's
  `--compact` flag emits the identical structure on a single line.

## 17. Changelog

Beyond the original v0 draft, the reference implementation adds:

**v0.1**
- `body` prose on `link` records (§9).
- `note` field: posture-independent rationale on stances (§7).
- Semantic lints (warnings): contradiction, cycle, orphan (§10.1).

**v0.2**
- Focus `kind`: semantic category, inferred from posture or explicit (§4.1, §12.3).
- `about` field: populates a question's `asks_about` (§7, §13).
- `Act` provenance objects, emitted opt-in (§4.6; CLI `--acts`).
- Link `weight`: relation strength in 0..1, via `weight` field or
  `strongly`/`weakly` adverb (§4.3).
- Revision & supersession: `revises` relation/posture sets a derived
  `superseded_by`; both beliefs are kept (§8.8, §10.2).
- Temporal layer: derived document `timeline`; `valid-during` ordering and
  revision-before-target lints (§9, §10.2).
- Playground **as-of view**: a time slider that replays the argument, hiding
  not-yet-asserted nodes and dimming superseded ones (§13).
- **Derived confidence**: evidence propagated through `supports`/`undercuts` into
  a `derived_confidence`, separate from authored and opt-in (§10.3; CLI
  `--derived`). Playground shows authored-vs-derived bars + an evidence-heat
  overlay.
- **Argument status**: grounded Dung acceptance (`in`/`out`/`undecided`) over the
  attack graph, opt-in (§10.4; CLI `--status`). Playground shows a status badge +
  an overlay.
- **Sensitivity & what-if**: the propagation engine refactored to a pure function
  with an override hook. Per-evidence `leverage` — how much a target's confidence
  rests on each edge, by single-edge ablation — opt-in (§10.5; CLI
  `--sensitivity`). Playground ranks load-bearing evidence, adds a **Load** lens,
  and lets you mute nodes/links to recompute the argument as a counterfactual
  (wasm `parse_what_if`).
- **Quantities & units**: a focus may carry a typed `quantity` (`200 ms`,
  `1200 USD`), classified by dimension and normalized to a base unit where the
  unit converts; authored, never derived (§4.7). Always-on (parsed during
  desugar). Playground shows the measure on the node and its dimension/normalized
  value in the detail panel. The substrate for the formula layer (Phase 8).
- **Formulas**: a focus may state `= <expr>` to compute its value over other
  foci's quantities, with full dimensional analysis — `+`/`-` require matching
  dimensions, `*`/`/` derive new ones (`USD/instance × instance = USD`). Evaluated
  in dependency order with cycle detection into a separate `computed_quantity`,
  opt-in (§4.8; CLI `--formulas`). The document becomes executable. Playground
  shows the expression and computed result; node labels show the computed value.
- **Decision EV**: an option focus's `leads-to` outcomes — each a `probability`
  and a payoff quantity — are summed into an `expected_value`; a decision focus,
  named by `option-of` edges, ranks its options and records the recommended
  `best`. Composes quantities (§4.7), formulas (§4.8, computed payoffs), and
  derived confidence (§10.3, as a probability fallback), with full dimensional
  checking. Opt-in (§4.9, §10.6; CLI `--decisions`). Playground shows per-option
  EV, a decision ranking, and a **Decision** lens that rings the recommended option.
- **Computational-arc polish** (Phases 6–9 wrap-up): what-if now recomputes
  formulas and EV, not just confidence (mute an outcome and the decision can
  flip); `outcome` joins the focus kinds, inferred from `leads-to` / `option-of`;
  each option's `expected_value` carries a per-outcome breakdown, probability
  mass, and worst-case downside, and decisions a winning `margin`; computed
  values render in human units (`8 GB`, not `8e9 B`); and `--compute` turns the
  whole computational stack on at once.
- **Precision fixes** (§15 wrap-up): temporal comparison is now zone-aware —
  timestamps normalize to UTC seconds via exact civil-date math, so
  `…+05:00` sorts before `…Z` and an offset can cross a day boundary (§10.2);
  and the canonical JSON encoding is specified (§16.1) and locked by a golden
  snapshot test, so the wire shape can no longer drift silently.
- **Nested scopes** (Phase 5, structural): a `scope` can contain other records by
  indentation — the parser is now an indentation tree, fully backward-compatible
  (flat documents parse unchanged). A scope's `includes` lists its direct members
  (foci, questions, links, stances, sub-scopes), and members inherit the scope's
  provenance/temporal fields (`asserted-at`/`observed-at`/`source`/`valid-during`;
  member-wins; cascading innermost-first) (§4.5, §6). The playground draws scopes
  as nested compound boxes in structural view and as scope→member edges in
  readable view; the detail panel lists a scope's members ("Contains").
- **Profiles** (Phase 5, structural): a `profile <name>` record declares a
  dialect — `kinds`/`relations`/`fields`/`postures` lists — that extends the
  standard vocabulary, so a domain's own terms pass strict validation (§12.4).
  The vocabulary lints (unknown kind/field/posture, and a newly-active unknown
  **relation** lint) moved to a post-parse pass that consults the document's
  profiles while keeping each warning at its exact source line. Profiles
  serialize as a `profile` object and are not graph nodes.
- **Imports & namespaces** (Phase 5, structural): `import <name> as <ns>` pulls
  another document's objects in under a namespace, referenced as `ns.id`. A new
  `parse_project(entry, sources)` entry point (wasm `parse_project`; CLI reads
  sibling files; playground resolves against bundled examples) merges the
  documents into one model with ids/refs prefixed `ns.` — uniform prefixing that
  composes for transitive imports — then validates and derives the whole. Import
  cycles are reported and broken; identifiers may now be namespace-qualified with
  dots. This completes the structural track; §15 is down to two optional features.
- **`grand-tour` showcase + `outcome`-kind fix**: a single example that exercises
  the whole language at once — an imported budget, a profile dialect, nested
  scopes with inherited provenance, quantities, a chained formula feeding a
  decision's expected value, graded evidence with an attack, and a revised
  estimate. Building it surfaced that `outcome` — listed in §12.3 and produced by
  edge inference — was missing from the *writable* kind vocabulary; it is now
  accepted as an explicit `kind` too.
- **Phase 5 review** (correctness pass): **`mitigates`** is promoted to a core
  *defense* relation (attacks its target in the grounded status graph, §10.4 — no
  longer a decorative profile relation), and **`undercuts`** gains its Pollock
  distinction from `opposes`: aimed at a *link* it attacks the inference and weakens
  that connection's weight (§10.3, §12.2). A new **`action`** focus kind covers
  plans/interventions (§12.3), and a **decision-graph lint** flags `leads-to`
  self-loops and mixed decisions whose unwired options would be silently dropped
  (§10.6). A new **`why-harvard`** showcase (both options ranked); the spec gains a
  "relations & what each computes" table (§12.2) and clarifies that scope nesting is
  organization, not name-visibility (§4.5). Two review claims were found
  already-satisfied and left alone: strength adverbs are already weighted
  (`strongly` = 0.85, §10.3) and EV already does full dimensional checking (§10.6).
- **Mirror pivot** (day-two review): committed the project's identity to a
  **mirror, not an oracle** ("ship the conflict, not the verdict"), authored by **AI
  agents**. First consequence: the **`conditioned-on` bridge was removed** as a
  type-coercion error — an argumentation acceptability-degree (a `derived_confidence`)
  is not a decision probability and must not silently set one or multiply a payoff.
  The compute engines are being refocused from emitting a verdict to emitting a
  *conflict report* — a second, mechanical reading that disagrees with the author
  ("you asserted high confidence on a node your own structure defeats").
- **Conflict report — the first mirror output** (day-two): a new opt-in `audit`
  pass (CLI `--audit`; on in the playground and folded into `--compute`) emits a
  top-level `audit.conflicts` array, on a separate channel from diagnostics so a
  document can be strict-clean in *form* yet flagged for incoherent *reasoning*
  (§10.7). v1 ships `confidence-vs-status` (high confidence in a defeated node, or
  low in an accepted one). New `self-audit.thml` example demonstrates it — zero
  diagnostics, one conflict (an agent holding a defeated claim at 0.9). The web
  surfaces conflicts in the diagnostics bar with a distinct "conflict" chip.
