# Using the playground

The playground is a live editor and graph view — the fastest way to *see* a
ThoughtML document. It runs the exact same parser as the CLI, compiled to
WebAssembly, so the two never disagree.

To run it locally, see [Installation](../getting-started/installation.md):
`npm run wasm && npm run dev`.

## The layout

- **Editor** (left) — a code editor with ThoughtML syntax highlighting and a
  lint gutter. Diagnostics appear inline as you type.
- **Graph** (centre) — the document rendered as an interactive graph. Foci are
  nodes (shaped by [kind](../reference/foci-and-kinds.md)), links are labelled
  arrows (styled by [relation](../reference/relations.md)), stances attach to
  their targets.
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

A lens recolours the whole graph to foreground one reading:

- **Type** — colour by record/kind. The default, for reading structure.
- **Argument** — colour by `in` / `out` / `undecided`, to see what survives.

## The as-of slider

For documents with [timestamps](../tutorial/time.md), an **as-of slider** replays
the reasoning over time. Drag it back and beliefs asserted later disappear, while
revised-away beliefs un-dim — so you can watch a conclusion form (or fall apart)
as evidence arrived. Try it on [`estimate-revised.thml`](../appendix/examples.md).

## What-if

Mute a node or link and the whole computed stack — derived confidence, status,
leverage, [expected value](../mirror/compute.md) — recomputes live, so you can ask
"what if this evidence weren't here?" without editing the document. This is the
interactive face of [sensitivity](../mirror/compute.md#sensitivity).

> **Note.** The playground curates a **spine** of ten examples and the two lenses
> above for v0.1.0. The compute and multi-document demos and additional lenses are
> parked, not deleted — the CLI exposes the full set of readings via flags.
