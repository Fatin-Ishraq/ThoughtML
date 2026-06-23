# The standalone viewer

The [playground](playground.md) is for *authoring*; the **standalone viewer** is
for *sharing*. `thoughtml --html` bakes a document into a single, self-contained
HTML file that opens in any browser — no server, no install, no network.

```sh
thoughtml decision-record.thml --html -o decision-record.html
```

Open the result and you get the same interactive graph the playground shows:
pan / zoom, hover spotlight, click a node for its detail, the lenses, the
readable / structural toggle, the as-of timeline, and light / dark — all running
on a model baked into the file. `--html` turns on the full
[mirror](../mirror/index.md) compute stack automatically, so the **evidence**,
**argument**, **sensitivity**, and **decision** lenses all have data to show.

## What's in the file

The exported artifact is the **canonical JSON** plus a small renderer, inlined
into one self-contained HTML file (~600 KB). There is **no WebAssembly and no
parser** inside it — parsing already happened when you ran the command. That is
why it is small, offline, and deterministic: it carries the *result*, not the
compiler. The fonts are the reader's system fonts, so nothing is fetched.

## A snapshot, by design

The viewer renders a *snapshot* of the model at export time. There is no live
re-parsing and no [what-if](playground.md#what-if) inside the file — re-run
`thoughtml --html` after editing the source to refresh it, the same way you would
recompile. (Live what-if is the one thing that needs the parser, so it stays in
the playground.)

## Which surface when

| You want to… | Use |
|---|---|
| Author live, experiment, what-if | the [playground](playground.md) |
| Check a document in CI or a script | `thoughtml doc.thml` → JSON + exit code |
| Hand someone a readable, interactive view | `thoughtml doc.thml --html -o doc.html` |

All three render the **same graph** from the **same parser** — one canonical
model, many faithful projections.
