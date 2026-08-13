# The standalone viewer

The [playground](playground.md) is for *authoring*; the **standalone viewer** is
for *sharing*. `thoughtml --html` bakes a document into a single, self-contained
HTML file that opens in any browser — no server, no install, no network.

```sh
thoughtml choose-datastore.thml --html -o decision-record.html
```

Open the result and you get the same **time-driven view** the playground shows
under "Viewer": semantic node silhouettes, clean relation routing, reasoning laid
out along time (earlier left, later right), pan / zoom, an **as-of bar with
replay**, and light / dark—all running on a model baked into the file. Click a
node for the same floating Reasoning Card used by the playground and live stream:
readable prose first, source provenance and high-signal facts next, complete
technical detail on demand. Press play (or drag the bar) and beliefs fade in as
of when they were asserted. `--html` turns on the full
[mirror](../mirror/index.md) compute stack automatically, so the derived readings
have data to show.

For a compiled multi-file project, imported conclusions can be expanded directly
inside the unified graph. The stacked-node/branch marker means supporting module
reasoning is folded behind the conclusion; **Expand reasoning** reveals it and
**Collapse reasoning** restores the overview. The source map stays in the HTML,
so the card can identify `quality.thml:18` even though the source text and parser
are not embedded.

## What's in the file

The exported artifact is the **canonical JSON**, its project source map, and a
small renderer, inlined into one self-contained HTML file (~600 KB). There is
**no WebAssembly and no parser** inside it—parsing already happened when you ran the command. That is
why it is small, offline, and deterministic: it carries the *result*, not the
compiler. The fonts are the reader's system fonts, so nothing is fetched.

## A snapshot, by design

The viewer renders a *snapshot* of the model at export time. There is no live
re-parsing inside the file — re-run `thoughtml --html` after editing the source to
refresh it, the same way you would recompile.

## Which surface when

| You want to… | Use |
|---|---|
| Author live, edit, experiment | the [playground](playground.md) |
| Check a document in CI or a script | `thoughtml doc.thml` → JSON + exit code |
| Hand someone an interactive, time-driven view | `thoughtml doc.thml --html -o doc.html` |
| Observe a changing local project | [`thoughtml stream`](streaming.md) |

Every surface renders from the **same parser** and the **same time-driven
renderer**—one canonical model, many faithful projections.
