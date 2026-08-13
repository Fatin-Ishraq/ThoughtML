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
- **Detail panel** — click any node to see its facts: body, fields, authored
  numbers, and the mirror's derived values **beside** them (never merged).
- **Example tray** — load any bundled example to explore it.

## Multi-file projects

The playground treats a group of sibling `.thml` files as one project. The file
marked **entry** owns the import declarations; imported nodes are referenced by
their namespace, exactly as in the native CLI:

```thml
import quality as quality

link quality.core-rules-are-stable supports ship-v1
```

- **Open** selects one or more local `.thml` files. `project.thml` becomes the
  entry when present; otherwise the first selected filename does.
- **New** creates a sibling file and inserts its import into the entry file.
- **Set entry** makes the active tab the project root when it is not named
  `project.thml`.
- **Download** saves the active browser copy as a `.thml` file.
- Every edit is persisted in browser storage and recompiles the complete import
  closure after a short debounce.
- Clicking a file-qualified diagnostic switches tabs and moves to its line.
- Clicking an authored graph node exposes its defining file and line in the
  detail header; that source chip navigates back to the editor.

Press **Snake demo** for a real six-file repository example covering product
goals, architecture, gameplay, quality, and release reasoning. The same project
ships under `examples/snake-project/` and is native-CLI valid:

```sh
thoughtml --strict --strict-provenance examples/snake-project/project.thml
```

The browser workspace does not upload the selected files. Browser edits are
local workspace copies until they are downloaded; the CLI remains the direct
filesystem workflow for agents working inside a repository.

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
[`launch-readiness.thml`](../appendix/examples.md). The same projection is on the
CLI as [`--as-of`](cli.md#time-options-as-of-replay).

> **Note.** The playground curates a **spine** of ten examples and the two lenses
> above for v0.1.0. The compute and multi-document demos and additional lenses are
> parked, not deleted — the CLI exposes the full set of readings via flags.
