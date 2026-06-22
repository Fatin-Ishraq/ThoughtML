# Your first document

A ThoughtML document is a plain-text file (`.thml`) describing a piece of
reasoning. Let's write the smallest complete one and run it.

## Write it

Create `hello.thml`:

```thml
focus metric-shift
  Activation rose 12% after the Tuesday deploy.

focus deploy-change
  The Tuesday deploy changed the sign-up flow.

link deploy-change causes metric-shift

team holds metric-shift
  confidence 0.8
```

Three things are happening:

1. **Two foci.** A *focus* is a thing you're reasoning about — here, an
   observation and a possible cause. The indented line under each is its prose
   *body*.
2. **A link.** `deploy-change causes metric-shift` records a typed, directed
   relationship between them.
3. **A stance.** `team holds metric-shift` says *who* believes *what*, and the
   `confidence 0.8` says how strongly.

## Run it

```sh
thoughtml hello.thml
```

You'll get canonical JSON on stdout — the normalized object model, the
interchange form every implementation emits. Abbreviated:

```json
{
  "objects": [
    { "type": "focus", "id": "metric-shift", "body": "Activation rose 12% after the Tuesday deploy." },
    { "type": "focus", "id": "deploy-change", "body": "The Tuesday deploy changed the sign-up flow." },
    { "type": "link", "id": "deploy-change-causes-metric-shift",
      "from": "deploy-change", "relation": "causes", "to": "metric-shift" },
    { "type": "stance", "id": "team-holds-metric-shift",
      "agent": "team", "posture": "holds", "target": "metric-shift",
      "confidence": { "kind": "number", "value": 0.8 } }
  ]
}
```

Notice the parser **gave every record an id** (`metric-shift`,
`deploy-change-causes-metric-shift`, …). Ids are how records reference each
other.

## Check it

The document above is *clean* — no diagnostics. Break it on purpose: change the
link's target to a focus that doesn't exist.

```thml
link deploy-change causes metric-shfit
```

Run it again and the parser warns on stderr:

```
warning: link.to of `deploy-change-causes-metric-shfit` is an unresolved reference `metric-shfit`
```

This is the everyday loop: write reasoning, run it, fix what the parser flags.
[Diagnostics](../reference/diagnostics.md) catch the structural mistakes —
dangling references, contradictions, cycles, orphans.

## See it as a graph

Open the same file in the [playground](../guides/playground.md) and it renders
as a graph: foci as nodes (shaped by kind), links as labeled arrows, stances
attached to their targets. The whole point of ThoughtML is that you can *read the
argument straight from the picture*.

## Next

Start the [tutorial](../tutorial/index.md), which builds one real document up
from a single focus to a full argument the [mirror](../mirror/index.md) can
audit.
