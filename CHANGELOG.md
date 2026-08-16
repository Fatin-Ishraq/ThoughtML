# Changelog

All notable changes to ThoughtML are recorded here. The project follows
[Semantic Versioning](https://semver.org). **v0.1.0** is the first public
release — real and usable, but the surface may still move.

## [Unreleased]

**Security release.** A security audit of the project found issues in the parser,
the viewer, the `thoughtml stream` server, and the release pipeline. **Everyone
should upgrade**; there is no configuration workaround for most of them.

Full detail is published separately as a GitHub Security Advisory, so that the
description and the fix do not arrive at the same time as an unpatched release.

### Security

- **Document content can no longer become markup.** A `quantity`'s unit and a
  question's `expects` / `status` were carried into the viewer's DOM without
  being constrained by the parser or escaped at the sink, so a document could
  execute script in anyone who opened it — in the playground, in a shared
  `--html` export, or in a browser watching a stream. Fixed at both layers: those
  fields are now lexically constrained, and the detail pane builds text nodes.
- **Malformed input can no longer abort the process.** Three passes recursed
  without a depth bound and could exhaust the stack, which is not recoverable and
  took down the stream server, the playground's worker, and any embedding host.
  All three are bounded and report a diagnostic instead.
- **Stream session records are private.** They were written to the shared system
  temp directory at default permissions while holding the tokens that gate a live
  session; they now live in a per-user directory, owner-only, and are validated
  when read back.
- **The stream server's network surface is narrower.** `Host` validation (DNS
  rebinding), loopback-only `/health`, an explicit `--expose-public` for public
  binds, constant-time token comparison, and a per-peer connection cap.
- **The release pipeline only publishes what this repository tagged.** The
  publish job's trigger, checkout ref, and script inputs are all constrained, and
  release archives are verified against the release's own checksums before being
  repackaged.
- **Bounded analysis.** The sensitivity pass is superlinear and is now skipped,
  with a warning, past a size limit — it was usable as a denial of service
  anywhere the compiler runs on someone else's document.
- A Content-Security-Policy on the playground and the standalone viewer, and
  complete escaping of payloads baked into `<script>` tags.

### Changed

- `thoughtml stream --host <public address>` now requires `--expose-public`.
  `--lan` and private/link-local addresses are unaffected.
- `/health` answers over loopback only.
- `SECURITY.md` states the actual threat model — a ThoughtML document is
  untrusted input — and what the stream link does and does not protect.

### Fixed

- The standalone viewer template is pinned to LF. Built on Windows it picked up
  CRLF, which made the byte-for-byte freshness guard impossible to satisfy.

## [0.4.0] — 2026-08-13

**Connected reasoning.** This release turns ThoughtML from a strong single-file
tool into a project-scale, observable reasoning workspace. It does not change the
language's core syntax; it makes imported reasoning easier to author, trace,
watch, and share.

### Added

- **Computer-hosted live streaming.** `thoughtml stream <entry.thml>` watches the
  entry file and its transitive imports, recompiles after settled edits, and
  serves a private, read-only viewer link from the editing computer. The safe
  default is loopback-only; `--lan` is explicit. `--json --events`, session
  status/stop commands, stable revision numbers, connected-viewer counts, and
  semantic activity records make the lifecycle friendly to autonomous agents.
- **A durable streaming protocol.** Invalid or half-written edits publish
  file-qualified diagnostics while the viewer retains the last valid graph.
  Complete versioned snapshots over Server-Sent Events keep clients simple and
  impossible to partially desynchronise. Input, connection, viewer, and header
  limits bound long-running sessions; viewer and local-control tokens are
  independent and generated from the operating system RNG.
- **Snapshot export from a live session.** A viewer can download the exact graph
  currently on screen as a self-contained HTML file. When the newest edit is
  invalid, the snapshot intentionally uses the named last-valid revision.
- **A real multi-file playground workspace.** Open a directory or a portable set
  of sibling `.thml` files; work in persistent tabs; create, rename, delete, and
  choose the entry file; search the project; save one file or all files; and
  export the project as a ZIP. The complete transitive import closure compiles
  into one unified graph in a Web Worker.
