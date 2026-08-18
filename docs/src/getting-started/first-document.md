# Your first document

A ThoughtML document is a plain-text file (`.thml`) describing a piece of
reasoning. Let's write the smallest complete one and run it.

## Write it

Create `hello.thml`:

```thml
observation flat-loaf
  The Sunday sourdough came out of the oven flat.

hypothesis dead-starter
  The starter had lost its lift after three weeks unfed in the fridge.

link dead-starter causes flat-loaf

baker holds dead-starter
  confidence 0.8 estimated
```

Three things are happening:

1. **Two foci.** A *focus* is a thing you're reasoning about. The header word
   states what sort it is — an `observation` you made, a `hypothesis` about why —
   and the indented line under each is its prose *body*.
2. **A link.** `dead-starter causes flat-loaf` records a typed, directed
   relationship between them.
3. **A stance.** `baker holds dead-starter` says *who* believes *what*, the
   `confidence 0.8` says how strongly, and `estimated` says on what footing.

The bundled [`why-the-loaf-failed.thml`](../appendix/examples.md) is where this
goes next: three explanations proposed, one of them settled by evidence.

## Run it

```sh
thoughtml hello.thml
```

You'll get canonical JSON on stdout — the normalized object model, the
interchange form every implementation emits. Abbreviated:

```json
{
  "objects": [
    { "type": "focus", "id": "flat-loaf", "kind": "observation",
      "body": "The Sunday sourdough came out of the oven flat." },
    { "type": "focus", "id": "dead-starter", "kind": "hypothesis",
      "body": "The starter had lost its lift after three weeks unfed in the fridge." },
    { "type": "link", "id": "dead-starter-causes-flat-loaf",
      "from": "dead-starter", "relation": "causes", "to": "flat-loaf" },
    { "type": "stance", "id": "baker-holds-dead-starter",
      "agent": "baker", "posture": "holds", "target": "dead-starter",
      "confidence": { "kind": "number", "value": 0.8 }, "basis": "estimated" }
  ]
}
```

Notice the parser **gave every record an id** (`flat-loaf`,
`dead-starter-causes-flat-loaf`, …). Ids are how records reference each other.

## Check it

The document above is *clean* — no diagnostics. Break it on purpose: change the
link's target to a focus that doesn't exist.

```thml
link dead-starter causes flat-laof
```

Run it again and the parser warns on stderr:

```
warning: link.to of `dead-starter-causes-flat-laof` is an unresolved reference `flat-laof`
warning: focus `flat-loaf` is not connected to anything
```

Two warnings, not one: the typo also left the real `flat-loaf` with nothing
pointing at it. That second line is the parser noticing an *orphan* — a node that
earns no place in the argument.

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
