# Changelog

All notable changes to ThoughtML are recorded here. The project follows
[Semantic Versioning](https://semver.org). **v0.1.0** is the first public
release — real and usable, but the surface may still move.

## [Unreleased]

### Added

- **Memory & time overhaul (Phase A) — valid-time is now the backbone.** Five
  temporal primitives toward "version control for reasoning":
  - **Time spine.** The derived `timeline` now carries an ordered `events` array
    (`at`, `seq`, `id`, `kind`, optional `agent`), sorted by *valid-time* with a
    `seq` tiebreak — the document's reasoning as a sequence of moments, not the
    order you happened to type it.
  - **Tree-of-thought.** A `focus` or `question` can **contain** other records by
    nesting them (indentation); the members are recorded on `includes` and inherit
    the container's provenance/temporal context. A thought-tree, not a flat list.
  - **Lifecycle / fold.** A focus gains a first-class `status`:
    `open` / `settled` / `superseded` / `abandoned`. An abandoned branch is **kept
    with its reason**, not deleted, so dead ends stay inspectable.
  - **Keep-everything.** Redefining a focus with *differing* content no longer
    silently clobbers the first definition — every alternative is retained on
    `divergent` and surfaced as a `definition-divergence` conflict. Concurrent
    authoring is lossless.
  - **As-of replay.** `--as-of <instant>` (valid-time, the default axis) and
    `--as-of-seq <n>` (transaction order) project the model to a point in time,
    cascading to drop dangling links and stances to a fixpoint. Exposed in the
    library as `parse_str_as_of` / `AsOf`.
- **A second conflict type: `definition-divergence`** (warning). The mirror now
  flags a focus defined more than once with differing content — see above.
- **Standalone interactive viewer (`thoughtml --html`).** Bake any document into a
  single, self-contained HTML file — the interactive graph (pan/zoom, node detail,
  the lenses, the as-of timeline, light/dark) with the canonical model inlined and
  **no wasm and no server**. `--html` implies the full compute stack so every lens
  has data. The graph is now an *output of the toolchain*, alongside JSON.

### Changed

- **The viewer is now a time-driven reasoning view (Track D).** The playground's
  "Readable" surface is replaced by a **Viewer** that lays reasoning out along
  time — earlier beliefs to the left, later to the right — with vertical position
  emerging from a force layout rather than fixed lanes, and a built-in **replay**
  (drag the as-of bar, or press play) that fades beliefs in as of when they were
  asserted. "Structural" stays as the node-link view. The same time-driven
  renderer (`timeview.ts`, dependency-free SVG) drives the standalone `--html`
  export, so both render identically.
- **The renderer is a wasm-free core.** The graph/detail/legend projection was
  split from the wasm parser (a pure `model.ts` type seam), so the same renderer
  drives both the playground and the standalone viewer — they can't drift. The
  viewer ships with **system fonts** (no inlined web fonts), keeping each exported
  file small. A CI freshness guard rebuilds the viewer template and fails if the
  committed copy drifts, so `cargo build` still needs no Node.

## [0.1.0] — 2026-06-19

The first release is a *subtraction*. ThoughtML had been built up across many
phases — typed reasoning, defeasible evidence, temporal revision, an opt-in
compute layer — and v0.1.0 deliberately cuts it back to its spine: a **mirror
that shows the conflict, not an oracle that hands down a verdict**.

### Removed

- **Oracle outputs.** A decision no longer reports a `best` option or a `margin`.
  The engine still orders options by expected value as a *second reading*, but it
  crowns no winner — the choice stays with the reader.
- **Redundant relations.** `rejects` and `mitigates` are gone; both merely
  duplicated `opposes`. A hard rejection is `opposes`; defending X is attacking
  X's attacker (`guard opposes risk`), reinstated uniformly by the grounded
  status. The core relation set is down from 14 to 12.
- **Strength adverbs.** `strongly` / `weakly` are gone. Each smuggled in a magic
  number (0.85 / 0.30) the author never chose. Strength is now expressed by the
  single, explicit numeric `weight` field.

### Changed

- **The compute layer is no longer framed as "executable."** Quantities,
  formulas, and expected value remain — opt-in and off by default — but as a
  *second reading* of the author's numbers, not a program the document runs.
- **Profiles, imports, and namespaces are now advanced/optional.** They remain
  implemented and tested, just out of the core story. (The README had wrongly
  listed them as "not yet implemented" — they shipped on the v0.2 track.)
- **The playground is curated to a spine** of ten examples and two lenses
  (Type, Argument). The compute and multi-document demos, and the
  Evidence/Load/Decision lenses, are parked — not deleted.

### Added

- **Number provenance.** An authored number may declare its basis inline:
  `measured` / `estimated` / `assumed` — e.g. `confidence 0.9 assumed`,
  `quantity 30 GB measured`, `weight 0.85 measured`. Optional and non-breaking;
  an opt-in `--strict-provenance` lint flags numbers that omit it. This closes
  the gap the strength adverbs left: a number no longer passes as fact without
  saying on what footing it stands.

### Notes

- The reference parser ships with 171 passing tests; every bundled example is
  strict-clean (zero errors **and** zero warnings) under default options.
- Opt-in derived fields stay off by default for stable CLI output; the
  playground turns them on.

## Earlier (pre-0.1.0, v0.2 development track)

Before the subtraction, the language was built up in phases: typed foci and
relations; defeasible evidence with derived confidence; grounded argument
status; temporal assertion and revision (as-of views); a
quantities / formulas / expected-value compute layer; nested scopes, profiles,
and imports with namespaces; and the first mirror output — an opt-in conflict
report (`confidence-vs-status`). Those capabilities still ship in v0.1.0, behind
opt-in flags; see the [documentation](docs/) for the language as it stands today.