- **Disk and agent-edit safety.** Per-file dirty state, cursor/scroll/undo history,
  browser recovery, staged renames/deletions, external-change refresh, and
  explicit conflict choices prevent the browser from silently overwriting local
  or agent edits.
- **Authoritative project source maps.** The Rust compiler now reports the source
  module and line for every canonical object, including objects generated by the
  readable surface. Diagnostics and graph selections can jump to the exact file
  and line instead of reconstructing provenance in the UI.
- **Six-file Snake project.** `examples/snake-project/project.thml` demonstrates
  product, architecture, gameplay, quality, and release modules connected through
  namespaced imports. It is available as a one-click playground project and is
  validated by the native CLI.
- **Inline provenance drill-down.** An imported conclusion used by the entry
  project stays compact in the unified graph. Its Reasoning Card can reveal only
  the same-module supporting ancestry in place, then collapse it again. A quiet
  stacked-node/branch motif marks conclusions that have hidden reasoning.

### Changed

- **Semantic node silhouettes.** Observation, claim, hypothesis, option,
  decision, goal, outcome, memory, and assumption nodes now have distinct shapes
  shared by the Viewer, Structural graph, legend, stream, and standalone HTML.
  Text wrapping, shape-aware ports, obstacle-aware routing, and edge separation
  keep labels and arrows attached cleanly.
- **One universal Reasoning Card.** Playground selection, Follow narration, live
  streams, and standalone HTML now use the same compact floating surface. It
  begins with readable prose and a few high-signal facts, keeps technical detail
  behind progressive disclosure, shows the exact source location, and exposes
  reasoning expansion only when it is meaningful.
- **Project-aware standalone HTML.** Exported viewers carry compiler source maps
  alongside the canonical model, so imported nodes retain their provenance even
  without the source files or parser. Live snapshots use the same artifact shape.
- **The playground is responsive during project compilation.** Work is moved to a
  Web Worker, stale results are discarded, and the last valid graph remains
  visible while a newer edit compiles.

### Reliability and release engineering

- Rust formatting and Clippy with warnings denied are now enforced in CI, along
  with parser tests, workspace tests, the WebAssembly build, TypeScript checking,
  the production playground build, and a freshness guard for the generated
  single-file viewer embedded in the CLI.
- PyPI publishing now repackages cargo-dist release binaries into platform wheels
  and publishes through GitHub OIDC Trusted Publishing—no stored PyPI token.
- Source-map, recursive-import, stream lifecycle, invalid-edit retention,
  connection-bound, filesystem-workspace, and viewer-freshness behavior all have
  dedicated regression coverage.

### Compatibility

- No core ThoughtML record, relation, posture, field, or authoring syntax was
  removed or changed in v0.4.0. Existing v0.3.0 documents remain valid.
- Streaming is opt-in. Existing parse/check/fmt/explain/diff/guide and offline
  HTML workflows do not open a network connection.

## [0.3.0] — 2026-07-13

### Added

- **`thoughtml guide` — the language travels inside the binary.** The whole spec is
  embedded (`include_str!`) so a tool you just `cargo install`ed can teach itself, with no
  website and no network. Three shapes over one source (`crates/thoughtml/llms.txt`):
  - `thoughtml guide` — a one-screen tour (the 60-second model + a quick reference + a topic menu).
  - `thoughtml guide <topic>` — one section, by keyword (`relations`, `kinds`, `mirror`,
    `time`, `formulas`, …) or number.
  - `thoughtml guide --full` — the complete, source-derived spec, meant to be piped into an
    AI (`thoughtml guide --full | pbcopy`).
  The same file is served on the site at `/llms.txt` and bundled in the crate and npm
  packages, so the CLI, the site, and the AI-ready dump can never disagree.

### Changed

- **`llms.txt` rewritten and re-verified against parser source.** Now carries the exact
  compute mechanics (derived-confidence propagation, grounded argument status, decision
  expected value), the full diagnostic-code table (`TML101`–`TML501`), formulas and units,
  imports, and a **concept → example index** mapping every one of the 20 corpus documents to
  the construct it demonstrates. Moved from the repo root into the crate so it publishes with
  the package.

### Internal

