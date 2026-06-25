# Using the playground

The playground is a live editor and graph view — the fastest way to *see* a
ThoughtML document. It runs the exact same parser as the CLI, compiled to
WebAssembly, so the two never disagree.

To run it locally, see [Installation](../getting-started/installation.md):
`npm run wasm && npm run dev`.

> The playground is for **authoring** — live editing, examples, and what-if. To
> *share* a finished document as a single self-contained interactive file (no
> server, opens anywhere), export it with
> [the standalone viewer](viewer.md): `thoughtml doc.thml --html -o doc.html`.

## The layout

- **Editor** (left) — a code editor with ThoughtML syntax highlighting and a
  lint gutter. Diagnostics appear inline as you type.
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

## The mirror is on by default

Unlike the CLI (where readings are opt-in), the playground turns the
display-relevant [mirror](../mirror/index.md) readings **on**, so you always see:

- [derived confidence](../mirror/derived-confidence.md) next to authored
  confidence,
- [argument status](../mirror/argument-status.md) on contested nodes,
- the [conflict report](../mirror/conflicts.md) when your structure disagrees with
  what you said.

This is why a document can look clean in the editor (no diagnostics) yet show a
conflict — exactly the [`self-audit.thml`](../appendix/examples.md) case.

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
[`build-tetris.thml`](../appendix/examples.md) or
[`estimate-revised.thml`](../appendix/examples.md). The same projection is on the
CLI as [`--as-of`](cli.md#time-options-as-of-replay).

## What-if

Mute a node or link and the whole computed stack — derived confidence, status,
leverage, [expected value](../mirror/compute.md) — recomputes live, so you can ask
"what if this evidence weren't here?" without editing the document. This is the
interactive face of [sensitivity](../mirror/compute.md#sensitivity).

> **Note.** The playground curates a **spine** of ten examples and the two lenses
> above for v0.1.0. The compute and multi-document demos and additional lenses are
> parked, not deleted — the CLI exposes the full set of readings via flags.
