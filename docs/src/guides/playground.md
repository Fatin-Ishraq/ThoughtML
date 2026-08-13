# Using the playground

The playground is a live editor and graph view — the fastest way to *see* a
ThoughtML document. It runs the exact same parser as the CLI, compiled to
WebAssembly, so the two never disagree.

### ▶ [Open the playground → fatin-ishraq.github.io/ThoughtML/playground](https://fatin-ishraq.github.io/ThoughtML/playground/)

No install — it runs entirely in your browser. To run it locally instead, see
[Installation](../getting-started/installation.md): `npm run wasm && npm run dev`.

> The playground is for **authoring** — live editing and examples. To
> *share* a finished document as a single self-contained interactive file (no
> server, opens anywhere), export it with
> [the standalone viewer](viewer.md): `thoughtml doc.thml --html -o doc.html`.

## The layout

- **Project editor** (left) — a file list, tabs, and code editor with ThoughtML
  syntax highlighting. The entry file and all of its sibling imports compile
  into the same graph; diagnostics appear on the correct file as you type.
- **Graph** (centre) — the document rendered interactively, in one of two
  surfaces:
  - **Viewer** (default) — a *time-driven* view: reasoning laid out along time
    (earlier beliefs left, later right), vertical position emerging from a force
    layout, with an as-of bar and replay. This is the same renderer the standalone
    [`--html` viewer](viewer.md) uses.
  - **Structural** — the classic node-link graph: foci as nodes (shaped by
    [kind](../reference/foci-and-kinds.md)), links as labelled arrows (styled by
    [relation](../reference/relations.md)), stances attached to their targets.
- **Reasoning Card** — click any node for a compact floating explanation: prose,
  high-signal status/confidence, connection count, and exact source. **Explore
  details** reveals the complete technical record without permanently consuming
  canvas space.
- **Example tray** — load any bundled example to explore it.

## Multi-file projects

The playground treats one directory of sibling `.thml` files as a project. A
repository can keep that directory at `.thoughtml/` so reasoning stays separate
from product source:

```text
snake-game/
├── src/
├── tests/
└── .thoughtml/
    ├── project.thml
    ├── product.thml
    ├── architecture.thml
    ├── gameplay.thml
    ├── quality.thml
    └── release.thml
```

The file marked **entry** owns the import declarations; imported nodes are
referenced by their namespace, exactly as in the native CLI:

```thml
import quality as quality

link quality.core-rules-are-stable supports ship-v1
```

- **Open folder** connects the editor to a real directory when the browser
  supports directory access. **Open files** remains the portable fallback.
- **New** creates a sibling file and inserts its import into the entry file.
- **Rename** updates import module names across the project while preserving
  aliases, so qualified references do not need to change.
- **Delete** reports dependent files before staging a removal. A project entry
  must be changed before it can be deleted.
- **Entry** makes the active tab the project root.
- **Save** writes the active file; **Save all** writes every dirty file and
  finishes staged renames/deletions. Without writable handles, these actions
  download a file or complete project ZIP instead.
- Dirty marks, open tabs, browser recovery state, cursor positions, per-file
  undo history, and scroll positions are kept separately for each file.
- `Ctrl+S` saves one file, `Ctrl+Shift+S` saves the project, `Ctrl+P` opens a
  file switcher, and `Ctrl+Shift+F` searches every project file.
- The sidebar reports missing imports, cycles, and files outside the entry's
  transitive import closure.
- Clicking a file-qualified diagnostic switches tabs and moves to its line.
- Clicking an authored graph node exposes its defining file and line in the
  Reasoning Card; that source chip navigates back to the editor. These locations
  come from the Rust compiler, including links generated from readable syntax.
- Imported conclusions with hidden supporting ancestry carry a subtle stacked
  marker and branch glyph. Select one and use **Expand reasoning** in the card to
  reveal only its same-module reasons inside the unified graph. The action then
  becomes **Collapse reasoning**, returning to the compact project overview.

Compilation runs in a Web Worker after a short debounce. The editor therefore
stays responsive and keeps showing the last valid graph while a newer project
version is compiling. The compiler still validates the complete transitive
import closure; the worker and stale-result cancellation avoid blocking or
displaying an older compilation after a newer edit.

When a connected directory changes outside the browser, **Refresh** compares it
with the last saved baseline. Clean files reload directly. If both the browser
and an external tool or AI agent changed the same file, the playground asks
whether to use disk, keep the editor version, or download both. It never silently
overwrites both sides of a conflict.

Press **Snake demo** for a real six-file repository example covering product
goals, architecture, gameplay, quality, and release reasoning. The same project
ships under `examples/snake-project/` and is native-CLI valid:

```sh
thoughtml --strict --strict-provenance examples/snake-project/project.thml
```

The browser workspace does not upload selected files. Directory permission is
granted by the user and scoped by the browser; a remembered handle is reused
only while that permission remains granted. The CLI remains the direct
filesystem workflow for agents working inside a repository:

```sh
thoughtml --strict --strict-provenance .thoughtml/project.thml
```

## The mirror is on by default

Unlike the CLI (where readings are opt-in), the playground turns the
display-relevant [mirror](../mirror/index.md) readings **on**, so you always see:

- [derived confidence](../mirror/derived-confidence.md) next to authored
  confidence,
- [argument status](../mirror/argument-status.md) on contested nodes,
- the [conflict report](../mirror/conflicts.md) when your structure disagrees with
  what you said.

This is why a document can look clean in the editor (no diagnostics) yet show a
conflict — exactly the [`ship-the-hotfix.thml`](../appendix/examples.md) case.

## Lenses

On the **Structural** surface, a lens recolours the whole graph to foreground one
reading:

- **Type** — colour by record/kind. The default, for reading structure.
- **Argument** — colour by `in` / `out` / `undecided`, to see what survives.

## Replay (the as-of bar)

For documents with [timestamps](../tutorial/time.md), the **Viewer** carries an
**as-of bar** built into the timeline. Press play (or drag it back) and the
reasoning replays moment by moment: beliefs fade in as of when they were asserted,
and revised-away or abandoned branches dim — so you can watch a conclusion form (or
fall apart) as evidence arrived. Try it on
[`launch-readiness.thml`](../appendix/examples.md) or
[`assistant-memory.thml`](../appendix/examples.md). The same projection is on the
CLI as [`--as-of`](cli.md#time-options-as-of-replay).

The playground keeps the visual lens set deliberately small—Type and Argument—
while the Reasoning Card surfaces derived confidence and other computed facts on
demand. The CLI exposes the full readings through `--derived`, `--status`,
`--sensitivity`, `--decisions`, and `--compute`.