- A conformance test (`corpus_covers_every_core_construct`) asserts every core kind, relation,
  and posture has a worked instance in the example corpus — so "the guide teaches the whole
  language" is enforced, not assumed. (`roadmap-priorities` gained an `assumption` and a
  `considers` to close the last two gaps.)

## [0.2.0] — 2026-07-13

### Added

- **Installable, not just cloneable.** `thoughtml` now ships as prebuilt binaries for
  macOS, Linux, and Windows — attached to each GitHub release, built by
  [`cargo-dist`](https://github.com/axodotdev/cargo-dist) — and as an **npm package**:
  `npm install -g thoughtml` puts the CLI on your `PATH` with no Rust toolchain
  required. Building from source (`cargo install` / `cargo build`) still works.
- **A subcommand CLI — the toolchain, not just a compiler.** `thoughtml` grows
  git-style subcommands; the bare `thoughtml <file> [--compute/--html/…]` invocation
  is unchanged and still the default.
  - **`check`** — validate and report diagnostics without emitting the model.
    `--json` gives each diagnostic a **stable code** (`TML1xx` vocabulary … `TML5xx`
    lints), line, and a suggested `help` fix (nearest-spelling for the "unknown
    &lt;thing&gt;" family — `supprts` → `supports`); `--lint` adds opinionated checks,
    starting with the **`supports`-used-as-a-list** detector (`TML501`) that catches
    the enumeration-inflates-confidence smell; `--strict` fails on any warning. The
    machine-readable stream is what an agent or editor self-corrects against.
  - **`fmt`** — rewrite a document in one canonical style (two-space indentation,
    a blank line between records, normalized field/body order). It re-parses its own
    output and refuses to write if the model would change, so formatting is always
    safe; `--check` (CI) and `-w` (in place). Comments are not yet preserved.
  - **`explain <id>`** — trace *why* a node reads the way it does: its derived
    confidence and grounded status, the evidence for and against it with each edge's
    `leverage`, the stances on it, the conflict it's caught in, and a one-line "why".
    Makes the mirror interrogable, not just declarative.
  - **`diff <a> <b>`** — a **semantic** diff at the belief level, not the text level:
    nodes added/removed, confidence and status changes (`in`→`out`), supersession,
    and the conflicts that appeared or resolved between two documents. Version
    control for reasoning. Install with `cargo install --path crates/thoughtml`.
- **Concise authoring surface (M1–M2) — less boilerplate, same model.** Pure sugar
  that desugars to the existing canonical model; every prior `.thml` still parses.
  - **Typed headers.** A built-in kind used as the header word — `observation foo`,
    `decision bar` — is shorthand for `focus foo` + `kind`.
  - **Optional time / narrative replay.** Time is no longer required to get a good
    view. A document with no real time spread reveals and lays out in **document
    order** (each node carries a `seq`), so authors stop inventing timestamps just
    to force an ordering; dated documents are unchanged.
  - **Evidence bundles.** A `<relation> <target>` header lists its sources, one per
    line (`supports claim` + members), each desugaring to an ordinary `link`.
  - On the ~1,200-line Netflix case study these cut the file **~40%** with an
    identical canonical model.
- **Collections & candidates (M3) — enumerations stop polluting the mirror.** Two
  non-evidential relations: **`part-of`** (a collection member) and
  **`candidate-for`** (a proposed answer to a question). Using `supports` to *list*
  a claim's parts silently inflated its derived confidence (a SWOT-summary read as
  100%-certain just for naming its items); `part-of` has no evidence polarity, so it
  never touches confidence, argument status, or leverage. The engine needed no
  change — non-`supports`/`opposes`/`undercuts` relations were already ignored by
  evidence propagation. The viewer renders them as a muted, subordinate `member`
  edge.
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

### Removed

- **Interactive what-if.** The playground's what-if control (mute a node/link and
  re-derive the counterfactual live) is gone, along with its wasm bridge
  (`parse_what_if`). It leaned oracle rather than mirror, never worked in the
  standalone viewer (it needs a live parser), and left the playground with a third
  control the docs already described as a two-lens spine. The underlying override
  engine (`Overrides` / `parse_str_with_overrides`) stays — it's the derive
  pipeline's spine and still powers **sensitivity / leverage**, which is unchanged.

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
